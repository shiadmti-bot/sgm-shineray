import "server-only";
import { clienteAdmin, ErroHttp, type ContextoAdmin, type PerfilResumo } from "./admin";
import { pode, PERMISSOES_SENSIVEIS } from "@/lib/rbac/permissoes";
import { emailLogin, emailValido, matriculaValida, pinValido, problemaSenha, senhaDoPin } from "@/lib/rbac/credenciais";

/** Bloqueio de login no Supabase Auth para contas arquivadas (~100 anos). */
export const BLOQUEIO_PERMANENTE = "876000h";

export const COLUNAS_FUNCIONARIO =
  "id, nome, cargo, matricula, email, ativo, data_contratacao, perfil_id, login_email, auth_user_id, perfil:perfis(id, chave, nome, permissoes, acesso_pin)";

export interface FuncionarioAdmin {
  id: string;
  nome: string;
  cargo: string | null;
  matricula: string | null;
  email: string | null;
  ativo: boolean | null;
  data_contratacao: string | null;
  perfil_id: string | null;
  login_email: string | null;
  auth_user_id: string | null;
  perfil: PerfilResumo | null;
}

// ---------- Leitura e validação da entrada ----------

export function texto(valor: unknown, maximo = 120): string | null {
  if (valor === undefined || valor === null) return null;
  const s = String(valor).trim();
  if (!s) return null;
  if (s.length > maximo) throw new ErroHttp(400, `Texto muito longo (máximo de ${maximo} caracteres).`);
  return s;
}

export function dataOpcional(valor: unknown): string | null {
  const s = texto(valor, 40);
  if (!s) return null;
  if (Number.isNaN(new Date(s).getTime())) throw new ErroHttp(400, "Data de contratação inválida.");
  return s;
}

export function validarIdentificacao(matricula: string | null, email: string | null) {
  if (matricula && !matriculaValida(matricula)) {
    throw new ErroHttp(400, "A matrícula só pode ter letras, números, ponto, hífen e sublinhado.");
  }
  if (email && !emailValido(email)) throw new ErroHttp(400, "E-mail inválido.");
}

/** Converte a credencial informada na senha do Supabase Auth, conforme o tipo de acesso do perfil. */
export function senhaParaPerfil(perfil: PerfilResumo, entrada: { senha?: unknown; pin?: unknown }): string | null {
  if (perfil.acesso_pin) {
    const pin = texto(entrada.pin, 4);
    if (!pin) return null;
    if (!pinValido(pin)) throw new ErroHttp(400, "O PIN deve ter exatamente 4 números.");
    return senhaDoPin(pin);
  }
  const senha = entrada.senha === undefined || entrada.senha === null ? "" : String(entrada.senha);
  if (!senha) return null;
  const problema = problemaSenha(senha);
  if (problema) throw new ErroHttp(400, problema);
  return senha;
}

/** No acesso por PIN a matrícula é digitada no teclado numérico da tela de login. */
export function validarMatriculaPin(perfil: PerfilResumo | null, matricula: string | null) {
  if (!perfil?.acesso_pin) return;
  if (!matricula) throw new ErroHttp(400, "Perfis com acesso por PIN exigem matrícula.");
  if (!/^\d{1,10}$/.test(matricula)) {
    throw new ErroHttp(400, "Para acesso por PIN, a matrícula deve ter só números (é digitada no teclado numérico).");
  }
}

// ---------- Regras de hierarquia ----------

/** Impede que alguém crie ou altere contas com mais poder do que pode conceder. */
export function verificarHierarquia(ctx: ContextoAdmin, perfil: PerfilResumo | null) {
  if (!perfil) return;
  if (perfil.chave === "master" && !ctx.master) {
    throw new ErroHttp(403, "Somente um Master pode criar ou alterar contas Master.");
  }
  const sensivel = perfil.permissoes.some((p) => (PERMISSOES_SENSIVEIS as readonly string[]).includes(p));
  if (sensivel && !pode(ctx, "perfis.gerenciar")) {
    throw new ErroHttp(403, `Somente quem gerencia perfis de acesso pode atribuir ou alterar contas "${perfil.nome}".`);
  }
}

// ---------- Consultas ----------

