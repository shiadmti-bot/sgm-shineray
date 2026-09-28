// Modelo de dados das etiquetas personalizáveis.
// Unidades: dimensões e espaçamentos em milímetros (mm); tamanhos de fonte em pixels CSS (px);
// bordas em px. Textos aceitam variáveis como {chassi}, {modelo}, {data} (ver VARIAVEIS_ETIQUETA).

export type TipoBloco =
  | "cabecalho"
  | "modelo"
  | "cores"
  | "codigo_barras"
  | "qrcode"
  | "chassi"
  | "campos"
  | "texto"
  | "imagem"
  | "espaco";

export type Alinhamento = "left" | "center" | "right";
export type Fundo = "nenhum" | "preto" | "cinza";

interface BlocoBase {
  id: string;
  tipo: TipoBloco;
  visivel: boolean;
  /** Altura em mm. */
  altura: number;
  /** Ocupa o espaço que sobrar na etiqueta. */
  expandir: boolean;
  alinhamento: Alinhamento;
  fundo: Fundo;
  bordaInferior: boolean;
  /** Espaçamento interno em mm. */
  padding: number;
}

export interface BlocoCabecalho extends BlocoBase {
  tipo: "cabecalho";
  titulo: string;
  subtitulo: string;
  tamanhoTitulo: number;
  tamanhoSubtitulo: number;
  espacamentoLetras: number;
}

export interface BlocoModelo extends BlocoBase {
  tipo: "modelo";
  rotulo: string;
  tamanhoRotulo: number;
  tamanhoFonte: number;
  maiusculas: boolean;
  /** Reduz a fonte automaticamente para nomes longos caberem no bloco. */
  ajustarTexto: boolean;
}

export interface BlocoCores extends BlocoBase {
  tipo: "cores";
  rotuloCarenagem: string;
  rotuloBanco: string;
  tamanhoRotulo: number;
  tamanhoFonte: number;
  divisoria: boolean;
  mostrarBanco: boolean;
}

export type FormatoCodigoBarras = "CODE128" | "CODE39";

export interface BlocoCodigoBarras extends BlocoBase {
  tipo: "codigo_barras";
  conteudo: string;
  formato: FormatoCodigoBarras;
  /** Largura de cada barra (módulo) antes do ajuste ao bloco. */
  larguraBarra: number;
  alturaBarras: number;
  /** Largura máxima ocupada pelo código, em % da largura do bloco. */
  larguraPct: number;
  /** Estica o código para preencher toda a área (sem manter proporção). */
  esticar: boolean;
  mostrarTexto: boolean;
  tamanhoTexto: number;
}

export interface BlocoQRCode extends BlocoBase {
  tipo: "qrcode";
  conteudo: string;
  /** Lado do QR Code em mm. */
  tamanho: number;
  legenda: string;
  tamanhoLegenda: number;
  posicaoLegenda: "direita" | "abaixo" | "nenhuma";
}

export interface BlocoChassi extends BlocoBase {
  tipo: "chassi";
  rotulo: string;
  tamanhoRotulo: number;
  tamanhoFonte: number;
  espacamentoLetras: number;
  /** Quantidade de dígitos finais destacados (fundo preto). 0 = sem destaque. */
  destacarFinais: number;
}

export interface ItemCampo {
  id: string;
  rotulo: string;
  valor: string;
}

export interface BlocoCampos extends BlocoBase {
  tipo: "campos";
  itens: ItemCampo[];
  tamanhoFonte: number;
  colunas: 1 | 2;
  rotuloNegrito: boolean;
  maiusculas: boolean;
  /** Recuo lateral extra em mm. */
  recuo: number;
}

export interface BlocoTexto extends BlocoBase {
  tipo: "texto";
  texto: string;
  tamanhoFonte: number;
  negrito: boolean;
  maiusculas: boolean;
}

export interface BlocoImagem extends BlocoBase {
  tipo: "imagem";
  /** Imagem embutida (data URL). */
  src: string;
  larguraPct: number;
  pretoEBranco: boolean;
}

