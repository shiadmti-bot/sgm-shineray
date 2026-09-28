import { useMemo, useSyncExternalStore } from "react";

// --- Tipos e constantes de sessão ---

export type Cargo = "master" | "gestor" | "supervisor" | "montador";

export interface UsuarioSessao {
  id: string;
  nome: string;
  cargo: Cargo;
  matricula?: string | null;
  email?: string | null;
  ativo?: boolean;
  /** Epoch (ms) em que a sessão expira. */
  expiraEm?: number;
}

const CHAVE_SESSAO = "sgm_user";
const EVENTO_SESSAO = "sgm:sessao";

/** Uma sessão dura um turno estendido; depois disso o login é exigido novamente. */
export const DURACAO_SESSAO_MS = 12 * 60 * 60 * 1000;

export const CARGOS_ADMIN: Cargo[] = ["master", "gestor"];
export const CARGOS_GESTAO: Cargo[] = ["master", "gestor", "supervisor"];

export const ROTULO_CARGO: Record<Cargo, string> = {
  master: "Master",
  gestor: "Gestor",
  supervisor: "Supervisor",
  montador: "Montador",
};

// Somente estes campos podem ficar no navegador. Em especial, a senha/PIN NUNCA é persistida.
function sanitizar(bruto: Record<string, unknown>): UsuarioSessao {
  return {
    id: String(bruto.id ?? ""),
    nome: String(bruto.nome ?? ""),
    cargo: String(bruto.cargo ?? "").toLowerCase() as Cargo,
    matricula: (bruto.matricula as string | null | undefined) ?? null,
    email: (bruto.email as string | null | undefined) ?? null,
    ativo: bruto.ativo === undefined ? true : Boolean(bruto.ativo),
    expiraEm: typeof bruto.expiraEm === "number" ? bruto.expiraEm : undefined,
  };
}

function notificarMudanca() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_SESSAO));
}

/** Converte o JSON salvo em uma sessão válida (sem efeitos colaterais). */
export function interpretarSessao(raw: string | null): UsuarioSessao | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.id) return null;
    const sessao = sanitizar(parsed);
    if (sessao.expiraEm && sessao.expiraEm < Date.now()) return null;
    return sessao;
  } catch {
    return null;
  }
}

export function salvarSessao(funcionario: Record<string, unknown>): UsuarioSessao {
  const sessao: UsuarioSessao = { ...sanitizar(funcionario), expiraEm: Date.now() + DURACAO_SESSAO_MS };
  localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
  notificarMudanca();
  return sessao;
}

export function atualizarSessao(parcial: Partial<UsuarioSessao>) {
  const atual = getUsuarioLogado();
  if (!atual) return;
  localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ ...atual, ...parcial }));
  notificarMudanca();
}

export function encerrarSessao() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CHAVE_SESSAO);
  notificarMudanca();
}

/**
 * Lê o usuário logado. Também migra sessões antigas, que guardavam a senha em texto puro,
 * e encerra sessões expiradas.
 */
export function getUsuarioLogado(): UsuarioSessao | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(CHAVE_SESSAO);
  if (!raw) return null;

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!parsed || !parsed.id) {
    encerrarSessao();
    return null;
  }

  const sessao = sanitizar(parsed);
  if (sessao.expiraEm && sessao.expiraEm < Date.now()) {
    encerrarSessao();
    return null;
  }

  const precisaRegravar = "senha" in parsed || !sessao.expiraEm;
  if (precisaRegravar) {
    sessao.expiraEm = sessao.expiraEm ?? Date.now() + DURACAO_SESSAO_MS;
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
  }
  return sessao;
}

export function temCargo(usuario: UsuarioSessao | null | undefined, cargos: readonly string[]): boolean {
  if (!usuario) return false;
  if (usuario.cargo === "master") return true;
  return cargos.includes(usuario.cargo);
}

/** Página inicial de cada perfil (usada no login e quando o acesso a uma tela é negado). */
export function rotaInicialDoCargo(cargo?: string | null): string {
  switch (cargo) {
    case "montador":
      return "/montagem";
    case "supervisor":
      return "/qualidade";
    case "gestor":
    case "master":
      return "/dashboard";
    default:
      return "/login";
  }
}

// --- Hooks ---

function assinarSessao(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENTO_SESSAO, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENTO_SESSAO, callback);
  };
}

const lerSessaoBruta = () => localStorage.getItem(CHAVE_SESSAO);
const lerSessaoServidor = () => null;

/** Usuário logado, reativo a login/logout (inclusive em outras abas). `null` no servidor. */
export function useUsuarioLogado(): UsuarioSessao | null {
  const raw = useSyncExternalStore(assinarSessao, lerSessaoBruta, lerSessaoServidor);
  // A string bruta é estável entre leituras; o objeto só é recriado quando ela muda.
  return useMemo(() => interpretarSessao(raw), [raw]);
}

const assinarNada = () => () => {};

/** `true` somente após a hidratação no navegador (evita divergência SSR/cliente). */
export function useHidratado(): boolean {
  return useSyncExternalStore(assinarNada, () => true, () => false);
}
