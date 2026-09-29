import { pode, type Autorizavel, type Permissao } from "./permissoes";

// Telas do sistema e a permissão exigida por cada uma (basta ter UMA da lista).
// A navegação, a busca rápida e a proteção das páginas usam esta mesma tabela.

export const GRUPOS_NAVEGACAO = ["Visão geral", "Operação", "Qualidade", "Logística", "Gestão", "Administração"] as const;
export type GrupoNavegacao = (typeof GRUPOS_NAVEGACAO)[number];

export interface RotaSistema {
  href: string;
  titulo: string;
  descricao: string;
  grupo: GrupoNavegacao | "Conta";
  permissoes: readonly Permissao[];
  /** Fora do menu lateral (acessada pelo cabeçalho). */
  oculta?: boolean;
  /** Pode ser escolhida como tela inicial de um perfil. */
  inicial?: boolean;
}

export const ROTAS: readonly RotaSistema[] = [
  { href: "/dashboard", titulo: "Painel", descricao: "Produção em tempo real", grupo: "Visão geral", permissoes: ["painel.ver"], inicial: true },
  { href: "/prontuario", titulo: "Prontuário", descricao: "Histórico completo por chassi", grupo: "Visão geral", permissoes: ["prontuario.ver"], inicial: true },
  { href: "/scanner", titulo: "Entrada", descricao: "Leitura de caixas no recebimento", grupo: "Operação", permissoes: ["scanner.registrar"], inicial: true },
  { href: "/montagem", titulo: "Montagem", descricao: "Linha de montagem", grupo: "Operação", permissoes: ["montagem.executar"], inicial: true },
  { href: "/qualidade", titulo: "Qualidade", descricao: "Inspeção final (QA)", grupo: "Qualidade", permissoes: ["qualidade.inspecionar"], inicial: true },
  { href: "/avarias", titulo: "Avarias", descricao: "Pátio de avarias e reparos", grupo: "Qualidade", permissoes: ["avarias.ver", "avarias.reparar"], inicial: true },
  { href: "/etiquetagem", titulo: "Etiquetagem", descricao: "Impressão e envio ao estoque", grupo: "Logística", permissoes: ["etiquetas.imprimir", "etiquetas.layout"], inicial: true },
  { href: "/estoque", titulo: "Estoque", descricao: "Pátio de estoque e expedição", grupo: "Logística", permissoes: ["estoque.ver"], inicial: true },
  { href: "/inventario", titulo: "Inventário", descricao: "Contagem do pátio por leitura", grupo: "Logística", permissoes: ["inventario.executar", "estoque.ver"], inicial: true },
  { href: "/relatorios", titulo: "Relatórios", descricao: "Produtividade e qualidade", grupo: "Gestão", permissoes: ["relatorios.ver"], inicial: true },
  { href: "/equipe", titulo: "Equipe", descricao: "Colaboradores e acessos", grupo: "Gestão", permissoes: ["equipe.ver", "equipe.gerenciar"], inicial: true },
  { href: "/perfis", titulo: "Perfis de acesso", descricao: "Permissões por perfil", grupo: "Administração", permissoes: ["perfis.gerenciar"] },
  { href: "/auditoria", titulo: "Auditoria", descricao: "Registro de eventos", grupo: "Administração", permissoes: ["auditoria.ver"] },
  { href: "/configuracoes", titulo: "Configurações", descricao: "Parâmetros do sistema", grupo: "Administração", permissoes: ["configuracoes.gerenciar"] },
  { href: "/notificacoes", titulo: "Notificações", descricao: "Histórico de avisos", grupo: "Conta", permissoes: [], oculta: true },
  { href: "/perfil", titulo: "Meu perfil", descricao: "Seus dados, senha e desempenho", grupo: "Conta", permissoes: [], oculta: true },
];

/** Rota correspondente ao caminho (o prefixo mais longo). */
export function rotaDoCaminho(caminho: string | null | undefined): RotaSistema | undefined {
  if (!caminho) return undefined;
  return [...ROTAS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((r) => caminho === r.href || caminho.startsWith(`${r.href}/`));
}

export function podeAcessarRota(usuario: Autorizavel | null | undefined, rota: RotaSistema | undefined): boolean {
  if (!usuario) return false;
  if (!rota) return true;
  return pode(usuario, rota.permissoes);
}

export function podeAcessarCaminho(usuario: Autorizavel | null | undefined, caminho: string): boolean {
  return podeAcessarRota(usuario, rotaDoCaminho(caminho));
}

export function rotasPermitidas(usuario: Autorizavel | null | undefined): RotaSistema[] {
  return ROTAS.filter((r) => podeAcessarRota(usuario, r));
}

/** Tela inicial do perfil; se ela não for permitida, a primeira tela que o usuário pode abrir. */
export function telaInicial(usuario: (Autorizavel & { perfil?: { tela_inicial?: string | null } | null }) | null | undefined): string {
  if (!usuario) return "/login";
  const preferida = usuario.perfil?.tela_inicial;
  if (preferida && podeAcessarCaminho(usuario, preferida)) return preferida;
  return rotasPermitidas(usuario).find((r) => !r.oculta)?.href ?? "/perfil";
}

/** Caminho interno seguro para o parâmetro ?voltar= (evita redirecionar para fora do sistema). */
export function caminhoInternoSeguro(valor: string | null | undefined): string | null {
  if (!valor || !valor.startsWith("/") || valor.startsWith("//") || valor.includes("\\")) return null;
  return valor;
}
