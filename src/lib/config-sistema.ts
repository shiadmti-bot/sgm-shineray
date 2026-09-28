import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import {
  CHECKLIST_MONTAGEM_PADRAO,
  CORES_BANCO_PADRAO,
  CORES_CARENAGEM_PADRAO,
  type CorCatalogo,
} from "./constantes";

// Configurações do sistema ficam na tabela `configuracoes_sistema` (compartilhadas entre
// todas as estações). Se a tabela ainda não foi criada — ver supabase/migrations — ou o
// servidor estiver indisponível, o sistema usa uma cópia local do navegador.

export const TABELA_CONFIG = "configuracoes_sistema";
const PREFIXO_LOCAL = "sgm_cfg_";
const TTL_CACHE_MS = 60_000;

export type OrigemConfig = "servidor" | "local" | "padrao";

export interface ResultadoConfig<T> {
  valor: T;
  origem: OrigemConfig;
  /** A tabela não existe no Supabase: a migração SQL ainda não foi executada. */
  tabelaAusente: boolean;
}

export interface ResultadoSalvar {
  origem: "servidor" | "local";
  tabelaAusente: boolean;
  erro?: string;
}

function erroTabelaAusente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const msg = (error.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("could not find the table");
}

function lerLocal<T>(chave: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PREFIXO_LOCAL + chave);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function gravarLocal(chave: string, valor: unknown) {
  try {
    localStorage.setItem(PREFIXO_LOCAL + chave, JSON.stringify(valor));
  } catch {
    // Armazenamento cheio ou bloqueado: segue apenas com o servidor.
  }
}

export async function carregarConfig<T>(chave: string, padrao: T): Promise<ResultadoConfig<T>> {
  let tabelaAusente = false;
  try {
    const { data, error } = await supabase.from(TABELA_CONFIG).select("valor").eq("chave", chave).maybeSingle();
    if (!error && data && data.valor != null) {
      gravarLocal(chave, data.valor);
      return { valor: data.valor as T, origem: "servidor", tabelaAusente: false };
    }
    if (error) tabelaAusente = erroTabelaAusente(error);
  } catch {
    // Sem conexão: cai para a cópia local.
  }
  const local = lerLocal<T>(chave);
  if (local != null) return { valor: local, origem: "local", tabelaAusente };
  return { valor: padrao, origem: "padrao", tabelaAusente };
}

