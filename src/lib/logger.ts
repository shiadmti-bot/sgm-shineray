import { supabase } from "./supabase";

export async function registrarLog(
  acao: string, 
  alvo: string, 
  detalhes: object = {}
) {
  // 1. Tenta pegar o usuário logado da sessão local
  const userStr = localStorage.getItem('sgm_user');
  const user = userStr ? JSON.parse(userStr) : null;

  if (!user) return; // Se não tem usuário, não loga (ou loga como anônimo)

  // 2. Insere na tabela
  await supabase.from('logs_sistema').insert({
    autor_id: user.id,
    acao: acao.toUpperCase(),
    alvo: alvo,
    detalhes: detalhes
  });
}