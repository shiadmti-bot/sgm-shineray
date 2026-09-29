#!/usr/bin/env node
// =====================================================================================
// SGM V2 — Fase 2: migração dos usuários para o Supabase Auth
// -------------------------------------------------------------------------------------
// Cria (ou atualiza) uma conta no Supabase Auth para cada funcionário, com a senha/PIN
// atual, e grava o vínculo em funcionarios.auth_user_id / funcionarios.login_email.
//
// Uso (na sua máquina, nunca no navegador):
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/migrar-usuarios-auth.mjs            # simulação: só mostra o que faria
//   node scripts/migrar-usuarios-auth.mjs --aplicar  # executa
//
// Pode ser executado de novo sem problema: funcionários já vinculados não têm a senha
// alterada (só o bloqueio de acesso é sincronizado com o campo "ativo").
// As regras de e-mail técnico e de senha do PIN são as mesmas de src/lib/rbac/credenciais.ts.
// =====================================================================================
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DOMINIO_TECNICO = "shineray.sys";
const APLICAR = process.argv.includes("--aplicar");
const URL = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !CHAVE) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (Project Settings > API > service_role).");
  process.exit(1);
}

const supabase = createClient(URL, CHAVE, { auth: { persistSession: false, autoRefreshToken: false } });

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const senhaDoPin = (pin) => `pin-${pin}-secure`;

function emailLogin(f) {
  const matricula = String(f.matricula ?? "").trim().toLowerCase();
  if (matricula && EMAIL_VALIDO.test(matricula)) return matricula;
  if (matricula && /^[a-z0-9._-]+$/.test(matricula)) return `${matricula}@${DOMINIO_TECNICO}`;
  const email = String(f.email ?? "").trim().toLowerCase();
  if (EMAIL_VALIDO.test(email)) return email;
  return null;
}

function senhaTemporaria() {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.randomBytes(10), (b) => alfabeto[b % alfabeto.length]).join("");
}

async function listarUsuariosAuth() {
  const todos = [];
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: pagina, perPage: 1000 });
    if (error) throw error;
    todos.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return todos;
}

