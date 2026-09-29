// Catálogo de permissões do SGM (RBAC).
// A MESMA lista existe no banco em privado.permissoes_validas() (supabase/migrations/*_v2_fase1_estrutura.sql):
// ao criar uma permissão nova, atualize os dois lugares.

export const GRUPOS_PERMISSAO = ["Visão geral", "Operação", "Qualidade", "Logística", "Gestão", "Administração"] as const;
export type GrupoPermissao = (typeof GRUPOS_PERMISSAO)[number];

export const PERMISSOES = [
  { chave: "painel.ver", grupo: "Visão geral", rotulo: "Ver a Central da linha", descricao: "Fluxo das estações, meta do dia e alertas em tempo real." },
  { chave: "prontuario.ver", grupo: "Visão geral", rotulo: "Consultar prontuário", descricao: "Histórico completo de cada chassi e busca rápida (Ctrl+K)." },
  { chave: "scanner.registrar", grupo: "Operação", rotulo: "Registrar entrada", descricao: "Leitura de caixas no recebimento (scanner)." },
  { chave: "montagem.executar", grupo: "Operação", rotulo: "Montar motos", descricao: "Assumir, montar, pedir pausa e finalizar montagens." },
  { chave: "montagem.remover", grupo: "Operação", rotulo: "Remover da fila", descricao: "Excluir motos que ainda aguardam montagem." },
  { chave: "pausas.aprovar", grupo: "Operação", rotulo: "Autorizar pausas", descricao: "Aprovar ou negar pedidos de pausa da linha." },
  { chave: "qualidade.inspecionar", grupo: "Qualidade", rotulo: "Inspecionar (QA)", descricao: "Aprovar, devolver para retrabalho ou enviar para avaria." },
  { chave: "avarias.ver", grupo: "Qualidade", rotulo: "Ver pátio de avarias", descricao: "Consultar motos com avaria e histórico de reparos." },
  { chave: "avarias.reparar", grupo: "Qualidade", rotulo: "Registrar reparos", descricao: "Concluir reparos e devolver a moto para a Qualidade." },
  { chave: "etiquetas.imprimir", grupo: "Logística", rotulo: "Imprimir etiquetas", descricao: "Etiquetar motos aprovadas e enviá-las ao estoque." },
  { chave: "etiquetas.layout", grupo: "Logística", rotulo: "Editar layout de etiquetas", descricao: "Criar e alterar modelos de etiqueta." },
  { chave: "estoque.ver", grupo: "Logística", rotulo: "Ver estoque", descricao: "Consultar o pátio de estoque e reimprimir etiquetas." },
  { chave: "estoque.editar", grupo: "Logística", rotulo: "Editar estoque", descricao: "Corrigir dados das motos e reverter para etiquetagem." },
  { chave: "estoque.expedir", grupo: "Logística", rotulo: "Registrar expedição", descricao: "Dar saída de motos do estoque." },
  { chave: "inventario.executar", grupo: "Logística", rotulo: "Fazer inventário", descricao: "Contar o pátio por leitura e apontar faltas e sobras." },
  { chave: "relatorios.ver", grupo: "Gestão", rotulo: "Ver relatórios", descricao: "Produtividade, qualidade, pausas e exportação." },
  { chave: "equipe.ver", grupo: "Gestão", rotulo: "Ver equipe", descricao: "Lista de colaboradores, desempenho e último acesso." },
  { chave: "equipe.gerenciar", grupo: "Gestão", rotulo: "Gerenciar equipe", descricao: "Cadastrar, editar, arquivar e redefinir acessos." },
  { chave: "perfis.gerenciar", grupo: "Administração", rotulo: "Gerenciar perfis de acesso", descricao: "Criar perfis e definir as permissões de cada um." },
  { chave: "auditoria.ver", grupo: "Administração", rotulo: "Ver auditoria", descricao: "Todos os eventos do sistema, inclusive acessos." },
  { chave: "configuracoes.gerenciar", grupo: "Administração", rotulo: "Alterar configurações", descricao: "Metas, alertas e parâmetros gerais do sistema." },
] as const satisfies ReadonlyArray<{ chave: string; grupo: GrupoPermissao; rotulo: string; descricao: string }>;

export type Permissao = (typeof PERMISSOES)[number]["chave"];

export const CHAVES_PERMISSAO: readonly Permissao[] = PERMISSOES.map((p) => p.chave);

/** Permissões que só o Master (ou quem já as tem) pode conceder a outras pessoas. */
export const PERMISSOES_SENSIVEIS: readonly Permissao[] = ["perfis.gerenciar"];

export function ehPermissao(valor: string): valor is Permissao {
  return (CHAVES_PERMISSAO as readonly string[]).includes(valor);
}

export function rotuloPermissao(chave: string): string {
  return PERMISSOES.find((p) => p.chave === chave)?.rotulo ?? chave;
}

/** Quem pode o quê. `master` sempre pode tudo. */
export interface Autorizavel {
  master: boolean;
  permissoes: readonly string[];
}

/** `true` se tiver a permissão (ou QUALQUER uma delas, quando recebe uma lista). */
export function pode(usuario: Autorizavel | null | undefined, permissao: Permissao | readonly Permissao[]): boolean {
  if (!usuario) return false;
  if (usuario.master) return true;
  const lista = typeof permissao === "string" ? [permissao] : permissao;
  if (lista.length === 0) return true;
  return lista.some((p) => usuario.permissoes.includes(p));
}
