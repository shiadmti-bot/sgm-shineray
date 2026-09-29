import type { AdminUserAttributes } from "@supabase/supabase-js";
import { autenticar, clienteAdmin, exigir, registrarLogServidor, responder, responderErro, ErroHttp } from "@/lib/server/admin";
import {
  BLOQUEIO_PERMANENTE,
  carregarFuncionario,
  carregarPerfil,
  criarContaAuth,
  dataOpcional,
  garantirIdentificacaoLivre,
  loginDoCadastro,
  senhaParaPerfil,
  texto,
  validarIdentificacao,
  validarMatriculaPin,
  verificarHierarquia,
} from "@/lib/server/usuarios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Altera cadastro, perfil, credencial (senha/PIN) e situação (arquivar/restaurar) de um colaborador.
 * Só os campos enviados são alterados.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await autenticar(req);
    exigir(ctx, "equipe.gerenciar");
    const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const alvo = await carregarFuncionario(id);
    const proprio = alvo.id === ctx.funcionarioId;
    verificarHierarquia(ctx, alvo.perfil);

    const alteracoes: Record<string, unknown> = {};
    const campos: string[] = [];

    // Dados cadastrais
    let nome = alvo.nome;
    if ("nome" in corpo) {
      const novo = texto(corpo.nome, 80);
      if (!novo || novo.length < 3) throw new ErroHttp(400, "Informe o nome completo.");
      if (novo !== alvo.nome) { alteracoes.nome = novo; campos.push("nome"); nome = novo; }
    }
    if ("data_contratacao" in corpo) {
      alteracoes.data_contratacao = dataOpcional(corpo.data_contratacao);
      campos.push("data_contratacao");
    }

    // Perfil de acesso
    let perfil = alvo.perfil;
    if ("perfil_id" in corpo && corpo.perfil_id !== alvo.perfil_id) {
      if (proprio) throw new ErroHttp(400, "Você não pode alterar o seu próprio perfil de acesso. Peça a outro gestor.");
      perfil = await carregarPerfil(texto(corpo.perfil_id, 40));
      verificarHierarquia(ctx, perfil);
      alteracoes.perfil_id = perfil.id;
      alteracoes.cargo = perfil.chave;
      campos.push("perfil");
    }

    // Identificação (matrícula / e-mail) e login
    const identificacaoMudou = "matricula" in corpo || "email" in corpo;
    const matricula = "matricula" in corpo ? texto(corpo.matricula, 30) : alvo.matricula;
    const email = "email" in corpo ? (texto(corpo.email, 120)?.toLowerCase() ?? null) : alvo.email;
    if (identificacaoMudou) {
      validarIdentificacao(matricula, email);
      if (matricula !== alvo.matricula) { alteracoes.matricula = matricula; campos.push("matricula"); }
      if (email !== alvo.email) { alteracoes.email = email; campos.push("email"); }
    }
    if (identificacaoMudou || "perfil_id" in alteracoes) validarMatriculaPin(perfil, matricula);
    const precisaLogin = identificacaoMudou || !alvo.login_email;
    const login = precisaLogin ? loginDoCadastro(matricula, email) : String(alvo.login_email).toLowerCase();
    if (identificacaoMudou) await garantirIdentificacaoLivre(login, matricula, alvo.id);
    const loginMudou = login !== String(alvo.login_email ?? "").toLowerCase();
    if (loginMudou) alteracoes.login_email = login;

    // Credencial
    const temCredencial = Boolean(texto(corpo.senha, 200) || texto(corpo.pin, 4));
    if (temCredencial && !perfil) throw new ErroHttp(400, "Defina o perfil de acesso antes da senha/PIN.");
    const senha = perfil ? senhaParaPerfil(perfil, corpo) : null;
    if (proprio && senha) throw new ErroHttp(400, "Para trocar a sua própria senha, use a tela Meu perfil.");
    const tipoMudou = Boolean(perfil && alvo.perfil && perfil.acesso_pin !== alvo.perfil.acesso_pin);
    if (tipoMudou && !senha) {
      throw new ErroHttp(400, perfil!.acesso_pin
        ? "O novo perfil entra com matrícula + PIN: defina um PIN de 4 números."
        : "O novo perfil entra com senha: defina uma senha inicial.");
    }
    const exigirTroca = Boolean(perfil && !perfil.acesso_pin && corpo.exigir_troca !== false);

    // Situação
    const ativoAntes = alvo.ativo === true;
    let ativo = ativoAntes;
    if ("ativo" in corpo) {
      const novo = corpo.ativo === true;
      if (proprio && !novo) throw new ErroHttp(400, "Você não pode arquivar a sua própria conta.");
      if (novo !== ativoAntes) { alteracoes.ativo = novo; ativo = novo; }
    }

    if (Object.keys(alteracoes).length === 0 && !senha) return responder({ ok: true, alterado: false });

    // 1. Banco
    const admin = clienteAdmin();
    const original = Object.fromEntries(Object.keys(alteracoes).map((k) => [k, (alvo as unknown as Record<string, unknown>)[k] ?? null]));
    if (Object.keys(alteracoes).length > 0) {
      const { error } = await admin.from("funcionarios").update(alteracoes).eq("id", alvo.id);
      if (error) throw error;
    }

    // 2. Supabase Auth (se falhar, o cadastro volta ao que era)
    let acessoCriado = false;
    try {
      if (alvo.auth_user_id) {
        const atributos: AdminUserAttributes = {};
        if (loginMudou) { atributos.email = login; atributos.email_confirm = true; }
        if (senha) atributos.password = senha;
        if (senha || "nome" in alteracoes) {
          atributos.user_metadata = { nome, ...(senha ? { trocar_senha: exigirTroca } : {}) };
        }
        if ("ativo" in alteracoes) atributos.ban_duration = ativo ? "none" : BLOQUEIO_PERMANENTE;
        if (Object.keys(atributos).length > 0) {
          const { error } = await admin.auth.admin.updateUserById(alvo.auth_user_id, atributos);
          if (error) throw new ErroHttp(400, `Não foi possível atualizar o acesso: ${error.message}`);
        }
      } else if (senha) {
        const authId = await criarContaAuth({ funcionarioId: alvo.id, nome, login, senha, exigirTroca, ativo });
        const { error } = await admin.from("funcionarios").update({ auth_user_id: authId, login_email: login }).eq("id", alvo.id);
        if (error) throw error;
        acessoCriado = true;
      }
    } catch (erroAuth) {
      if (Object.keys(original).length > 0) await admin.from("funcionarios").update(original).eq("id", alvo.id);
      throw erroAuth;
    }

    // 3. Auditoria
    if ("ativo" in alteracoes) {
      await registrarLogServidor(ctx, ativo ? "RESTAURACAO" : "ARQUIVAMENTO", alvo.id, { nome });
    }
    if (senha) {
      await registrarLogServidor(ctx, "SENHA_ALTERADA", alvo.id, {
        nome,
        tipo: perfil?.acesso_pin ? "PIN" : "senha",
        redefinida_por: ctx.nome,
        troca_obrigatoria: exigirTroca,
        acesso_criado: acessoCriado,
      });
    }
    const editados = campos.filter((c) => c !== "ativo");
    if (editados.length > 0) {
      await registrarLogServidor(ctx, "EDICAO", alvo.id, {
        nome,
        campos: editados,
        ...(alteracoes.perfil_id ? { perfil: { de: alvo.perfil?.nome ?? null, para: perfil?.nome ?? null } } : {}),
      });
    }

    return responder({ ok: true, alterado: true, acesso_criado: acessoCriado });
  } catch (e) {
    return responderErro(e);
  }
}
