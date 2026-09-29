import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { pode, type Autorizavel, type Permissao } from "./rbac/permissoes";
import { senhaDoPin } from "./rbac/credenciais";

// Sessão da V2: login pelo Supabase Auth + perfil de acesso (RBAC) vindo do banco (RPC meu_perfil).
// O banco aplica as mesmas permissões via RLS; aqui elas servem para montar menus, telas e botões.

export interface PerfilAcesso {
  id: string;
  chave: string;
  nome: string;
  tela_inicial: string;
  acesso_pin: boolean;
}

export interface UsuarioSessao extends Autorizavel {
  /** funcionarios.id */
  id: string;
  /** auth.users.id */
  authId: string;
  nome: string;
  /** Cargo legado da V1 (espelha a chave do perfil). */
  cargo: string | null;
  matricula: string | null;
  email: string | null;
  perfil: PerfilAcesso | null;
  permissoes: string[];
  master: boolean;
  /** Senha provisória definida pelo gestor: troca obrigatória antes de usar o sistema. */
  trocarSenha: boolean;
}

export type StatusSessao = "carregando" | "anonimo" | "autenticado";

export interface EstadoSessao {
  status: StatusSessao;
  usuario: UsuarioSessao | null;
  /** Perfil carregado da cópia local porque o servidor não respondeu. */
  offline: boolean;
}

/** Depois deste tempo o login é exigido de novo (tablets compartilhados na linha). */
export const DURACAO_MAXIMA_SESSAO_MS = 12 * 60 * 60 * 1000;

const CHAVE_INICIO = "sgm_sessao_inicio";
const CHAVE_CACHE = "sgm_perfil_cache";
const CHAVE_V1 = "sgm_user";

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let estado: EstadoSessao = { status: "carregando", usuario: null, offline: false };
const ouvintes = new Set<() => void>();
let iniciado = false;
let sincronizando: Promise<void> | null = null;
type OuvinteEvento = (evento: "desativado" | "permissoes") => void;
const ouvintesEventos = new Set<OuvinteEvento>();

function definir(novo: EstadoSessao) {
  estado = novo;
  ouvintes.forEach((f) => f());
}

function emitir(evento: "desativado" | "permissoes") {
  ouvintesEventos.forEach((f) => f(evento));
}

/** Avisos da sessão (acesso desativado, permissões alteradas) para a interface reagir. */
export function aoEventoSessao(f: OuvinteEvento) {
  ouvintesEventos.add(f);
  return () => {
    ouvintesEventos.delete(f);
  };
}

interface RespostaPerfil {
  funcionario_id: string;
  nome: string;
  email: string | null;
  matricula: string | null;
  cargo: string | null;
  master: boolean;
  permissoes: string[] | null;
  perfil: PerfilAcesso | null;
}

function montarUsuario(p: RespostaPerfil, sessao: Session): UsuarioSessao {
  return {
    id: p.funcionario_id,
    authId: sessao.user.id,
    nome: p.nome,
    cargo: p.cargo ? String(p.cargo).toLowerCase() : null,
    matricula: p.matricula != null ? String(p.matricula) : null,
    email: p.email,
    perfil: p.perfil,
    permissoes: Array.isArray(p.permissoes) ? p.permissoes : [],
    master: p.master === true,
    trocarSenha: sessao.user.user_metadata?.trocar_senha === true,
  };
}

function lerCache(authId: string): UsuarioSessao | null {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_CACHE) || "null");
    return bruto && bruto.authId === authId ? (bruto as UsuarioSessao) : null;
  } catch {
    return null;
  }
}

function gravarCache(usuario: UsuarioSessao | null) {
  try {
    if (usuario) localStorage.setItem(CHAVE_CACHE, JSON.stringify(usuario));
    else localStorage.removeItem(CHAVE_CACHE);
  } catch {
    // Armazenamento indisponível: segue sem cópia local.
  }
}

