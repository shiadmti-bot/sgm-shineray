// Catálogos e regras compartilhadas entre os módulos.
// Listas editáveis (cores, checklist, modelos extras) têm aqui apenas o valor PADRÃO;
// o valor efetivo vem de Configurações (src/lib/config-sistema.ts).

export interface CorCatalogo {
  /** Valor gravado no banco (não alterar depois de em uso). */
  nome: string;
  /** Texto exibido na lista de seleção. */
  descricao?: string;
  /** Cor usada nos indicadores visuais da interface. */
  hex: string;
}

export const CORES_CARENAGEM_PADRAO: CorCatalogo[] = [
  { nome: "Vermelha", descricao: "Vermelha (Padrão)", hex: "#ef4444" },
  { nome: "Vermelha Fosca", descricao: "Vermelha Fosca (Iron/Titanium)", hex: "#991b1b" },
  { nome: "Preta", descricao: "Preta Brilhante", hex: "#000000" },
  { nome: "Preta Fosca", descricao: "Preta Fosca", hex: "#27272a" },
  { nome: "Branca", descricao: "Branca Sólida", hex: "#ffffff" },
  { nome: "Branca Pérola", descricao: "Branca Pérola", hex: "#f8fafc" },
  { nome: "Bege", descricao: "Bege (New Jet 2026)", hex: "#d6d3d1" },
  { nome: "Azul", descricao: "Azul", hex: "#3b82f6" },
  { nome: "Cinza", descricao: "Cinza / Prata", hex: "#94a3b8" },
  { nome: "Cinza Nardo", descricao: "Cinza Nardo (Sólido)", hex: "#64748b" },
  { nome: "Cinza Fosco", descricao: "Cinza Fosco (JEF 150s)", hex: "#475569" },
  { nome: "Verde Militar", descricao: "Verde Militar", hex: "#4d5d3a" },
  { nome: "Amarela", descricao: "Amarela", hex: "#eab308" },
  { nome: "Laranja", descricao: "Laranja", hex: "#f97316" },
];

export const CORES_BANCO_PADRAO: CorCatalogo[] = [
  { nome: "Azul", descricao: "Azul", hex: "#3b82f6" },
  { nome: "Preto", descricao: "Preto", hex: "#000000" },
  { nome: "Marrom", descricao: "Marrom Escuro", hex: "#78350f" },
  { nome: "Marrom Claro", descricao: "Marrom Claro / Tabaco", hex: "#a16207" },
  { nome: "Bege", descricao: "Bege / Caramelo", hex: "#d6d3d1" },
  { nome: "Vermelho", descricao: "Vermelho", hex: "#dc2626" },
  { nome: "Vinho", descricao: "Vinho", hex: "#7f1d1d" },
  { nome: "Cinza", descricao: "Cinza", hex: "#64748b" },
];

export const CHECKLIST_MONTAGEM_PADRAO = [
  "Aperto da roda dianteira",
  "Aperto da roda traseira",
  "Aperto do guidão",
  "Aperto do motor",
  "Instalação de bateria",
  "Teste elétrico (Farol/Seta)",
  "Calibragem de pneus",
  "Ajuste de corrente",
  "Verificação de óleo",
  "Retrovisores fixados",
];

export const MOTIVOS_PAUSA = [
  "Almoço / Refeição",
  "Banheiro",
  "Falta de peça",
  "Problema de ferramenta",
  "Chamado do supervisor",
  "Mal-estar",
];

export const TIPOS_AVARIA = [
  { valor: "avaria_mecanica", rotulo: "Mecânica / Motor", emoji: "🔧" },
  { valor: "avaria_pintura", rotulo: "Pintura / Carenagem", emoji: "🎨" },
  { valor: "avaria_estrutura", rotulo: "Estrutura / Chassi", emoji: "🏗️" },
  { valor: "avaria_pecas", rotulo: "Peças Faltantes", emoji: "⚙️" },
] as const;

export function rotuloAvaria(status?: string | null): string {
  const tipo = TIPOS_AVARIA.find((t) => t.valor === status);
  if (tipo) return tipo.rotulo;
  return (status || "").replace("avaria_", "").replace(/_/g, " ") || "Avaria";
}

/** Status que significam "aprovada pelo QA" (inclui as que só aguardam etiqueta). */
export const STATUS_APROVADOS = ["aprovado", "aguardando_etiqueta", "estoque", "expedido"];

export const ROTULO_STATUS: Record<string, string> = {
  aguardando_montagem: "Aguardando Montagem",
  em_producao: "Em Produção",
  pausado: "Pausado",
  retrabalho_montagem: "Retrabalho",
  em_analise: "Em Inspeção (QA)",
  aguardando_etiqueta: "Aguardando Etiqueta",
  aprovado: "Aprovado",
  estoque: "Em Estoque",
  expedido: "Expedido",
  avaria_mecanica: "Avaria Mecânica",
  avaria_pintura: "Avaria Pintura",
  avaria_estrutura: "Avaria Estrutura",
  avaria_pecas: "Peças Faltantes",
};

export function rotuloStatus(status?: string | null): string {
  if (!status) return "—";
  return ROTULO_STATUS[status] || status.replace(/_/g, " ").toUpperCase();
}

/**
 * Cor de exibição para um nome de cor. Procura primeiro nos catálogos (exato),
 * depois usa heurística por palavra-chave para valores antigos/digitados à mão.
 */
export function getHexColor(nomeCor?: string | null, catalogos: CorCatalogo[][] = [CORES_CARENAGEM_PADRAO, CORES_BANCO_PADRAO]): string {
  if (!nomeCor) return "#94a3b8";
  const alvo = nomeCor.trim().toLowerCase();
  for (const lista of catalogos) {
    const achou = lista.find((c) => c.nome.toLowerCase() === alvo);
    if (achou) return achou.hex;
  }
  if (alvo.includes("preta fosca") || alvo.includes("preto fosco")) return "#27272a";
  if (alvo.includes("pret")) return "#000000";
  if (alvo.includes("branc")) return "#ffffff";
  if (alvo.includes("vermelha fosca")) return "#991b1b";
  if (alvo.includes("vinho")) return "#7f1d1d";
  if (alvo.includes("vermelh")) return "#ef4444";
  if (alvo.includes("azul fosco")) return "#1e3a8a";
  if (alvo.includes("azul")) return "#3b82f6";
  if (alvo.includes("amarel")) return "#eab308";
  if (alvo.includes("verde")) return "#22c55e";
  if (alvo.includes("bege")) return "#d6d3d1";
  if (alvo.includes("prata")) return "#cbd5e1";
  if (alvo.includes("nardo") || alvo.includes("cinza")) return "#64748b";
  if (alvo.includes("marrom")) return "#78350f";
  if (alvo.includes("laranja")) return "#f97316";
  return "#94a3b8";
}

/** Primeiro nome em maiúsculas iniciais, com fallback. */
export function primeiroNome(nome?: string | null, fallback = "—"): string {
  if (!nome) return fallback;
  return nome.trim().split(/\s+/)[0] || fallback;
}
