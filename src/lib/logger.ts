import { supabase } from "./supabase";
import { getUsuarioLogado } from "./auth";

// 1. Definição Completa dos Tipos de Ação
export type AcaoLog =
  // Acesso
  | 'LOGIN'
  | 'LOGIN_FALHA'
  | 'LOGOUT'
  // Gestão de Dados
  | 'CADASTRO'
  | 'EDICAO'
  | 'EXCLUSAO'
  | 'ARQUIVAMENTO'
  | 'RESTAURACAO'
  | 'SENHA_ALTERADA'
  | 'CONFIGURACAO'
  // Fluxo de Entrada
  | 'ENTRADA_ESTOQUE'
  // Fluxo de Montagem
  | 'INICIO_MONTAGEM'
  | 'PAUSA_MONTAGEM'
  | 'PAUSA_SOLICITADA'
  | 'PAUSA_APROVADA'
  | 'PAUSA_REJEITADA'
  | 'PAUSA_CANCELADA'
  | 'PAUSA_RETOMADA'
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
  | 'REIMPRESSAO_ETIQUETA'
  | 'REVERSAO_ESTOQUE'
  | 'SAIDA_ESTOQUE';

// 2. Interface para padronizar detalhes
type DetalhesLog = Record<string, unknown>;

export async function registrarLog(
  acao: AcaoLog,
  referencia: string, // SKU da moto, ID do funcionário ou 'Sistema'
  detalhes: DetalhesLog = {}
) {
  // Recupera usuário da sessão local (sem dados sensíveis)
  const user = getUsuarioLogado();

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
    autor_id_ref: usuarioId,
    autor_cargo: user?.cargo || null
  };

  const registro = {
    acao,
    usuario: usuarioNome,
    referencia: referencia,
    detalhes: JSON.stringify(payloadFinal),
    created_at: new Date().toISOString()
  };

  try {
    const { error } = await supabase.from('logs_sistema').insert(registro);

    if (error) {
      // Se a coluna `acao` for um ENUM sem os tipos novos, não perde o evento:
      // grava como EDICAO e preserva a ação original nos detalhes.
      if (error.code === '22P02') {
        await supabase.from('logs_sistema').insert({
          ...registro,
          acao: 'EDICAO',
          detalhes: JSON.stringify({ ...payloadFinal, acao_original: acao })
        });
      } else {
        console.error("Erro silencioso ao salvar log:", error.message);
      }
    }

  } catch (error) {
    console.error("Falha crítica no logger:", error);
  }
}

/** `detalhes` pode chegar como objeto (jsonb) ou como texto JSON; normaliza para objeto. */
export function lerDetalhesLog(detalhes: unknown): Record<string, unknown> {
  if (detalhes == null) return {};
  if (typeof detalhes === 'string') {
    try {
      const parsed = JSON.parse(detalhes);
      if (typeof parsed === 'string') return lerDetalhesLog(parsed);
      return parsed && typeof parsed === 'object' ? parsed : { valor: parsed };
    } catch {
      return { texto: detalhes };
    }
  }
  return typeof detalhes === 'object' ? (detalhes as Record<string, unknown>) : { valor: detalhes };
}