function mesmaAutorizacao(a: UsuarioSessao | null, b: UsuarioSessao | null) {
  if (!a || !b) return a === b;
  return a.master === b.master && a.perfil?.id === b.perfil?.id && [...a.permissoes].sort().join() === [...b.permissoes].sort().join();
}

async function sincronizar(sessao: Session | null) {
  if (!sessao) {
    gravarCache(null);
    definir({ status: "anonimo", usuario: null, offline: false });
    return;
  }
  const { data, error } = await supabase.rpc("meu_perfil");
  if (error) {
    // Falha de rede: mantém quem já estava logado (ou a cópia local) em vez de derrubar a sessão.
    const anterior = estado.usuario?.authId === sessao.user.id ? estado.usuario : lerCache(sessao.user.id);
    if (anterior) {
      definir({ status: "autenticado", usuario: { ...anterior, trocarSenha: sessao.user.user_metadata?.trocar_senha === true }, offline: true });
      return;
    }
    definir({ status: "anonimo", usuario: null, offline: true });
    return;
  }
  const perfilRaw = (Array.isArray(data) ? data[0] : data) as RespostaPerfil | null | undefined;
  if (!perfilRaw || !perfilRaw.funcionario_id) {
    // Sessão válida, mas sem cadastro ativo: acesso desativado ou sem vínculo com funcionário.
    const tinhaUsuario = estado.usuario !== null;
    await supabase.auth.signOut({ scope: "local" });
    limparDadosLocais();
    definir({ status: "anonimo", usuario: null, offline: false });
    if (tinhaUsuario) emitir("desativado");
    return;
  }
  const usuario = montarUsuario(perfilRaw, sessao);
  const anterior = estado.usuario;
  gravarCache(usuario);
  definir({ status: "autenticado", usuario, offline: false });
  if (anterior && anterior.authId === usuario.authId && !mesmaAutorizacao(anterior, usuario)) emitir("permissoes");
}

function agendarSincronizacao(sessao: Session | null) {
  const tarefa = (sincronizando ?? Promise.resolve()).then(() => sincronizar(sessao)).catch((e) => {
    console.error("Falha ao carregar a sessão:", e);
  });
  sincronizando = tarefa.finally(() => {
    if (sincronizando === tarefa) sincronizando = null;
  });
  return tarefa;
}

/** Começa a acompanhar o Supabase Auth (idempotente). */
export function iniciarSessao() {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;
  // A V1 guardava a sessão em localStorage (e, em versões antigas, a senha): descarta.
  try {
    localStorage.removeItem(CHAVE_V1);
  } catch {
    /* ignore */
  }
  supabase.auth.onAuthStateChange((evento, sessao) => {
    // O callback não pode chamar o Supabase diretamente (trava o cliente): adia para o próximo ciclo.
    if (evento === "INITIAL_SESSION" || evento === "SIGNED_IN" || evento === "SIGNED_OUT" || evento === "USER_UPDATED") {
      setTimeout(() => agendarSincronizacao(sessao), 0);
    } else if (evento === "TOKEN_REFRESHED" && estado.offline) {
      setTimeout(() => agendarSincronizacao(sessao), 0);
    }
  });
}

/** Relê perfil e permissões no servidor (mudanças feitas pela gestão, desativação da conta). */
export async function recarregarPerfil() {
  const { data } = await supabase.auth.getSession();
  await agendarSincronizacao(data.session);
}

// ---------------------------------------------------------------------------
// Login / logout
// ---------------------------------------------------------------------------

export type ModoLogin = "senha" | "pin";

export type ResultadoLogin = { ok: true; usuario: UsuarioSessao } | { ok: false; erro: string };

function limparDadosLocais() {
  try {
    localStorage.removeItem(CHAVE_INICIO);
    localStorage.removeItem(CHAVE_CACHE);
  } catch {
    /* ignore */
  }
}

async function registrarEvento(acao: "LOGIN" | "LOGOUT", detalhes: Record<string, unknown>) {
  // Import dinâmico: o logger depende desta sessão.
  const { registrarLog } = await import("./logger");
  await registrarLog(acao, "Sistema", detalhes);
}