export interface BlocoEspaco extends BlocoBase {
  tipo: "espaco";
}

export type BlocoEtiqueta =
  | BlocoCabecalho
  | BlocoModelo
  | BlocoCores
  | BlocoCodigoBarras
  | BlocoQRCode
  | BlocoChassi
  | BlocoCampos
  | BlocoTexto
  | BlocoImagem
  | BlocoEspaco;

export interface ModeloEtiqueta {
  id: string;
  nome: string;
  largura: number;
  altura: number;
  /** Margem interna da etiqueta em mm. */
  margem: number;
  /** Borda externa em px (0 = sem borda). */
  bordaExterna: number;
  /** Espessura das linhas entre blocos, em px. */
  espessuraDivisoria: number;
  fonte: string;
  /** Calibração da impressora: desloca a impressão (mm). */
  deslocamentoX: number;
  deslocamentoY: number;
  /** Cópias impressas por moto. */
  copias: number;
  blocos: BlocoEtiqueta[];
  atualizadoEm?: string;
}

export interface ConfigEtiquetas {
  versao: 1;
  modelos: ModeloEtiqueta[];
  padraoId: string;
}

export interface DadosEtiqueta {
  sku: string;
  modelo: string;
  cor?: string | null;
  cor_banco?: string | null;
  ano?: string | number | null;
  montador?: string | null;
  supervisor?: string | null;
  localizacao?: string | null;
}

export const VARIAVEIS_ETIQUETA: { chave: string; descricao: string }[] = [
  { chave: "chassi", descricao: "Chassi completo (VIN)" },
  { chave: "chassi_final", descricao: "Últimos 4 dígitos do chassi" },
  { chave: "modelo", descricao: "Modelo / versão" },
  { chave: "cor", descricao: "Cor da carenagem" },
  { chave: "cor_banco", descricao: "Cor do banco" },
  { chave: "ano", descricao: "Ano de fabricação" },
  { chave: "montador", descricao: "Montador responsável" },
  { chave: "supervisor", descricao: "Inspetor de qualidade" },
  { chave: "localizacao", descricao: "Localização atual" },
  { chave: "data", descricao: "Data da impressão" },
  { chave: "hora", descricao: "Hora da impressão" },
];

export const ROTULO_TIPO_BLOCO: Record<TipoBloco, string> = {
  cabecalho: "Cabeçalho",
  modelo: "Modelo / Versão",
  cores: "Cores (carenagem / banco)",
  codigo_barras: "Código de barras",
  qrcode: "QR Code",
  chassi: "Chassi (VIN) em texto",
  campos: "Lista de campos",
  texto: "Texto livre",
  imagem: "Imagem / Logo",
  espaco: "Espaço em branco",
};

export const FONTES_ETIQUETA: { valor: string; rotulo: string }[] = [
  { valor: "Arial, Helvetica, sans-serif", rotulo: "Arial" },
  { valor: "'Arial Narrow', Arial, sans-serif", rotulo: "Arial Narrow (condensada)" },
  { valor: "Verdana, Geneva, sans-serif", rotulo: "Verdana" },
  { valor: "Tahoma, Geneva, sans-serif", rotulo: "Tahoma" },
  { valor: "'Segoe UI', Roboto, sans-serif", rotulo: "Segoe UI / Roboto" },
  { valor: "Impact, 'Arial Black', sans-serif", rotulo: "Impact (destaque)" },
  { valor: "'Courier New', Courier, monospace", rotulo: "Courier New (monoespaçada)" },
];

export const TAMANHOS_PRESET: { rotulo: string; largura: number; altura: number }[] = [
  { rotulo: "100 × 150 mm (caixa)", largura: 100, altura: 150 },
  { rotulo: "100 × 100 mm", largura: 100, altura: 100 },
  { rotulo: "100 × 50 mm", largura: 100, altura: 50 },
  { rotulo: "70 × 50 mm (sub-banco)", largura: 70, altura: 50 },
  { rotulo: "60 × 40 mm", largura: 60, altura: 40 },
  { rotulo: "50 × 30 mm", largura: 50, altura: 30 },
];