export async function carregarPerfil(id: string | null): Promise<PerfilResumo> {
  if (!id) throw new ErroHttp(400, "Selecione o perfil de acesso.");
  const { data } = await clienteAdmin()
    .from("perfis")
    .select("id, chave, nome, permissoes, acesso_pin")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new ErroHttp(400, "Perfil de acesso não encontrado.");
  return data as PerfilResumo;
}

export async function carregarFuncionario(id: string): Promise<FuncionarioAdmin> {
  const { data } = await clienteAdmin().from("funcionarios").select(COLUNAS_FUNCIONARIO).eq("id", id).maybeSingle();
  if (!data) throw new ErroHttp(404, "Colaborador não encontrado.");
  return data as unknown as FuncionarioAdmin;
}

/** Garante que matrícula e login não estejam em uso por outro colaborador (ativo ou arquivado). */
export async function garantirIdentificacaoLivre(login: string, matricula: string | null, exceto?: string) {
  const { data } = await clienteAdmin().from("funcionarios").select("id, nome, matricula, login_email, ativo");
  const outros = (data ?? []).filter((f) => f.id !== exceto);
  const mesmaMatricula = matricula
    ? outros.find((f) => String(f.matricula ?? "").trim().toLowerCase() === matricula.toLowerCase())
    : undefined;
  if (mesmaMatricula) {
    throw new ErroHttp(409, `A matrícula ${matricula} já pertence a ${mesmaMatricula.nome}${mesmaMatricula.ativo === false ? " (arquivado)" : ""}.`);
  }
  const mesmoLogin = outros.find((f) => String(f.login_email ?? "").toLowerCase() === login);
  if (mesmoLogin) {
    throw new ErroHttp(409, `O acesso ${login} já pertence a ${mesmoLogin.nome}${mesmoLogin.ativo === false ? " (arquivado)" : ""}.`);
  }
}

export function loginDoCadastro(matricula: string | null, email: string | null): string {
  const login = emailLogin({ matricula, email });
  if (!login) throw new ErroHttp(400, "Informe a matrícula ou um e-mail válido: um dos dois é usado para entrar no sistema.");
  return login;
}

// ---------- Supabase Auth ----------

function emailJaExiste(erro: { code?: string; message?: string; status?: number }) {
  return erro.code === "email_exists" || /already (been )?registered|already exists/i.test(erro.message ?? "");
}

/**
 * Cria a conta no Supabase Auth para o colaborador. Se já existir uma conta órfã com o mesmo e-mail
 * (ex.: tentativa anterior interrompida), ela é reaproveitada.
 */
export async function criarContaAuth(opcoes: {
  funcionarioId: string;
  nome: string;
  login: string;
  senha: string;
  exigirTroca: boolean;
  ativo: boolean;
}): Promise<string> {
  const admin = clienteAdmin();
  const atributos = {
    email: opcoes.login,
    password: opcoes.senha,
    email_confirm: true,
    app_metadata: { funcionario_id: opcoes.funcionarioId },
    user_metadata: { nome: opcoes.nome, trocar_senha: opcoes.exigirTroca },
  };

  const { data, error } = await admin.auth.admin.createUser(atributos);
  let authId = data?.user?.id;

  if (error) {
    if (!emailJaExiste(error)) throw new ErroHttp(400, `Não foi possível criar o acesso: ${error.message}`);
    const { data: lista, error: erroLista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (erroLista) throw erroLista;
    const existente = lista.users.find((u) => (u.email ?? "").toLowerCase() === opcoes.login);
    if (!existente) throw new ErroHttp(409, `O acesso ${opcoes.login} já existe no Supabase Auth.`);
    const { data: vinculado } = await admin
      .from("funcionarios")
      .select("id, nome")
      .eq("auth_user_id", existente.id)
      .neq("id", opcoes.funcionarioId)
      .maybeSingle();
    if (vinculado) throw new ErroHttp(409, `O acesso ${opcoes.login} já pertence a ${vinculado.nome}.`);
    const { error: erroAtualizar } = await admin.auth.admin.updateUserById(existente.id, atributos);
    if (erroAtualizar) throw new ErroHttp(400, `Não foi possível reaproveitar o acesso: ${erroAtualizar.message}`);
    authId = existente.id;
  }

  if (!authId) throw new ErroHttp(500, "O Supabase Auth não retornou o usuário criado.");
  if (!opcoes.ativo) await admin.auth.admin.updateUserById(authId, { ban_duration: BLOQUEIO_PERMANENTE });
  return authId;
}
