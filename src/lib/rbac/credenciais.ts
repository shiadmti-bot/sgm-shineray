// Regras de credenciais da V2 (as mesmas de scripts/migrar-usuarios-auth.mjs).
//
// - Quem tem matrícula entra com um e-mail técnico <matricula>@shineray.sys (não precisa de e-mail real).
// - Perfis com "acesso por PIN" usam matrícula + PIN de 4 dígitos. O Supabase Auth exige senha
//   com pelo menos 6 caracteres, então o PIN é convertido em uma senha fixa derivada dele.

export const DOMINIO_TECNICO = "shineray.sys";
export const TAMANHO_MINIMO_SENHA = 6;

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MATRICULA_VALIDA = /^[a-z0-9._-]+$/i;

export const senhaDoPin = (pin: string) => `pin-${pin}-secure`;
export const pinValido = (pin: string) => /^\d{4}$/.test(pin);
export const emailValido = (email: string) => EMAIL_VALIDO.test(email.trim());
export const matriculaValida = (matricula: string) => MATRICULA_VALIDA.test(matricula.trim());

/** E-mail usado no Supabase Auth: técnico (pela matrícula) ou o e-mail real. `null` se nenhum for válido. */
export function emailLogin(dados: { matricula?: string | null; email?: string | null }): string | null {
  const matricula = String(dados.matricula ?? "").trim().toLowerCase();
  if (matricula && EMAIL_VALIDO.test(matricula)) return matricula;
  if (matricula && MATRICULA_VALIDA.test(matricula)) return `${matricula}@${DOMINIO_TECNICO}`;
  const email = String(dados.email ?? "").trim().toLowerCase();
  if (EMAIL_VALIDO.test(email)) return email;
  return null;
}

/** Problema com a senha informada, ou `null` se ela for aceitável. */
export function problemaSenha(senha: string): string | null {
  if (senha.length < TAMANHO_MINIMO_SENHA) return `A senha deve ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`;
  if (/^pin-\d{4}-secure$/.test(senha)) return "Escolha outra senha.";
  return null;
}