async function principal() {
  console.log(APLICAR ? "== MODO APLICAR: as alterações serão gravadas ==" : "== SIMULAÇÃO (nada será alterado). Use --aplicar para executar ==");

  const { data: funcionarios, error } = await supabase
    .from("funcionarios")
    .select("id, nome, cargo, matricula, email, senha, ativo, auth_user_id, login_email, perfil:perfis(chave, acesso_pin)")
    .order("nome");
  if (error) {
    console.error("Não foi possível ler funcionarios. A fase 1 (SQL) foi aplicada?", error.message);
    process.exit(1);
  }

  const usuariosAuth = await listarUsuariosAuth();
  const porId = new Map(usuariosAuth.map((u) => [u.id, u]));
  const porEmail = new Map(usuariosAuth.map((u) => [String(u.email || "").toLowerCase(), u]));
  const porDbId = new Map(usuariosAuth.filter((u) => u.user_metadata?.db_id).map((u) => [u.user_metadata.db_id, u]));

  const emailsUsados = new Map();
  const relatorio = [];

  for (const f of funcionarios) {
    // "ativo" vazio conta como inativo (mesma regra do banco na V2)
    const ativo = f.ativo === true;
    const linha = { nome: f.nome, perfil: f.perfil?.chave || "(sem perfil)", ativo, login: "", acao: "", obs: [] };
    relatorio.push(linha);

    // Já migrado: não mexe na senha (o usuário pode já ter trocado na V2); só sincroniza o bloqueio.
    const vinculado = f.auth_user_id && porId.get(f.auth_user_id);
    if (vinculado) {
      linha.login = f.login_email || vinculado.email;
      if (f.login_email) emailsUsados.set(f.login_email, f.nome);
      if (!APLICAR) { linha.acao = "já migrado"; continue; }
      const { error: erro } = await supabase.auth.admin.updateUserById(vinculado.id, { ban_duration: ativo ? "none" : "876000h" });
      linha.acao = erro ? "ERRO" : "já migrado";
      if (erro) linha.obs.push(erro.message);
      continue;
    }

    const login = emailLogin(f);
    if (!login) {
      linha.acao = "IGNORADO";
      linha.obs.push("sem matrícula válida nem e-mail: defina um dos dois e rode de novo");
      continue;
    }
    if (emailsUsados.has(login)) {
      linha.acao = "IGNORADO";
      linha.obs.push(`login ${login} repetido (também usado por ${emailsUsados.get(login)}): corrija a matrícula/e-mail`);
      continue;
    }
    emailsUsados.set(login, f.nome);
    linha.login = f.matricula ? `matrícula ${f.matricula}` : login;

    // Senha
    const acessoPin = f.perfil?.acesso_pin === true;
    let senhaAuth;
    let trocarSenha = false;
    if (acessoPin) {
      if (/^\d{4}$/.test(String(f.senha || ""))) {
        senhaAuth = senhaDoPin(f.senha);
      } else {
        const pin = String(crypto.randomInt(0, 10000)).padStart(4, "0");
        senhaAuth = senhaDoPin(pin);
        linha.obs.push(`PIN atual inválido: PIN TEMPORÁRIO ${pin}`);
      }
    } else if (String(f.senha || "").length >= 6) {
      senhaAuth = f.senha;
    } else {
      const temporaria = senhaTemporaria();
      senhaAuth = temporaria;
      trocarSenha = true;
      linha.obs.push(`senha atual curta ou vazia: SENHA TEMPORÁRIA ${temporaria} (troca obrigatória no 1º acesso)`);
    }
    if (!f.perfil) linha.obs.push("sem perfil: não terá acesso até receber um perfil na tela Equipe");

    const existente = (f.auth_user_id && porId.get(f.auth_user_id)) || porDbId.get(f.id) || porEmail.get(login);
    const atributos = {
      email: login,
      password: senhaAuth,
      email_confirm: true,
      app_metadata: { funcionario_id: f.id },
      user_metadata: { nome: f.nome, ...(trocarSenha ? { trocar_senha: true } : {}) },
      ban_duration: ativo ? "none" : "876000h",
    };

    if (!APLICAR) {
      linha.acao = existente ? "atualizaria" : "criaria";
      continue;
    }

    let authId;
    if (existente) {
      const { data, error: erro } = await supabase.auth.admin.updateUserById(existente.id, atributos);
      if (erro) { linha.acao = "ERRO"; linha.obs.push(erro.message); continue; }
      authId = data.user.id;
      linha.acao = "atualizado";
    } else {
      const { ban_duration, ...criar } = atributos;
      const { data, error: erro } = await supabase.auth.admin.createUser(criar);
      if (erro) { linha.acao = "ERRO"; linha.obs.push(erro.message); continue; }
      authId = data.user.id;
      if (ban_duration !== "none") await supabase.auth.admin.updateUserById(authId, { ban_duration });
      linha.acao = "criado";
    }

    const { error: erroVinculo } = await supabase
      .from("funcionarios")
      .update({ auth_user_id: authId, login_email: login })
      .eq("id", f.id);
    if (erroVinculo) { linha.acao = "ERRO"; linha.obs.push(`vínculo: ${erroVinculo.message}`); }
  }

  console.table(relatorio.map((l) => ({ ...l, obs: l.obs.join("; ") })));
  const erros = relatorio.filter((l) => l.acao === "ERRO" || l.acao === "IGNORADO").length;
  console.log(`\n${relatorio.length} funcionário(s) · ${erros} com pendência.`);
  if (relatorio.some((l) => l.obs.some((o) => o.includes("TEMPORÁRI")))) {
    console.log("Informe as credenciais temporárias pessoalmente e apague este histórico do terminal.");
  }
  if (!APLICAR) console.log("Nada foi alterado. Rode com --aplicar para executar.");
}

principal().catch((e) => {
  console.error("Falha na migração:", e);
  process.exit(1);
});
