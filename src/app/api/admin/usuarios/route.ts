import { autenticar, clienteAdmin, exigir, listarUsuariosAuth, registrarLogServidor, responder, responderErro, ErroHttp } from "@/lib/server/admin";
import {
  carregarPerfil,
  COLUNAS_FUNCIONARIO,
  criarContaAuth,
  dataOpcional,
  garantirIdentificacaoLivre,
  loginDoCadastro,
  senhaParaPerfil,
  texto,
  validarIdentificacao,
  validarMatriculaPin,
  verificarHierarquia,
  type FuncionarioAdmin,
} from "@/lib/server/usuarios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Equipe com perfil, situação do acesso e último login. */
export async function GET(req: Request) {
  try {
    const ctx = await autenticar(req);
    exigir(ctx, ["equipe.ver", "equipe.gerenciar"]);

    const [{ data, error }, contas] = await Promise.all([
      clienteAdmin().from("funcionarios").select(COLUNAS_FUNCIONARIO).order("nome"),
      listarUsuariosAuth(),
    ]);
    if (error) throw error;
    const porId = new Map(contas.map((u) => [u.id, u]));

    const usuarios = ((data ?? []) as unknown as FuncionarioAdmin[]).map((f) => {
      const conta = f.auth_user_id ? porId.get(f.auth_user_id) : undefined;
      const bloqueado = conta?.banned_until ? new Date(conta.banned_until).getTime() > Date.now() : false;
      return {
        id: f.id,
        nome: f.nome,
        cargo: f.cargo,
        matricula: f.matricula,
        email: f.email,
        ativo: f.ativo === true,
        data_contratacao: f.data_contratacao,
        perfil_id: f.perfil_id,
        perfil: f.perfil ? { id: f.perfil.id, chave: f.perfil.chave, nome: f.perfil.nome, acesso_pin: f.perfil.acesso_pin } : null,
        login: f.login_email,
        acesso: !conta ? "sem_acesso" : bloqueado ? "bloqueado" : "ativo",
        ultimo_acesso: conta?.last_sign_in_at ?? null,
        trocar_senha: conta?.user_metadata?.trocar_senha === true,
      };
    });
    return responder({ usuarios });
  } catch (e) {
    return responderErro(e);
  }
}

/** Cadastra um colaborador e cria o acesso dele no Supabase Auth. */
export async function POST(req: Request) {
  try {
    const ctx = await autenticar(req);
    exigir(ctx, "equipe.gerenciar");
    const corpo = await req.json().catch(() => ({}));

    const nome = texto(corpo.nome, 80);
    if (!nome || nome.length < 3) throw new ErroHttp(400, "Informe o nome completo.");
    const matricula = texto(corpo.matricula, 30);
    const email = texto(corpo.email, 120)?.toLowerCase() ?? null;
    validarIdentificacao(matricula, email);
    const perfil = await carregarPerfil(texto(corpo.perfil_id, 40));
    verificarHierarquia(ctx, perfil);
    validarMatriculaPin(perfil, matricula);

    const senha = senhaParaPerfil(perfil, corpo);
    if (!senha) throw new ErroHttp(400, perfil.acesso_pin ? "Defina o PIN de 4 números." : "Defina a senha inicial.");
    const login = loginDoCadastro(matricula, email);
    await garantirIdentificacaoLivre(login, matricula);

    const admin = clienteAdmin();
    const { data: novo, error } = await admin
      .from("funcionarios")
      .insert({
        nome,
        cargo: perfil.chave,
        matricula,
        email,
        ativo: true,
        data_contratacao: dataOpcional(corpo.data_contratacao),
        perfil_id: perfil.id,
        login_email: login,
      })
      .select("id")
      .single();
    if (error) throw error;

    try {
      const authId = await criarContaAuth({
        funcionarioId: novo.id,
        nome,
        login,
        senha,
        exigirTroca: !perfil.acesso_pin && corpo.exigir_troca !== false,
        ativo: true,
      });
      const { error: erroVinculo } = await admin.from("funcionarios").update({ auth_user_id: authId }).eq("id", novo.id);
      if (erroVinculo) throw erroVinculo;
    } catch (erroAuth) {
      // Sem acesso criado, o cadastro não fica pela metade
      await admin.from("funcionarios").delete().eq("id", novo.id);
      throw erroAuth;
    }

    await registrarLogServidor(ctx, "CADASTRO", novo.id, { nome, perfil: perfil.nome, matricula, email });
    return responder({ id: novo.id }, 201);
  } catch (e) {
    return responderErro(e);
  }
}
