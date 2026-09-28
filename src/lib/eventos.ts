import { lerDetalhesLog } from "./logger";

// Nomes e resumo dos eventos da auditoria (logs_sistema), usados na Auditoria e no Prontuário.

export const ROTULO_ACAO: Record<string, string> = {
  LOGIN: "Entrada no sistema",
  LOGIN_FALHA: "Tentativa de login recusada",
  LOGOUT: "Saída do sistema",
  CADASTRO: "Cadastro",
  EDICAO: "Edição",
  EXCLUSAO: "Exclusão",
  ARQUIVAMENTO: "Arquivamento",
  RESTAURACAO: "Restauração",
  SENHA_ALTERADA: "Senha/PIN alterado",
  CONFIGURACAO: "Configuração alterada",
  PERFIL_CRIADO: "Perfil de acesso criado",
  PERFIL_ALTERADO: "Perfil de acesso alterado",
  PERFIL_EXCLUIDO: "Perfil de acesso excluído",
  ENTRADA_ESTOQUE: "Entrada registrada (scanner)",
  INICIO_MONTAGEM: "Montagem iniciada",
  PAUSA_MONTAGEM: "Montagem pausada",
  PAUSA_SOLICITADA: "Pausa solicitada",
  PAUSA_APROVADA: "Pausa autorizada",
  PAUSA_REJEITADA: "Pausa negada",
  PAUSA_CANCELADA: "Pedido de pausa cancelado",
  PAUSA_RETOMADA: "Montagem retomada",
  FIM_MONTAGEM: "Montagem finalizada",
  PRODUCAO_FIM: "Montagem finalizada",
  APROVACAO_QA: "Aprovada na qualidade",
  REPROVACAO_QA: "Reprovada na qualidade (avaria)",
  RETRABALHO_QA: "Devolvida para retrabalho",
  REPARO_OFICINA: "Reparo concluído",
  RETORNO_REPARO: "Retorno do reparo",
  FOTO_ADICIONADA: "Foto adicionada",
  FOTO_REMOVIDA: "Foto removida",
  IMPRESSAO_ETIQUETA: "Etiqueta impressa · enviada ao estoque",
  REIMPRESSAO_ETIQUETA: "Etiqueta reimpressa",
  REVERSAO_ESTOQUE: "Revertida do estoque para etiquetagem",
  SAIDA_ESTOQUE: "Saída do estoque (expedição)",
  INVENTARIO_INICIADO: "Inventário iniciado",
  INVENTARIO_FINALIZADO: "Inventário finalizado",
  INVENTARIO_CANCELADO: "Inventário cancelado",
};

export function rotuloAcao(acao: string): string {
  return ROTULO_ACAO[acao] ?? acao.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

const CHAVES_OCULTAS = new Set(["_meta", "autor_id_ref", "autor_cargo", "autor_perfil", "caminho"]);

const ROTULO_CHAVE: Record<string, string> = {
  motivo: "motivo",
  detalhe_motivo: "detalhe",
  tempo_min: "tempo (min)",
  pausa_min: "pausa (min)",
  modelo_etiqueta: "modelo de etiqueta",
  retrabalhos: "retrabalhos",
  tentativa: "tentativa",
};

/** Resumo legível dos detalhes de um evento (sem metadados técnicos). */
export function resumoDetalhes(detalhes: unknown, maximo = 3): string {
  const dados = lerDetalhesLog(detalhes);
  return Object.entries(dados)
    .filter(([k, v]) => !CHAVES_OCULTAS.has(k) && v !== null && v !== undefined && v !== "")
    .slice(0, maximo)
    .map(([k, v]) => `${ROTULO_CHAVE[k] ?? k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}
