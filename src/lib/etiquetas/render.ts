import JsBarcode from "jsbarcode";
import type {
  BlocoCampos,
  BlocoCabecalho,
  BlocoChassi,
  BlocoCodigoBarras,
  BlocoCores,
  BlocoEtiqueta,
  BlocoImagem,
  BlocoModelo,
  BlocoQRCode,
  BlocoTexto,
  DadosEtiqueta,
  ModeloEtiqueta,
} from "./tipos";

// Gera o HTML das etiquetas. O mesmo HTML é usado na pré-visualização e na impressão
// (o que se vê é o que sai na impressora). Não depende de scripts nem de CDN: códigos de
// barras e QR Codes são gerados aqui como SVG.

export const MM_PARA_PX = 96 / 25.4;

export const DADOS_EXEMPLO: DadosEtiqueta = {
  sku: "99HNJ1125T8000462",
  modelo: "JET 125 2026",
  cor: "Vermelha",
  cor_banco: "Preto",
  ano: "2026",
  montador: "João Montador",
  supervisor: "Maria Supervisora",
  localizacao: "Pátio Montada (Aguardando Etiqueta)",
};

export function escaparHTML(valor: unknown): string {
  return String(valor ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  );
}

export function montarVariaveis(dados: DadosEtiqueta, agora: Date = new Date()): Record<string, string> {
  const chassi = String(dados.sku || "").toUpperCase();
  return {
    chassi,
    sku: chassi,
    chassi_final: chassi.slice(-4),
    modelo: dados.modelo || "",
    cor: dados.cor || "",
    cor_banco: dados.cor_banco || "",
    ano: dados.ano != null ? String(dados.ano) : "",
    montador: dados.montador || "",
    supervisor: dados.supervisor || "",
    localizacao: dados.localizacao || "",
    data: agora.toLocaleDateString("pt-BR"),
    hora: agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}

/** Substitui {variavel} pelos dados da moto. Variáveis desconhecidas ficam como estão. */
export function aplicarVariaveis(modelo: string, vars: Record<string, string>): string {
  return String(modelo ?? "").replace(/\{(\w+)\}/g, (trecho, chave: string) => (chave in vars ? vars[chave] : trecho));
}

function textoHTML(modelo: string, vars: Record<string, string>, maiusculas = false): string {
  let texto = aplicarVariaveis(modelo, vars);
  if (maiusculas) texto = texto.toUpperCase();
  return escaparHTML(texto).replace(/\r?\n/g, "<br>");
}

const num = (v: unknown, min: number, max: number, padrao: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};

/** Mantém só caracteres seguros num valor de font-family. */
function fonteSegura(fonte: string): string {
  return (fonte || "Arial, sans-serif").replace(/[^\w\s,'"-]/g, "") || "Arial, sans-serif";
}

function erroCodigo(mensagem: string): string {
  return `<div class="erro-codigo">${escaparHTML(mensagem)}</div>`;
}

// --- Códigos ---

export function gerarSVGCodigoBarras(valor: string, bloco: BlocoCodigoBarras): string {
  if (typeof document === "undefined") return "";
  if (!valor) return erroCodigo("SEM CONTEÚDO PARA O CÓDIGO");
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    let valido = true;
    JsBarcode(svg, valor, {
      format: bloco.formato,
      width: num(bloco.larguraBarra, 1, 6, 2),
      height: num(bloco.alturaBarras, 10, 400, 60),
      displayValue: false,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
      valid: (ok: boolean) => {
        valido = ok;
      },
    });
    if (!valido) return erroCodigo(`CONTEÚDO INVÁLIDO PARA ${bloco.formato}`);
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("preserveAspectRatio", bloco.esticar ? "none" : "xMidYMid meet");
    svg.setAttribute("class", "barcode");
    return svg.outerHTML;
  } catch {
    return erroCodigo(`CONTEÚDO INVÁLIDO PARA ${bloco.formato}`);
  }
}

type ModuloZxing = typeof import("@zxing/library");

export function gerarSVGQRCode(valor: string, zxing: ModuloZxing | null): string {
  if (!valor) return erroCodigo("SEM CONTEÚDO");
  if (!zxing) return erroCodigo("QR INDISPONÍVEL");
  try {
    const dicas = new Map();
    dicas.set(zxing.EncodeHintType.MARGIN, 2);
    dicas.set(zxing.EncodeHintType.ERROR_CORRECTION, "M");
    const matriz = new zxing.QRCodeWriter().encode(valor, zxing.BarcodeFormat.QR_CODE, 0, 0, dicas);
    const largura = matriz.getWidth();
    const altura = matriz.getHeight();
    let caminho = "";
    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++) {
        if (matriz.get(x, y)) caminho += `M${x} ${y}h1v1h-1z`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" shape-rendering="crispEdges" class="qrcode"><rect width="${largura}" height="${altura}" fill="#fff"/><path d="${caminho}" fill="#000"/></svg>`;
  } catch {
    return erroCodigo("CONTEÚDO LONGO DEMAIS PARA QR");
  }
}

// --- Ajuste automático de fonte (estimativa sem medir no navegador) ---

function ajustarFonte(texto: string, fonteMax: number, larguraMm: number, alturaMm: number, fatorLargura = 0.68): number {
  const larguraPx = Math.max(10, larguraMm * MM_PARA_PX);
  const alturaPx = Math.max(6, alturaMm * MM_PARA_PX);
  // +10% de folga: a quebra acontece entre palavras, não no meio delas.
  const caracteres = Math.max(1, texto.length) * 1.1;
  for (let f = Math.round(fonteMax); f > 6; f--) {
    const porLinha = Math.max(1, Math.floor(larguraPx / (f * fatorLargura)));
    const linhas = Math.ceil(caracteres / porLinha);
    if (linhas * f * 1.08 <= alturaPx) return f;
  }
  return 6;
}

// --- Blocos ---

interface Contexto {
  vars: Record<string, string>;
  /** Largura útil dentro da etiqueta (mm), já descontando margens e bordas. */
  larguraUtil: number;
  zxing: ModuloZxing | null;
}

function rotuloHTML(texto: string, tamanho: number, vars: Record<string, string>): string {
  if (!texto?.trim()) return "";
  return `<span class="rotulo" style="font-size:${num(tamanho, 4, 60, 9)}px">${textoHTML(texto, vars)}</span>`;
}

function blocoCabecalho(b: BlocoCabecalho, ctx: Contexto): string {
  const titulo = b.titulo?.trim()
    ? `<div class="cab-titulo" style="font-size:${num(b.tamanhoTitulo, 6, 120, 20)}px;letter-spacing:${num(b.espacamentoLetras, 0, 30, 0)}px">${textoHTML(b.titulo, ctx.vars)}</div>`
    : "";
  const subtitulo = b.subtitulo?.trim()
    ? `<div class="cab-sub" style="font-size:${num(b.tamanhoSubtitulo, 4, 60, 8)}px">${textoHTML(b.subtitulo, ctx.vars)}</div>`
    : "";
  return titulo + subtitulo;
}

function blocoModelo(b: BlocoModelo, ctx: Contexto): string {
  let texto = aplicarVariaveis("{modelo}", ctx.vars);
  if (b.maiusculas) texto = texto.toUpperCase();
  let fonte = num(b.tamanhoFonte, 6, 160, 30);
  if (b.ajustarTexto) {
    const alturaRotulo = b.rotulo?.trim() ? (num(b.tamanhoRotulo, 4, 60, 9) + 3) / MM_PARA_PX : 0;
    fonte = ajustarFonte(texto, fonte, ctx.larguraUtil - 2 * b.padding, b.altura - 2 * b.padding - alturaRotulo);
  }
  return `${rotuloHTML(b.rotulo, b.tamanhoRotulo, ctx.vars)}<div class="valor-modelo" style="font-size:${fonte}px">${escaparHTML(texto)}</div>`;
}

function blocoCores(b: BlocoCores, ctx: Contexto): string {
  const fonte = num(b.tamanhoFonte, 6, 80, 16);
  const caixa = (rotulo: string, valor: string) =>
    `<div class="cor-box">${rotuloHTML(rotulo, b.tamanhoRotulo, ctx.vars)}<span class="valor-cor" style="font-size:${fonte}px">${escaparHTML(valor || "—")}</span></div>`;
  const carenagem = caixa(b.rotuloCarenagem, ctx.vars.cor);
  if (!b.mostrarBanco) return `<div class="cores uma">${carenagem}</div>`;
  const banco = caixa(b.rotuloBanco, ctx.vars.cor_banco);
  return b.divisoria
    ? `<div class="cores">${carenagem}<div class="linha-v"></div>${banco}</div>`
    : `<div class="cores sem-divisoria">${carenagem}${banco}</div>`;
}

function blocoCodigoBarras(b: BlocoCodigoBarras, ctx: Contexto): string {
  const valor = aplicarVariaveis(b.conteudo || "{chassi}", ctx.vars).trim();
  const svg = gerarSVGCodigoBarras(valor, b);
  const texto = b.mostrarTexto && valor
    ? `<div class="barcode-texto" style="font-size:${num(b.tamanhoTexto, 5, 60, 12)}px">${escaparHTML(valor)}</div>`
    : "";
  return `<div class="barcode-area" style="width:${num(b.larguraPct, 20, 100, 95)}%">${svg}</div>${texto}`;
}

function blocoQRCode(b: BlocoQRCode, ctx: Contexto): string {
  const valor = aplicarVariaveis(b.conteudo || "{chassi}", ctx.vars).trim();
  const lado = num(b.tamanho, 5, 200, 24);
  const qr = `<div class="qr-area" style="width:${lado}mm;height:${lado}mm">${gerarSVGQRCode(valor, ctx.zxing)}</div>`;
  if (b.posicaoLegenda === "nenhuma" || !b.legenda?.trim()) return qr;
  const legenda = `<div class="qr-legenda" style="font-size:${num(b.tamanhoLegenda, 5, 60, 10)}px">${textoHTML(b.legenda, ctx.vars)}</div>`;
  return `<div class="qr ${b.posicaoLegenda === "abaixo" ? "qr-abaixo" : "qr-direita"}">${qr}${legenda}</div>`;
}

function blocoChassi(b: BlocoChassi, ctx: Contexto): string {
  const chassi = ctx.vars.chassi;
  const espacamento = num(b.espacamentoLetras, 0, 20, 2);
  let fonte = num(b.tamanhoFonte, 6, 80, 20);
  // Uma linha só: reduz a fonte se o chassi não couber na largura.
  const larguraPx = Math.max(10, (ctx.larguraUtil - 2 * b.padding) * MM_PARA_PX);
  const caracteres = Math.max(1, chassi.length);
  const maxFonte = (larguraPx - caracteres * espacamento) / (caracteres * 0.62);
  fonte = Math.max(6, Math.min(fonte, Math.floor(maxFonte)));

  const finais = Math.round(num(b.destacarFinais, 0, 17, 0));
  const corpo = finais > 0 && chassi.length > finais
    ? `${escaparHTML(chassi.slice(0, -finais))}<span class="destaque">${escaparHTML(chassi.slice(-finais))}</span>`
    : escaparHTML(chassi);
  return `${rotuloHTML(b.rotulo, b.tamanhoRotulo, ctx.vars)}<div class="chassi-valor" style="font-size:${fonte}px;letter-spacing:${espacamento}px">${corpo}</div>`;
}

function blocoCampos(b: BlocoCampos, ctx: Contexto): string {
  const itens = (b.itens || [])
    .map((i) => {
      const rotulo = textoHTML(i.rotulo, ctx.vars, b.maiusculas);
      const valor = textoHTML(i.valor, ctx.vars, b.maiusculas);
      return `<span class="campo-rotulo${b.rotuloNegrito ? " negrito" : ""}">${rotulo}</span><span class="campo-valor">${valor}</span>`;
    })
    .join("");
  return `<div class="campos c${b.colunas === 2 ? 2 : 1}" style="font-size:${num(b.tamanhoFonte, 5, 60, 10)}px;padding:0 ${num(b.recuo, 0, 30, 0)}mm">${itens}</div>`;
}

function blocoTexto(b: BlocoTexto, ctx: Contexto): string {
  return `<div class="texto-livre${b.negrito ? " negrito" : ""}" style="font-size:${num(b.tamanhoFonte, 5, 160, 12)}px">${textoHTML(b.texto, ctx.vars, b.maiusculas)}</div>`;
}

function blocoImagem(b: BlocoImagem): string {
  if (!b.src || !/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(b.src)) {
    return `<div class="erro-codigo">SEM IMAGEM</div>`;
  }
  return `<img class="imagem${b.pretoEBranco ? " pb" : ""}" style="max-width:${num(b.larguraPct, 5, 100, 60)}%" src="${escaparHTML(b.src)}" alt="">`;
}

function conteudoBloco(bloco: BlocoEtiqueta, ctx: Contexto): string {
  switch (bloco.tipo) {
    case "cabecalho": return blocoCabecalho(bloco, ctx);
    case "modelo": return blocoModelo(bloco, ctx);
    case "cores": return blocoCores(bloco, ctx);
    case "codigo_barras": return blocoCodigoBarras(bloco, ctx);
    case "qrcode": return blocoQRCode(bloco, ctx);
    case "chassi": return blocoChassi(bloco, ctx);
    case "campos": return blocoCampos(bloco, ctx);
    case "texto": return blocoTexto(bloco, ctx);
    case "imagem": return blocoImagem(bloco);
    case "espaco": return "";
  }
}

function blocoHTML(bloco: BlocoEtiqueta, ctx: Contexto): string {
  const classes = ["bloco", `tipo-${bloco.tipo}`, `al-${bloco.alinhamento}`];
  if (bloco.bordaInferior) classes.push("borda");
  if (bloco.fundo !== "nenhum") classes.push(`fundo-${bloco.fundo}`);
  if (bloco.expandir) classes.push("expandir");
  const estilo = `height:${num(bloco.altura, 1, 400, 10)}mm;padding:${num(bloco.padding, 0, 20, 2)}mm`;
  return `<div class="${classes.join(" ")}" style="${estilo}">${conteudoBloco(bloco, ctx)}</div>`;
}

// --- Documento ---

export interface OpcoesRender {
  modo: "impressao" | "preview";
  /** Zoom da pré-visualização (1 = tamanho real na tela). */
  escala?: number;
  titulo?: string;
  /** Data/hora usada em {data}/{hora} (padrão: agora). */
  agora?: Date;
}

/** Altura útil (mm) e soma das alturas dos blocos visíveis. */
export function medirAlturas(modelo: ModeloEtiqueta) {
  const bordaMm = (num(modelo.bordaExterna, 0, 10, 0) * 2) / MM_PARA_PX;
  const disponivel = modelo.altura - 2 * modelo.margem - bordaMm;
  const usada = modelo.blocos.filter((b) => b.visivel).reduce((soma, b) => soma + (Number(b.altura) || 0), 0);
  return { disponivel: Math.round(disponivel * 10) / 10, usada: Math.round(usada * 10) / 10 };
}

function css(modelo: ModeloEtiqueta, opcoes: OpcoesRender): string {
  const largura = num(modelo.largura, 20, 300, 100);
  const altura = num(modelo.altura, 10, 400, 150);
  const borda = num(modelo.bordaExterna, 0, 10, 0);
  const divisoria = num(modelo.espessuraDivisoria, 0, 10, 1);
  const preview = opcoes.modo === "preview";
  const deslocX = preview ? 0 : num(modelo.deslocamentoX, -20, 20, 0);
  const deslocY = preview ? 0 : num(modelo.deslocamentoY, -20, 20, 0);
  const escala = num(opcoes.escala ?? 1, 0.1, 4, 1);

  return `
@page { size: ${largura}mm ${altura}mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: ${fonteSegura(modelo.fonte)}; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.etiqueta { width: ${largura}mm; height: ${altura}mm; padding: ${num(modelo.margem, 0, 20, 0)}mm; border: ${borda > 0 ? `${borda}px solid #000` : "none"}; display: flex; flex-direction: column; overflow: hidden; background: #fff; position: relative; left: ${deslocX}mm; top: ${deslocY}mm; break-after: page; page-break-after: always; }
.etiqueta:last-child { break-after: auto; page-break-after: auto; }
.bloco { width: 100%; flex: 0 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
.bloco.expandir { flex-grow: 1; }
.bloco.borda { border-bottom: ${divisoria}px solid #000; }
.bloco.fundo-preto { background: #000; color: #fff; }
.bloco.fundo-cinza { background: #f0f0f0; }
.bloco.al-left { align-items: flex-start; text-align: left; }
.bloco.al-right { align-items: flex-end; text-align: right; }
.rotulo { display: block; font-weight: bold; text-transform: uppercase; margin-bottom: 2px; line-height: 1.1; }
.cab-titulo { font-weight: 900; line-height: 1.1; }
.cab-sub { text-transform: uppercase; letter-spacing: 1px; line-height: 1.2; }
.valor-modelo { font-weight: 900; line-height: 1; overflow-wrap: anywhere; }
.cores { display: grid; grid-template-columns: 1fr 1px 1fr; width: 100%; height: 100%; align-items: center; }
.cores.sem-divisoria { grid-template-columns: 1fr 1fr; }
.cores.uma { grid-template-columns: 1fr; }
.cores .linha-v { background: currentColor; height: 80%; }
.cor-box { display: flex; flex-direction: column; align-items: center; padding: 0 1mm; min-width: 0; }
.al-left .cor-box { align-items: flex-start; }
.al-right .cor-box { align-items: flex-end; }
.valor-cor { font-weight: bold; line-height: 1.1; overflow-wrap: anywhere; }
.barcode-area { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; }
.barcode { display: block; width: 100%; height: 100%; }
.barcode-texto { font-family: 'Courier New', Courier, monospace; font-weight: bold; letter-spacing: 1px; line-height: 1.1; margin-top: 0.5mm; }
.qr { display: flex; align-items: center; gap: 2mm; max-width: 100%; }
.qr.qr-abaixo { flex-direction: column; gap: 1mm; }
.qr-area { flex: 0 0 auto; }
.qrcode { display: block; width: 100%; height: 100%; }
.qr-legenda { font-weight: bold; line-height: 1.15; text-align: left; overflow-wrap: anywhere; }
.qr-abaixo .qr-legenda { text-align: center; }
.chassi-valor { font-family: 'Courier New', Courier, monospace; font-weight: 900; line-height: 1.1; white-space: nowrap; }
.chassi-valor .destaque { background: #000; color: #fff; padding: 0 1px; }
.fundo-preto .chassi-valor .destaque { background: #fff; color: #000; }
.campos { display: grid; gap: 3px 10px; width: 100%; text-align: left; line-height: 1.15; }
.campos.c1 { grid-template-columns: auto 1fr; }
.campos.c2 { grid-template-columns: auto 1fr auto 1fr; }
.al-center .campos { text-align: left; }
.campo-rotulo { white-space: nowrap; }
.campo-rotulo.negrito, .texto-livre.negrito { font-weight: bold; }
.campo-valor { overflow-wrap: anywhere; }
.texto-livre { width: 100%; line-height: 1.2; overflow-wrap: anywhere; }
.imagem { max-height: 100%; object-fit: contain; }
.imagem.pb { filter: grayscale(1) contrast(1.4); }
.erro-codigo { border: 1px dashed currentColor; padding: 1mm 2mm; font-size: 9px; font-weight: bold; }
${preview ? `
@media screen {
  html, body { background: transparent; }
  body { padding: 12px; zoom: ${escala}; }
  .etiqueta { margin: 0 auto 12px; box-shadow: 0 2px 10px rgba(0,0,0,.25); }
}` : ""}
`;
}

let zxingCache: Promise<ModuloZxing | null> | null = null;
function carregarZxing(): Promise<ModuloZxing | null> {
  if (!zxingCache) zxingCache = import("@zxing/library").catch(() => null);
  return zxingCache;
}

/**
 * Documento HTML completo com uma etiqueta por moto (× cópias do modelo),
 * uma por página, no tamanho definido pelo modelo.
 */
export async function renderizarEtiquetas(modelo: ModeloEtiqueta, lista: DadosEtiqueta[], opcoes: OpcoesRender = { modo: "impressao" }): Promise<string> {
  const usaQR = modelo.blocos.some((b) => b.visivel && b.tipo === "qrcode");
  const zxing = usaQR ? await carregarZxing() : null;

  const bordaMm = (num(modelo.bordaExterna, 0, 10, 0) * 2) / MM_PARA_PX;
  const larguraUtil = num(modelo.largura, 20, 300, 100) - 2 * num(modelo.margem, 0, 20, 0) - bordaMm;
  const copias = opcoes.modo === "preview" ? 1 : Math.round(num(modelo.copias, 1, 10, 1));
  const agora = opcoes.agora ?? new Date();

  const etiquetas: string[] = [];
  for (const dados of lista) {
    const ctx: Contexto = { vars: montarVariaveis(dados, agora), larguraUtil, zxing };
    const corpo = modelo.blocos.filter((b) => b.visivel).map((b) => blocoHTML(b, ctx)).join("");
    for (let i = 0; i < copias; i++) etiquetas.push(`<div class="etiqueta">${corpo}</div>`);
  }

  const titulo = escaparHTML(opcoes.titulo || `Etiquetas (${lista.length})`);
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo}</title><style>${css(modelo, opcoes)}</style></head><body class="${opcoes.modo}">${etiquetas.join("")}</body></html>`;
}
