import "server-only";
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { pode, type Permissao } from "@/lib/rbac/permissoes";

// Acesso administrativo ao Supabase (service role). Somente no servidor: esta chave ignora o RLS.

export class ErroHttp extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let cliente: SupabaseClient | null = null;

export function clienteAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new ErroHttp(503, "Servidor sem a variável SUPABASE_SERVICE_ROLE_KEY. Veja docs/implantacao-v2.md.");
  }
  cliente ??= createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  return cliente;
}

export interface PerfilResumo {
  id: string;
  chave: string;
  nome: string;
  permissoes: string[];
  acesso_pin: boolean;
}

export interface ContextoAdmin {
  authUserId: string;
  funcionarioId: string;
  nome: string;
  master: boolean;
  permissoes: string[];
}

/** Identifica quem chama a rota pelo token do Supabase Auth enviado no cabeçalho Authorization. */
export async function autenticar(req: Request): Promise<ContextoAdmin> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new ErroHttp(401, "Sessão ausente. Entre novamente.");

  const admin = clienteAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new ErroHttp(401, "Sessão expirada. Entre novamente.");

  const { data: funcionario } = await admin
    .from("funcionarios")
    .select("id, nome, ativo, perfil:perfis(id, chave, nome, permissoes, acesso_pin)")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (!funcionario || funcionario.ativo !== true) throw new ErroHttp(403, "Usuário sem cadastro ativo no SGM.");

  const perfil = funcionario.perfil as unknown as PerfilResumo | null;
  return {
    authUserId: data.user.id,
    funcionarioId: funcionario.id,
    nome: funcionario.nome,
    master: perfil?.chave === "master",
    permissoes: perfil?.permissoes ?? [],
  };
}

export function exigir(ctx: ContextoAdmin, permissao: Permissao | readonly Permissao[]) {
  if (!pode(ctx, permissao)) throw new ErroHttp(403, "Seu perfil não tem permissão para esta ação.");
}

export function responderErro(e: unknown) {
  if (e instanceof ErroHttp) return NextResponse.json({ erro: e.message }, { status: e.status, headers: SEM_CACHE });
  console.error("[api/admin]", e);
  return NextResponse.json({ erro: "Erro interno. Tente novamente." }, { status: 500, headers: SEM_CACHE });
}

export const SEM_CACHE = { "Cache-Control": "no-store" };

export function responder(corpo: unknown, status = 200) {
  return NextResponse.json(corpo, { status, headers: SEM_CACHE });
}

/** Todos os usuários do Supabase Auth (paginado). */
export async function listarUsuariosAuth(): Promise<User[]> {
  const admin = clienteAdmin();
  const todos: User[] = [];
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 1000 });
    if (error) throw error;
    todos.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return todos;
}

/** Registro de auditoria feito pelo servidor (o gatilho do banco não identifica a service role). */
export async function registrarLogServidor(
  ctx: ContextoAdmin,
  acao: string,
  referencia: string,
  detalhes: Record<string, unknown>,
) {
  const { error } = await clienteAdmin()
    .from("logs_sistema")
    .insert({
      acao,
      usuario: ctx.nome,
      autor_id: ctx.funcionarioId,
      referencia,
      detalhes: JSON.stringify({ ...detalhes, _meta: { origem: "servidor" } }),
    });
  if (error) console.error("[api/admin] auditoria:", error.message);
}
