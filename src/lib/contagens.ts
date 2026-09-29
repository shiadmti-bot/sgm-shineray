import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// Quantas motos há em cada estação agora (menu lateral e cabeçalho).
// Atualiza a cada 30 s enquanto houver alguém logado.

export interface ContagensLinha {
  fila: number;
  montagem: number;
  pausadas: number;
  qualidade: number;
  avarias: number;
  retrabalho: number;
  etiqueta: number;
  estoque: number;
  atualizadoEm: number | null;
}

const VAZIO: ContagensLinha = { fila: 0, montagem: 0, pausadas: 0, qualidade: 0, avarias: 0, retrabalho: 0, etiqueta: 0, estoque: 0, atualizadoEm: null };
const INTERVALO_MS = 30_000;

let estado: ContagensLinha = VAZIO;
const ouvintes = new Set<() => void>();
let intervalo: ReturnType<typeof setInterval> | null = null;

const base = () => supabase.from("motos").select("*", { count: "exact", head: true });

async function buscar() {
  const [fila, montagem, pausadas, qualidade, avarias, retrabalho, etiqueta, estoque] = await Promise.all([
    base().eq("status", "aguardando_montagem"),
    base().eq("status", "em_producao"),
    base().eq("status", "pausado"),
    base().eq("status", "em_analise"),
    base().like("status", "avaria_%"),
    base().eq("status", "retrabalho_montagem"),
    base().eq("status", "aguardando_etiqueta"),
    base().eq("status", "estoque"),
  ]);
  if ([fila, montagem, qualidade].some((r) => r.error)) return;
  estado = {
    fila: fila.count ?? 0,
    montagem: montagem.count ?? 0,
    pausadas: pausadas.count ?? 0,
    qualidade: qualidade.count ?? 0,
    avarias: avarias.count ?? 0,
    retrabalho: retrabalho.count ?? 0,
    etiqueta: etiqueta.count ?? 0,
    estoque: estoque.count ?? 0,
    atualizadoEm: Date.now(),
  };
  ouvintes.forEach((f) => f());
}

/** Liga/desliga a atualização periódica (chamado pelo layout conforme a sessão). */
export function acompanharContagens(ativo: boolean) {
  if (ativo && !intervalo) {
    buscar();
    intervalo = setInterval(buscar, INTERVALO_MS);
  } else if (!ativo && intervalo) {
    clearInterval(intervalo);
    intervalo = null;
    estado = VAZIO;
    ouvintes.forEach((f) => f());
  }
}

export const recarregarContagens = buscar;

/** Recarrega só se a última leitura tiver mais de `idadeMs` (troca de tela, volta à aba). */
export function atualizarContagensSeAntigas(idadeMs = 10_000) {
  if (!intervalo) return;
  if (!estado.atualizadoEm || Date.now() - estado.atualizadoEm > idadeMs) buscar();
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}

export function useContagensLinha(): ContagensLinha {
  return useSyncExternalStore(assinar, () => estado, () => VAZIO);
}
