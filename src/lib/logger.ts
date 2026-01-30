import { supabase } from "./supabase";

// 1. Definição Completa dos Tipos de Ação (V2.2 - Build Fix)
export type AcaoLog = 
  // Acesso
  | 'LOGIN' 
  | 'LOGOUT' 
  // Gestão de Dados
  | 'CADASTRO' 
  | 'EDICAO' 
  | 'EXCLUSAO' 
  // Fluxo de Entrada
  | 'ENTRADA_ESTOQUE'      
  // Fluxo de Montagem
  | 'INICIO_MONTAGEM' 
  | 'PAUSA_MONTAGEM'
  | 'PAUSA_SOLICITADA'     
  | 'PAUSA_APROVADA'       
  | 'PAUSA_REJEITADA'      
  | 'FIM_MONTAGEM'         
  | 'PRODUCAO_FIM'         
  // Fluxo de Qualidade e Oficina
  | 'APROVACAO_QA'         
  | 'REPROVACAO_QA'        
  | 'RETRABALHO_QA'        
  | 'REPARO_OFICINA'       
  | 'RETORNO_REPARO'       
  // Logística Final
  | 'IMPRESSAO_ETIQUETA'
  | 'SAIDA_ESTOQUE';

// 2. Interface para padronizar detalhes
interface DetalhesLog {
  [key: string]: any;
}

export async function registrarLog(
  acao: AcaoLog, 
  referencia: string, // SKU da moto, ID do funcionário ou 'Sistema'
  detalhes: DetalhesLog = {}
) {
  // Recupera usuário da sessão local
  const userStr = localStorage.getItem('sgm_user');
  const user = userStr ? JSON.parse(userStr) : null;

  const usuarioNome = user?.nome || 'Sistema / Desconhecido';
  const usuarioId = user?.id || null;

  // 3. Captura Metadados
  const metaDados = typeof window !== 'undefined' ? {
    userAgent: window.navigator.userAgent,
    url_origem: window.location.pathname,
    timestamp_device: new Date().toISOString()
  } : { origem: 'server-side' };

  // 4. Mescla os detalhes
  const payloadFinal = {
    ...detalhes,
    _meta: metaDados,
    autor_id_ref: usuarioId 
  };

  try {
    const { error } = await supabase.from('logs_sistema').insert({
      acao,
      usuario: usuarioNome,
      referencia: referencia,
      detalhes: JSON.stringify(payloadFinal),
      created_at: new Date().toISOString()
    });

    if (error) {
      console.error("Erro silencioso ao salvar log:", error.message);
    }

  } catch (error) {
    console.error("Falha crítica no logger:", error);
  }
}