import { supabase } from "./supabase";

// 1. Expansão dos Tipos de Ação para cobrir todo o fluxo V2.0
export type AcaoLog = 
  | 'LOGIN' 
  | 'LOGOUT' 
  | 'CADASTRO' 
  | 'EDICAO' 
  | 'EXCLUSAO'           // ou ARQUIVAMENTO
  | 'ENTRADA_ESTOQUE'    // Bipagem inicial
  | 'INICIO_MONTAGEM' 
  | 'PAUSA_MONTAGEM' 
  | 'FIM_MONTAGEM' 
  | 'APROVACAO_QA' 
  | 'REPROVACAO_QA'      // Defeito de Fábrica
  | 'RETRABALHO_QA'      // Erro do Montador
  | 'RETORNO_REPARO'     // Volta da oficina
  | 'IMPRESSAO_ETIQUETA';

// 2. Interfaces para forçar estrutura nos detalhes (Opcional, mas recomendado)
interface DetalhesBase {
  motivo?: string;
  obs?: string;
}

export async function registrarLog(
  acao: AcaoLog, 
  alvo: string, 
  detalhes: Record<string, any> = {}
) {
  // Recupera usuário
  const userStr = localStorage.getItem('sgm_user');
  const user = userStr ? JSON.parse(userStr) : null;

  if (!user) return; 

  // 3. Captura Metadados do Ambiente (Crucial para auditoria física)
  const metaDados = {
    userAgent: window.navigator.userAgent, // Identifica se é Tablet/PC/Celular
    timestamp_local: new Date().toString(),
    url_origem: window.location.pathname
  };

  // 4. Mescla os detalhes do negócio com os metadados técnicos
  const payloadFinal = {
    ...detalhes,
    _meta: metaDados
  };

  try {
    // Fire-and-forget (Não usamos await para não travar a UI do usuário)
    supabase.from('logs_sistema').insert({
      autor_id: user.id,
      acao,
      alvo, 
      detalhes: payloadFinal
    }).then(({ error }) => {
      if (error) console.error("Erro ao salvar log no banco:", error);
    });

  } catch (error) {
    console.error("Falha crítica no logger:", error);
  }
}