export async function salvarConfig<T>(chave: string, valor: T, usuario?: string | null): Promise<ResultadoSalvar> {
  gravarLocal(chave, valor);
  try {
    const { error } = await supabase.from(TABELA_CONFIG).upsert(
      { chave, valor, atualizado_por: usuario ?? null, updated_at: new Date().toISOString() },
      { onConflict: "chave" }
    );
    if (!error) return { origem: "servidor", tabelaAusente: false };
    return { origem: "local", tabelaAusente: erroTabelaAusente(error), erro: error.message };
  } catch (e) {
    return { origem: "local", tabelaAusente: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

// --- Configuração geral (produção, checklist, catálogos) ---

export interface ModeloExtra {
  /** Código VDS: posições 4 a 9 do chassi (ex.: NJ1125). */
  vds: string;
  modelo: string;
}

export interface ConfigGeral {
  metaDiaria: number;
  /** Acima deste tempo uma montagem ativa é destacada como atrasada. */
  limiteMontagemMin: number;
  /** Acima deste tempo uma pausa é destacada no painel. */
  limitePausaMin: number;
  /** Acima desta quantidade a fila de inspeção vira alerta. */
  limiteFilaQA: number;
  checklist: string[];
  coresCarenagem: CorCatalogo[];
  coresBanco: CorCatalogo[];
  modelosExtras: ModeloExtra[];
}

export const CONFIG_GERAL_PADRAO: ConfigGeral = {
  metaDiaria: 35,
  limiteMontagemMin: 90,
  limitePausaMin: 30,
  limiteFilaQA: 10,
  checklist: CHECKLIST_MONTAGEM_PADRAO,
  coresCarenagem: CORES_CARENAGEM_PADRAO,
  coresBanco: CORES_BANCO_PADRAO,
  modelosExtras: [],
};

function numeroValido(v: unknown, padrao: number, min = 0): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? n : padrao;
}

function listaCores(v: unknown, padrao: CorCatalogo[]): CorCatalogo[] {
  if (!Array.isArray(v)) return padrao;
  const itens = v
    .filter((c) => c && typeof c.nome === "string" && c.nome.trim())
    .map((c) => ({
      nome: String(c.nome).trim(),
      descricao: c.descricao ? String(c.descricao) : undefined,
      hex: /^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : "#94a3b8",
    }));
  return itens.length ? itens : padrao;
}

export function normalizarConfigGeral(bruto: unknown): ConfigGeral {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const checklist = Array.isArray(b.checklist)
    ? b.checklist.map((i) => String(i).trim()).filter(Boolean)
    : CONFIG_GERAL_PADRAO.checklist;
  const extras = Array.isArray(b.modelosExtras)
    ? (b.modelosExtras as ModeloExtra[])
        .filter((m) => m && typeof m.vds === "string" && typeof m.modelo === "string")
        .map((m) => ({ vds: m.vds.trim().toUpperCase(), modelo: m.modelo.trim() }))
        .filter((m) => m.vds.length === 6 && m.modelo)
    : [];
  return {
    metaDiaria: numeroValido(b.metaDiaria, CONFIG_GERAL_PADRAO.metaDiaria, 1),
    limiteMontagemMin: numeroValido(b.limiteMontagemMin, CONFIG_GERAL_PADRAO.limiteMontagemMin, 1),
    limitePausaMin: numeroValido(b.limitePausaMin, CONFIG_GERAL_PADRAO.limitePausaMin, 1),
    limiteFilaQA: numeroValido(b.limiteFilaQA, CONFIG_GERAL_PADRAO.limiteFilaQA, 1),
    checklist: checklist.length ? checklist : CONFIG_GERAL_PADRAO.checklist,
    coresCarenagem: listaCores(b.coresCarenagem, CORES_CARENAGEM_PADRAO),
    coresBanco: listaCores(b.coresBanco, CORES_BANCO_PADRAO),
    modelosExtras: extras,
  };
}

let cacheGeral: { promessa: Promise<ResultadoConfig<ConfigGeral>>; em: number } | null = null;

export function carregarConfigGeral(forcar = false): Promise<ResultadoConfig<ConfigGeral>> {
  if (!cacheGeral || forcar || Date.now() - cacheGeral.em > TTL_CACHE_MS) {
    const promessa = carregarConfig<unknown>("geral", CONFIG_GERAL_PADRAO).then((r) => ({
      ...r,
      valor: normalizarConfigGeral(r.valor),
    }));
    cacheGeral = { promessa, em: Date.now() };
  }
  return cacheGeral.promessa;
}

export async function salvarConfigGeral(config: ConfigGeral, usuario?: string | null) {
  const resultado = await salvarConfig("geral", normalizarConfigGeral(config), usuario);
  cacheGeral = null;
  return resultado;
}

export function useConfigGeral() {
  const [estado, setEstado] = useState<ResultadoConfig<ConfigGeral>>({
    valor: CONFIG_GERAL_PADRAO,
    origem: "padrao",
    tabelaAusente: false,
  });
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    carregarConfigGeral().then((r) => {
      if (!ativo) return;
      setEstado(r);
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const recarregar = useCallback(async () => {
    const r = await carregarConfigGeral(true);
    setEstado(r);
    return r;
  }, []);

  return { config: estado.valor, origem: estado.origem, tabelaAusente: estado.tabelaAusente, carregando, recarregar };
}