export async function entrar(identificador: string, segredo: string, modo: ModoLogin): Promise<ResultadoLogin> {
  const id = identificador.trim();
  const erroCredencial = modo === "pin" ? "Matrícula ou PIN incorretos." : "Usuário ou senha incorretos.";
  const semConexao = "Sem conexão com o servidor. Verifique a rede e tente novamente.";
  const falhar = async (): Promise<ResultadoLogin> => {
    await supabase.rpc("registrar_falha_login", { p_identificador: id });
    return { ok: false, erro: erroCredencial };
  };

  const { data: login, error: erroBusca } = await supabase.rpc("email_login", { p_identificador: id });
  if (erroBusca) return { ok: false, erro: semConexao };
  if (!login) return falhar();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(login),
    password: modo === "pin" ? senhaDoPin(segredo) : segredo,
  });
  if (error || !data.session) {
    if (error?.status === 429) return { ok: false, erro: "Muitas tentativas seguidas. Aguarde alguns minutos." };
    if (error?.name === "AuthRetryableFetchError") return { ok: false, erro: semConexao };
    return falhar();
  }

  try {
    localStorage.setItem(CHAVE_INICIO, String(Date.now()));
  } catch {
    /* ignore */
  }
  await agendarSincronizacao(data.session);
  const usuario = estado.usuario;
  if (!usuario) {
    await supabase.auth.signOut({ scope: "local" });
    return { ok: false, erro: "Seu cadastro está inativo ou sem perfil de acesso. Procure o gestor." };
  }
  await registrarEvento("LOGIN", { metodo: modo === "pin" ? "PIN" : "Senha", perfil: usuario.perfil?.nome ?? null });
  return { ok: true, usuario };
}

export type MotivoLogout = "manual" | "inativo" | "expirada" | "troca_de_usuario";

/** Registra o logout na auditoria e encerra a sessão NESTE dispositivo. */
export async function sair(motivo: MotivoLogout = "manual") {
  if (estado.usuario && !estado.offline) {
    try {
      await registrarEvento("LOGOUT", { motivo });
    } catch {
      /* segue com o logout */
    }
  }
  limparDadosLocais();
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Sem conexão: a sessão local é descartada mesmo assim.
  }
  definir({ status: "anonimo", usuario: null, offline: false });
}

/** Momento do login neste dispositivo (para o limite de duração da sessão). */
export function inicioDaSessao(): number {
  try {
    const salvo = Number(localStorage.getItem(CHAVE_INICIO));
    if (Number.isFinite(salvo) && salvo > 0) return salvo;
    const agora = Date.now();
    localStorage.setItem(CHAVE_INICIO, String(agora));
    return agora;
  } catch {
    return Date.now();
  }
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

function assinar(callback: () => void) {
  iniciarSessao();
  ouvintes.add(callback);
  return () => {
    ouvintes.delete(callback);
  };
}

const ESTADO_SERVIDOR: EstadoSessao = { status: "carregando", usuario: null, offline: false };

export function useSessao(): EstadoSessao {
  return useSyncExternalStore(assinar, () => estado, () => ESTADO_SERVIDOR);
}

export function useUsuarioLogado(): UsuarioSessao | null {
  return useSessao().usuario;
}

/** `true` se o usuário logado tiver a permissão (ou qualquer uma da lista). */
export function usePode(permissao: Permissao | readonly Permissao[]): boolean {
  return pode(useUsuarioLogado(), permissao);
}

/** Usuário logado fora de componentes React (logger, ações). */
export function getUsuarioLogado(): UsuarioSessao | null {
  return estado.usuario;
}

export function podeAgora(permissao: Permissao | readonly Permissao[]): boolean {
  return pode(estado.usuario, permissao);
}

const assinarNada = () => () => {};

/** `true` somente após a hidratação no navegador (evita divergência SSR/cliente). */
export function useHidratado(): boolean {
  return useSyncExternalStore(assinarNada, () => true, () => false);
}

/** Token de acesso atual, para chamar as rotas /api do próprio sistema. */
export async function tokenDeAcesso(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
