import { supabase } from "./supabase";
import { getUsuarioLogado } from "./auth";

// Auditoria. Autor, nome e horário são definidos pelo banco (gatilho privado.preencher_autor_log):
// o que o navegador envia nesses campos é ignorado.

export type AcaoLog =
  // Acesso
  | 'LOGIN'
  | 'LOGIN_FALHA'
  | 'LOGOUT'
  // Gestão de dados
  | 'CADASTRO'
  | 'EDICAO'
  | 'EXCLUSAO'
  | 'ARQUIVAMENTO'
  | 'RESTAURACAO'
  | 'SENHA_ALTERADA'
  | 'CONFIGURACAO'
  | 'PERFIL_CRIADO'
  | 'PERFIL_ALTERADO'
  | 'PERFIL_EXCLUIDO'
  // Entrada
  | 'ENTRADA_ESTOQUE'
  // Montagem
  | 'INICIO_MONTAGEM'
  | 'PAUSA_MONTAGEM'
  | 'PAUSA_SOLICITADA'
  | 'PAUSA_APROVADA'
  | 'PAUSA_REJEITADA'
  | 'PAUSA_CANCELADA'
  | 'PAUSA_RETOMADA'
  | 'FIM_MONTAGEM'
  | 'PRODUCAO_FIM'
  // Qualidade e oficina
  | 'APROVACAO_QA'
  | 'REPROVACAO_QA'
  | 'RETRABALHO_QA'
  | 'REPARO_OFICINA'
  | 'RETORNO_REPARO'
  | 'FOTO_ADICIONADA'
  | 'FOTO_REMOVIDA'
  // Logística
  | 'IMPRESSAO_ETIQUETA'
  | 'REIMPRESSAO_ETIQUETA'
  | 'REVERSAO_ESTOQUE'
  | 'SAIDA_ESTOQUE'
  | 'INVENTARIO_INICIADO'
  | 'INVENTARIO_FINALIZADO'
  | 'INVENTARIO_CANCELADO';

type DetalhesLog = Record<string, unknown>;

export async function registrarLog(
  acao: AcaoLog,
  referencia: string, // chassi da moto, id do funcionário ou 'Sistema'
  detalhes: DetalhesLog = {}
) {
  const usuario = getUsuarioLogado();
  const meta = typeof window !== 'undefined'
    ? { userAgent: window.navigator.userAgent, url_origem: window.location.pathname, timestamp_device: new Date().toISOString() }
    : { origem: 'server-side' };

  try {
    const { error } = await supabase.from('logs_sistema').insert({
      acao,
      usuario: usuario?.nome || 'Sistema / Desconhecido',
      referencia,
      detalhes: JSON.stringify({ ...detalhes, _meta: meta, autor_perfil: usuario?.perfil?.nome ?? null }),
    });
    if (error) console.error("Erro silencioso ao salvar log:", error.message);
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
