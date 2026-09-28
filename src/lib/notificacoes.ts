import { useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { getUsuarioLogado } from "./auth";

// Central de notificações do usuário logado (geradas por gatilhos no banco).
// Tempo real quando disponível + atualização periódica como garantia.

export interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  dados: Record<string, unknown> | null;
  lida_em: string | null;
  created_at: string;
}

interface EstadoNotificacoes {
  itens: Notificacao[];
  carregado: boolean;
}

const LIMITE = 40;
const INTERVALO_MS = 60_000;

let estado: EstadoNotificacoes = { itens: [], carregado: false };
const ouvintes = new Set<() => void>();
const ouvintesNovas = new Set<(n: Notificacao) => void>();
let donoAtual: string | null = null;
let canal: RealtimeChannel | null = null;
let intervalo: ReturnType<typeof setInterval> | null = null;

function definir(novo: EstadoNotificacoes) {
  estado = novo;
  ouvintes.forEach((f) => f());
}

async function buscar() {
  const usuario = getUsuarioLogado();
  if (!usuario) return;
  const { data, error } = await supabase
    .from("notificacoes")
    .select("id, tipo, titulo, mensagem, link, dados, lida_em, created_at")
    .order("created_at", { ascending: false })
    .limit(LIMITE);
  if (error || !data || getUsuarioLogado()?.id !== usuario.id) return;

  const conhecidas = new Set(estado.itens.map((n) => n.id));
  const novas = estado.carregado ? (data as Notificacao[]).filter((n) => !conhecidas.has(n.id) && !n.lida_em) : [];
  definir({ itens: data as Notificacao[], carregado: true });
  novas.reverse().forEach((n) => ouvintesNovas.forEach((f) => f(n)));
}

function parar() {
  if (canal) supabase.removeChannel(canal);
  canal = null;
  if (intervalo) clearInterval(intervalo);
  intervalo = null;
}

/** Liga (ou troca) o acompanhamento para o usuário logado. Chamado pelo layout. */
export function acompanharNotificacoes(funcionarioId: string | null) {
  if (funcionarioId === donoAtual) return;
  parar();
  donoAtual = funcionarioId;
  definir({ itens: [], carregado: false });
  if (!funcionarioId) return;

  buscar();
  intervalo = setInterval(buscar, INTERVALO_MS);
  canal = supabase
    .channel(`notificacoes-${funcionarioId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notificacoes", filter: `funcionario_id=eq.${funcionarioId}` },
      () => buscar(),
    )
    .subscribe();
}

export async function marcarComoLida(id: string) {
  const agora = new Date().toISOString();
  definir({ ...estado, itens: estado.itens.map((n) => (n.id === id && !n.lida_em ? { ...n, lida_em: agora } : n)) });
  await supabase.from("notificacoes").update({ lida_em: agora }).eq("id", id).is("lida_em", null);
}

export async function marcarTodasComoLidas() {
  const agora = new Date().toISOString();
  const ids = estado.itens.filter((n) => !n.lida_em).map((n) => n.id);
  if (ids.length === 0) return;
  definir({ ...estado, itens: estado.itens.map((n) => (n.lida_em ? n : { ...n, lida_em: agora })) });
  await supabase.from("notificacoes").update({ lida_em: agora }).is("lida_em", null);
}

export async function excluirNotificacao(id: string) {
  definir({ ...estado, itens: estado.itens.filter((n) => n.id !== id) });
  await supabase.from("notificacoes").delete().eq("id", id);
}

export const recarregarNotificacoes = buscar;

/** Avisa quando chega uma notificação nova (para toast/som). */
export function aoChegarNotificacao(f: (n: Notificacao) => void) {
  ouvintesNovas.add(f);
  return () => {
    ouvintesNovas.delete(f);
  };
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}

const VAZIO: EstadoNotificacoes = { itens: [], carregado: false };

export function useNotificacoes() {
  const atual = useSyncExternalStore(assinar, () => estado, () => VAZIO);
  return { ...atual, naoLidas: atual.itens.filter((n) => !n.lida_em).length };
}
