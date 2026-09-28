import type {
  BlocoEtiqueta,
  ConfigEtiquetas,
  ItemCampo,
  ModeloEtiqueta,
  TipoBloco,
} from "./tipos";

export function novoId(prefixo = "b"): string {
  return `${prefixo}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

const BASE = {
  visivel: true,
  expandir: false,
  alinhamento: "center" as const,
  fundo: "nenhum" as const,
  bordaInferior: true,
  padding: 2,
};

/** Bloco novo com valores padrão sensatos para cada tipo. */
export function criarBloco(tipo: TipoBloco): BlocoEtiqueta {
  const id = novoId();
  switch (tipo) {
    case "cabecalho":
      return { ...BASE, id, tipo, altura: 15, fundo: "preto", titulo: "BY SABEL", subtitulo: "SISTEMA DE GESTÃO DE MONTAGEM", tamanhoTitulo: 20, tamanhoSubtitulo: 8, espacamentoLetras: 4 };
    case "modelo":
      return { ...BASE, id, tipo, altura: 30, rotulo: "MODELO / VERSÃO", tamanhoRotulo: 9, tamanhoFonte: 30, maiusculas: true, ajustarTexto: true };
    case "cores":
      return { ...BASE, id, tipo, altura: 20, rotuloCarenagem: "COR CARENAGEM", rotuloBanco: "COR BANCO", tamanhoRotulo: 9, tamanhoFonte: 16, divisoria: true, mostrarBanco: true };
    case "codigo_barras":
      return { ...BASE, id, tipo, altura: 30, conteudo: "{chassi}", formato: "CODE128", larguraBarra: 2, alturaBarras: 60, larguraPct: 95, esticar: true, mostrarTexto: false, tamanhoTexto: 12 };
    case "qrcode":
      return { ...BASE, id, tipo, altura: 30, conteudo: "{chassi}", tamanho: 24, legenda: "{modelo}\n{chassi}", tamanhoLegenda: 10, posicaoLegenda: "direita" };
    case "chassi":
      return { ...BASE, id, tipo, altura: 15, rotulo: "NÚMERO DO CHASSI (VIN)", tamanhoRotulo: 7, tamanhoFonte: 20, espacamentoLetras: 2, destacarFinais: 0 };
    case "campos":
      return {
        ...BASE, id, tipo, altura: 20, alinhamento: "left", tamanhoFonte: 10, colunas: 1, rotuloNegrito: true, maiusculas: true, recuo: 3,
        itens: [
          { id: novoId("c"), rotulo: "DATA:", valor: "{data} {hora}" },
          { id: novoId("c"), rotulo: "MONTADOR:", valor: "{montador}" },
        ],
      };
    case "texto":
      return { ...BASE, id, tipo, altura: 10, texto: "Texto da etiqueta", tamanhoFonte: 12, negrito: true, maiusculas: false };
    case "imagem":
      return { ...BASE, id, tipo, altura: 15, src: "", larguraPct: 60, pretoEBranco: true };
    case "espaco":
      return { ...BASE, id, tipo, altura: 5, bordaInferior: false, padding: 0 };
  }
}

function campos(itens: [string, string][]): ItemCampo[] {
  return itens.map(([rotulo, valor]) => ({ id: novoId("c"), rotulo, valor }));
}

/** Reproduz fielmente a etiqueta de caixa usada até a versão 2.x (100 × 150 mm). */
export function modeloCaixa100x150(): ModeloEtiqueta {
  return {
    id: "caixa-100x150",
    nome: "Etiqueta de Caixa",
    largura: 100,
    altura: 150,
    margem: 0,
    bordaExterna: 3,
    espessuraDivisoria: 2,
    fonte: "Arial, Helvetica, sans-serif",
    deslocamentoX: 0,
    deslocamentoY: 0,
    copias: 1,
    blocos: [
      { ...BASE, id: "cx-cabecalho", tipo: "cabecalho", altura: 15, fundo: "preto", titulo: "BY SABEL", subtitulo: "SISTEMA DE GESTÃO DE MONTAGEM", tamanhoTitulo: 20, tamanhoSubtitulo: 8, espacamentoLetras: 4 },
      { ...BASE, id: "cx-modelo", tipo: "modelo", altura: 35, rotulo: "MODELO / VERSÃO", tamanhoRotulo: 9, tamanhoFonte: 34, maiusculas: true, ajustarTexto: true },
      { ...BASE, id: "cx-cores", tipo: "cores", altura: 25, rotuloCarenagem: "COR CARENAGEM", rotuloBanco: "COR BANCO", tamanhoRotulo: 9, tamanhoFonte: 18, divisoria: true, mostrarBanco: true },
      { ...BASE, id: "cx-barras", tipo: "codigo_barras", altura: 40, conteudo: "{chassi}", formato: "CODE128", larguraBarra: 3, alturaBarras: 80, larguraPct: 95, esticar: false, mostrarTexto: false, tamanhoTexto: 14 },
      { ...BASE, id: "cx-chassi", tipo: "chassi", altura: 15, fundo: "cinza", rotulo: "NÚMERO DO CHASSI (VIN)", tamanhoRotulo: 7, tamanhoFonte: 22, espacamentoLetras: 2, destacarFinais: 0 },
      {
        ...BASE, id: "cx-rodape", tipo: "campos", altura: 20, alinhamento: "left", bordaInferior: false, tamanhoFonte: 10, colunas: 1, rotuloNegrito: true, maiusculas: true, recuo: 0,
        itens: campos([
          ["DATA:", "{data} {hora}"],
          ["MONTADOR:", "{montador}"],
          ["ANO FAB:", "{ano}"],
          ["DESTINO:", "ESTOQUE PRINCIPAL"],
        ]),
      },
    ],
  };
}

/** Etiqueta compacta para fixar sob o banco (70 × 50 mm), citada no manual da impressora. */
export function modeloSubBanco70x50(): ModeloEtiqueta {
  return {
    id: "subbanco-70x50",
    nome: "Etiqueta Sub-banco",
    largura: 70,
    altura: 50,
    margem: 0,
    bordaExterna: 2,
    espessuraDivisoria: 1,
    fonte: "Arial, Helvetica, sans-serif",
    deslocamentoX: 0,
    deslocamentoY: 0,
    copias: 1,
    blocos: [
      { ...BASE, id: "sb-modelo", tipo: "modelo", altura: 13, padding: 1, rotulo: "MODELO", tamanhoRotulo: 6, tamanhoFonte: 16, maiusculas: true, ajustarTexto: true },
      { ...BASE, id: "sb-cores", tipo: "cores", altura: 9, padding: 1, rotuloCarenagem: "CARENAGEM", rotuloBanco: "BANCO", tamanhoRotulo: 6, tamanhoFonte: 10, divisoria: true, mostrarBanco: true },
      { ...BASE, id: "sb-barras", tipo: "codigo_barras", altura: 17, padding: 1, conteudo: "{chassi}", formato: "CODE128", larguraBarra: 2, alturaBarras: 60, larguraPct: 96, esticar: true, mostrarTexto: false, tamanhoTexto: 10 },
      { ...BASE, id: "sb-chassi", tipo: "chassi", altura: 11, padding: 1, bordaInferior: false, rotulo: "", tamanhoRotulo: 6, tamanhoFonte: 14, espacamentoLetras: 1, destacarFinais: 4 },
    ],
  };
}

export function modeloEmBranco(): ModeloEtiqueta {
  return {
    id: novoId("m"),
    nome: "Novo modelo",
    largura: 100,
    altura: 50,
    margem: 0,
    bordaExterna: 2,
    espessuraDivisoria: 1,
    fonte: "Arial, Helvetica, sans-serif",
    deslocamentoX: 0,
    deslocamentoY: 0,
    copias: 1,
    blocos: [
      { ...(criarBloco("modelo") as Extract<BlocoEtiqueta, { tipo: "modelo" }>), altura: 15, tamanhoFonte: 20 },
      { ...(criarBloco("codigo_barras") as Extract<BlocoEtiqueta, { tipo: "codigo_barras" }>), altura: 22 },
      { ...(criarBloco("chassi") as Extract<BlocoEtiqueta, { tipo: "chassi" }>), altura: 13, rotulo: "", tamanhoFonte: 16, bordaInferior: false },
    ],
  };
}

export function configEtiquetasPadrao(): ConfigEtiquetas {
  const caixa = modeloCaixa100x150();
  return { versao: 1, modelos: [caixa, modeloSubBanco70x50()], padraoId: caixa.id };
}

// --- Normalização (dados vindos do banco, de arquivos importados ou de versões antigas) ---

function limitar(v: unknown, min: number, max: number, padrao: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, n));
}

const TIPOS_VALIDOS: TipoBloco[] = ["cabecalho", "modelo", "cores", "codigo_barras", "qrcode", "chassi", "campos", "texto", "imagem", "espaco"];

function normalizarBloco(bruto: unknown): BlocoEtiqueta | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  const tipo = b.tipo as TipoBloco;
  if (!TIPOS_VALIDOS.includes(tipo)) return null;

  const base = criarBloco(tipo) as unknown as Record<string, unknown>;
  const mesclado: Record<string, unknown> = { ...base, ...b, tipo };
  mesclado.id = typeof b.id === "string" && b.id ? b.id : base.id;
  mesclado.visivel = b.visivel !== false;
  mesclado.expandir = b.expandir === true;
  mesclado.bordaInferior = b.bordaInferior === undefined ? base.bordaInferior : Boolean(b.bordaInferior);
  mesclado.altura = limitar(b.altura, 1, 400, base.altura as number);
  mesclado.padding = limitar(b.padding, 0, 20, base.padding as number);
  if (!["left", "center", "right"].includes(String(mesclado.alinhamento))) mesclado.alinhamento = base.alinhamento;
  if (!["nenhum", "preto", "cinza"].includes(String(mesclado.fundo))) mesclado.fundo = base.fundo;

  // Números específicos de cada tipo
  for (const chave of Object.keys(base)) {
    if (typeof base[chave] === "number" && chave !== "altura" && chave !== "padding") {
      mesclado[chave] = limitar(mesclado[chave], 0, 400, base[chave] as number);
    }
  }
  if (tipo === "campos") {
    const itens = Array.isArray(b.itens) ? b.itens : (base.itens as ItemCampo[]);
    mesclado.itens = itens
      .filter((i) => i && typeof i === "object")
      .map((i) => ({ id: typeof i.id === "string" ? i.id : novoId("c"), rotulo: String(i.rotulo ?? ""), valor: String(i.valor ?? "") }));
    mesclado.colunas = Number(b.colunas) === 2 ? 2 : 1;
  }
  if (tipo === "codigo_barras" && !["CODE128", "CODE39"].includes(String(mesclado.formato))) mesclado.formato = "CODE128";
  if (tipo === "qrcode" && !["direita", "abaixo", "nenhuma"].includes(String(mesclado.posicaoLegenda))) mesclado.posicaoLegenda = "direita";
  if (tipo === "imagem" && typeof mesclado.src === "string" && mesclado.src && !/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(mesclado.src)) {
    mesclado.src = "";
  }
  return mesclado as unknown as BlocoEtiqueta;
}

export function normalizarModelo(bruto: unknown): ModeloEtiqueta | null {
  if (!bruto || typeof bruto !== "object") return null;
  const m = bruto as Record<string, unknown>;
  const base = modeloEmBranco();
  const blocos = Array.isArray(m.blocos) ? m.blocos.map(normalizarBloco).filter((b): b is BlocoEtiqueta => !!b) : base.blocos;
  return {
    id: typeof m.id === "string" && m.id ? m.id : base.id,
    nome: typeof m.nome === "string" && m.nome.trim() ? m.nome.trim().slice(0, 80) : base.nome,
    largura: limitar(m.largura, 20, 300, base.largura),
    altura: limitar(m.altura, 10, 400, base.altura),
    margem: limitar(m.margem, 0, 20, base.margem),
    bordaExterna: limitar(m.bordaExterna, 0, 10, base.bordaExterna),
    espessuraDivisoria: limitar(m.espessuraDivisoria, 0, 10, base.espessuraDivisoria),
    fonte: typeof m.fonte === "string" && m.fonte ? m.fonte : base.fonte,
    deslocamentoX: limitar(m.deslocamentoX, -20, 20, 0),
    deslocamentoY: limitar(m.deslocamentoY, -20, 20, 0),
    copias: Math.round(limitar(m.copias, 1, 10, 1)),
    blocos,
    atualizadoEm: typeof m.atualizadoEm === "string" ? m.atualizadoEm : undefined,
  };
}

export function normalizarConfigEtiquetas(bruto: unknown): ConfigEtiquetas {
  const padrao = configEtiquetasPadrao();
  if (!bruto || typeof bruto !== "object") return padrao;
  const c = bruto as Record<string, unknown>;
  const modelos = Array.isArray(c.modelos)
    ? c.modelos.map(normalizarModelo).filter((m): m is ModeloEtiqueta => !!m)
    : [];
  if (modelos.length === 0) return padrao;

  // IDs únicos (arquivos importados podem repetir)
  const vistos = new Set<string>();
  for (const m of modelos) {
    if (vistos.has(m.id)) m.id = novoId("m");
    vistos.add(m.id);
  }
  const padraoId = modelos.some((m) => m.id === c.padraoId) ? String(c.padraoId) : modelos[0].id;
  return { versao: 1, modelos, padraoId };
}
