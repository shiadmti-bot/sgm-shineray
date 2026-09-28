"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, Copy, Download, Eye, EyeOff, FilePlus2, Image as ImageIcon, Loader2, Plus,
  Printer, RotateCcw, Save, Star, Trash2, Upload, ChevronDown, ChevronRight, Cloud, HardDrive, AlertTriangle, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PreviewEtiqueta } from "./PreviewEtiqueta";
import {
  FONTES_ETIQUETA, ROTULO_TIPO_BLOCO, TAMANHOS_PRESET, VARIAVEIS_ETIQUETA,
  type BlocoEtiqueta, type ConfigEtiquetas, type DadosEtiqueta, type ItemCampo, type ModeloEtiqueta, type TipoBloco,
} from "@/lib/etiquetas/tipos";
import {
  configEtiquetasPadrao, criarBloco, modeloCaixa100x150, modeloEmBranco, modeloSubBanco70x50, normalizarConfigEtiquetas,
  normalizarModelo, novoId,
} from "@/lib/etiquetas/padroes";
import { DADOS_EXEMPLO, medirAlturas, renderizarEtiquetas } from "@/lib/etiquetas/render";
import { imprimirHTML } from "@/lib/etiquetas/imprimir";
import { salvarConfigEtiquetas } from "@/lib/etiquetas/armazenamento";
import type { OrigemConfig } from "@/lib/config-sistema";
import { getUsuarioLogado } from "@/lib/auth";
import { registrarLog } from "@/lib/logger";

const TAMANHO_MAX_IMAGEM = 300 * 1024;
const IDS_FABRICA = ["caixa-100x150", "subbanco-70x50"];

const clonar = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// --- Campos de formulário compactos ---

function Campo({ rotulo, dica, children, className }: { rotulo: string; dica?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1 min-w-0", className)}>
      <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{rotulo}</span>
      {children}
      {dica && <span className="block text-[10px] leading-snug text-slate-400">{dica}</span>}
    </label>
  );
}

function NumeroInput({ valor, onChange, min, max, step = 1, sufixo }: { valor: number; onChange: (v: number) => void; min: number; max: number; step?: number; sufixo?: string }) {
  // Texto próprio enquanto o campo está em foco: permite apagar e redigitar sem "pular".
  const [texto, setTexto] = useState(String(valor));
  const [focado, setFocado] = useState(false);
  return (
    <div className="relative">
      <Input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={focado ? texto : String(valor)}
        onFocus={() => { setTexto(String(valor)); setFocado(true); }}
        onBlur={() => setFocado(false)}
        onChange={(e) => {
          setTexto(e.target.value);
          const n = parseFloat(e.target.value.replace(",", "."));
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className={cn("h-9 bg-white dark:bg-slate-950", sufixo && "pr-10")}
      />
      {sufixo && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{sufixo}</span>}
    </div>
  );
}

function Selecao<T extends string | number>({ valor, onChange, opcoes }: { valor: T; onChange: (v: T) => void; opcoes: { valor: T; rotulo: string }[] }) {
  return (
    <select
      value={String(valor)}
      onChange={(e) => {
        const escolhida = opcoes.find((o) => String(o.valor) === e.target.value);
        if (escolhida) onChange(escolhida.valor);
      }}
      className="h-9 w-full rounded-md border border-input bg-white dark:bg-slate-950 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {opcoes.map((o) => (
        <option key={String(o.valor)} value={String(o.valor)}>{o.rotulo}</option>
      ))}
    </select>
  );
}

function Alternar({ rotulo, marcado, onChange }: { rotulo: string; marcado: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none py-1">
      <Checkbox checked={marcado} onCheckedChange={(v) => onChange(v === true)} />
      <span className="text-slate-700 dark:text-slate-300">{rotulo}</span>
    </label>
  );
}

// --- Campos específicos de cada tipo de bloco ---

function CamposEspecificos({ bloco, alterar }: { bloco: BlocoEtiqueta; alterar: (p: Partial<BlocoEtiqueta>) => void }) {
  const set = alterar as (p: Record<string, unknown>) => void;
  switch (bloco.tipo) {
    case "cabecalho":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Título" className="col-span-2"><Input value={bloco.titulo} onChange={(e) => set({ titulo: e.target.value })} className="h-9" /></Campo>
          <Campo rotulo="Subtítulo" className="col-span-2"><Input value={bloco.subtitulo} onChange={(e) => set({ subtitulo: e.target.value })} className="h-9" /></Campo>
          <Campo rotulo="Fonte do título"><NumeroInput valor={bloco.tamanhoTitulo} onChange={(v) => set({ tamanhoTitulo: v })} min={6} max={120} sufixo="px" /></Campo>
          <Campo rotulo="Fonte do subtítulo"><NumeroInput valor={bloco.tamanhoSubtitulo} onChange={(v) => set({ tamanhoSubtitulo: v })} min={4} max={60} sufixo="px" /></Campo>
          <Campo rotulo="Espaço entre letras"><NumeroInput valor={bloco.espacamentoLetras} onChange={(v) => set({ espacamentoLetras: v })} min={0} max={30} sufixo="px" /></Campo>
        </div>
      );
    case "modelo":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Rótulo (vazio = oculto)" className="col-span-2"><Input value={bloco.rotulo} onChange={(e) => set({ rotulo: e.target.value })} className="h-9" /></Campo>
          <Campo rotulo="Fonte do rótulo"><NumeroInput valor={bloco.tamanhoRotulo} onChange={(v) => set({ tamanhoRotulo: v })} min={4} max={60} sufixo="px" /></Campo>
          <Campo rotulo="Fonte do modelo"><NumeroInput valor={bloco.tamanhoFonte} onChange={(v) => set({ tamanhoFonte: v })} min={6} max={160} sufixo="px" /></Campo>
          <Alternar rotulo="Letras maiúsculas" marcado={bloco.maiusculas} onChange={(v) => set({ maiusculas: v })} />
          <Alternar rotulo="Reduzir fonte em nomes longos" marcado={bloco.ajustarTexto} onChange={(v) => set({ ajustarTexto: v })} />
        </div>
      );
    case "cores":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Rótulo da carenagem"><Input value={bloco.rotuloCarenagem} onChange={(e) => set({ rotuloCarenagem: e.target.value })} className="h-9" /></Campo>
          <Campo rotulo="Rótulo do banco"><Input value={bloco.rotuloBanco} onChange={(e) => set({ rotuloBanco: e.target.value })} className="h-9" /></Campo>
          <Campo rotulo="Fonte dos rótulos"><NumeroInput valor={bloco.tamanhoRotulo} onChange={(v) => set({ tamanhoRotulo: v })} min={4} max={60} sufixo="px" /></Campo>
          <Campo rotulo="Fonte das cores"><NumeroInput valor={bloco.tamanhoFonte} onChange={(v) => set({ tamanhoFonte: v })} min={6} max={80} sufixo="px" /></Campo>
          <Alternar rotulo="Mostrar cor do banco" marcado={bloco.mostrarBanco} onChange={(v) => set({ mostrarBanco: v })} />
          <Alternar rotulo="Linha divisória" marcado={bloco.divisoria} onChange={(v) => set({ divisoria: v })} />
        </div>
      );
    case "codigo_barras":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Conteúdo" dica="Normalmente {chassi}. Aceita variáveis." className="col-span-2"><Input value={bloco.conteudo} onChange={(e) => set({ conteudo: e.target.value })} className="h-9 font-mono" /></Campo>
          <Campo rotulo="Formato">
            <Selecao valor={bloco.formato} onChange={(v) => set({ formato: v })} opcoes={[{ valor: "CODE128", rotulo: "Code 128 (recomendado)" }, { valor: "CODE39", rotulo: "Code 39" }]} />
          </Campo>
          <Campo rotulo="Largura ocupada"><NumeroInput valor={bloco.larguraPct} onChange={(v) => set({ larguraPct: v })} min={20} max={100} sufixo="%" /></Campo>
          <Campo rotulo="Espessura da barra" dica="Afeta a proporção quando não esticado."><NumeroInput valor={bloco.larguraBarra} onChange={(v) => set({ larguraBarra: v })} min={1} max={6} /></Campo>
          <Campo rotulo="Altura das barras" dica="Relativa à espessura."><NumeroInput valor={bloco.alturaBarras} onChange={(v) => set({ alturaBarras: v })} min={10} max={400} /></Campo>
          <Alternar rotulo="Esticar para preencher o bloco" marcado={bloco.esticar} onChange={(v) => set({ esticar: v })} />
          <Alternar rotulo="Mostrar texto abaixo" marcado={bloco.mostrarTexto} onChange={(v) => set({ mostrarTexto: v })} />
          {bloco.mostrarTexto && (
            <Campo rotulo="Fonte do texto"><NumeroInput valor={bloco.tamanhoTexto} onChange={(v) => set({ tamanhoTexto: v })} min={5} max={60} sufixo="px" /></Campo>
          )}
        </div>
      );
    case "qrcode":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Conteúdo do QR" dica="Ex.: {chassi} ou um link com variáveis." className="col-span-2"><Input value={bloco.conteudo} onChange={(e) => set({ conteudo: e.target.value })} className="h-9 font-mono" /></Campo>
          <Campo rotulo="Tamanho do QR"><NumeroInput valor={bloco.tamanho} onChange={(v) => set({ tamanho: v })} min={5} max={200} sufixo="mm" /></Campo>
          <Campo rotulo="Legenda">
            <Selecao valor={bloco.posicaoLegenda} onChange={(v) => set({ posicaoLegenda: v })} opcoes={[{ valor: "direita", rotulo: "À direita" }, { valor: "abaixo", rotulo: "Abaixo" }, { valor: "nenhuma", rotulo: "Sem legenda" }]} />
          </Campo>
          {bloco.posicaoLegenda !== "nenhuma" && (
            <>
              <Campo rotulo="Texto da legenda" className="col-span-2"><Textarea value={bloco.legenda} onChange={(e) => set({ legenda: e.target.value })} rows={2} /></Campo>
              <Campo rotulo="Fonte da legenda"><NumeroInput valor={bloco.tamanhoLegenda} onChange={(v) => set({ tamanhoLegenda: v })} min={5} max={60} sufixo="px" /></Campo>
            </>
          )}
        </div>
      );
    case "chassi":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Rótulo (vazio = oculto)" className="col-span-2"><Input value={bloco.rotulo} onChange={(e) => set({ rotulo: e.target.value })} className="h-9" /></Campo>
          <Campo rotulo="Fonte do rótulo"><NumeroInput valor={bloco.tamanhoRotulo} onChange={(v) => set({ tamanhoRotulo: v })} min={4} max={60} sufixo="px" /></Campo>
          <Campo rotulo="Fonte do chassi" dica="Reduz sozinha se não couber."><NumeroInput valor={bloco.tamanhoFonte} onChange={(v) => set({ tamanhoFonte: v })} min={6} max={80} sufixo="px" /></Campo>
          <Campo rotulo="Espaço entre letras"><NumeroInput valor={bloco.espacamentoLetras} onChange={(v) => set({ espacamentoLetras: v })} min={0} max={20} sufixo="px" /></Campo>
          <Campo rotulo="Destacar dígitos finais" dica="0 = sem destaque"><NumeroInput valor={bloco.destacarFinais} onChange={(v) => set({ destacarFinais: Math.round(v) })} min={0} max={17} /></Campo>
        </div>
      );
    case "campos":
      return <EditorCampos bloco={bloco} set={set} />;
    case "texto":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Texto" dica="Aceita várias linhas e variáveis." className="col-span-2"><Textarea value={bloco.texto} onChange={(e) => set({ texto: e.target.value })} rows={3} /></Campo>
          <Campo rotulo="Fonte"><NumeroInput valor={bloco.tamanhoFonte} onChange={(v) => set({ tamanhoFonte: v })} min={5} max={160} sufixo="px" /></Campo>
          <div className="space-y-1">
            <Alternar rotulo="Negrito" marcado={bloco.negrito} onChange={(v) => set({ negrito: v })} />
            <Alternar rotulo="Maiúsculas" marcado={bloco.maiusculas} onChange={(v) => set({ maiusculas: v })} />
          </div>
        </div>
      );
    case "imagem":
      return <EditorImagem bloco={bloco} set={set} />;
    case "espaco":
      return <p className="text-xs text-slate-500">Bloco vazio para separar conteúdos. Ajuste apenas a altura.</p>;
  }
}

function EditorCampos({ bloco, set }: { bloco: Extract<BlocoEtiqueta, { tipo: "campos" }>; set: (p: Record<string, unknown>) => void }) {
  const itens = bloco.itens;
  const alterarItem = (id: string, parcial: Partial<ItemCampo>) => set({ itens: itens.map((i) => (i.id === id ? { ...i, ...parcial } : i)) });
  const mover = (idx: number, dir: -1 | 1) => {
    const alvo = idx + dir;
    if (alvo < 0 || alvo >= itens.length) return;
    const novos = [...itens];
    [novos[idx], novos[alvo]] = [novos[alvo], novos[idx]];
    set({ itens: novos });
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Fonte"><NumeroInput valor={bloco.tamanhoFonte} onChange={(v) => set({ tamanhoFonte: v })} min={5} max={60} sufixo="px" /></Campo>
        <Campo rotulo="Colunas">
          <Selecao valor={bloco.colunas} onChange={(v) => set({ colunas: v })} opcoes={[{ valor: 1, rotulo: "1 coluna" }, { valor: 2, rotulo: "2 colunas" }]} />
        </Campo>
        <Campo rotulo="Recuo lateral"><NumeroInput valor={bloco.recuo} onChange={(v) => set({ recuo: v })} min={0} max={30} sufixo="mm" /></Campo>
        <div className="space-y-1">
          <Alternar rotulo="Rótulos em negrito" marcado={bloco.rotuloNegrito} onChange={(v) => set({ rotuloNegrito: v })} />
          <Alternar rotulo="Maiúsculas" marcado={bloco.maiusculas} onChange={(v) => set({ maiusculas: v })} />
        </div>
      </div>
      <div className="space-y-2">
        {itens.map((item, idx) => (
          <div key={item.id} className="flex items-center gap-2">
            <Input value={item.rotulo} onChange={(e) => alterarItem(item.id, { rotulo: e.target.value })} placeholder="Rótulo" className="h-9 w-32 shrink-0" />
            <Input value={item.valor} onChange={(e) => alterarItem(item.id, { valor: e.target.value })} placeholder="Valor ou {variavel}" className="h-9 font-mono text-xs" />
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => mover(idx, -1)} disabled={idx === 0} aria-label="Subir campo"><ArrowUp className="w-3.5 h-3.5" /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => mover(idx, 1)} disabled={idx === itens.length - 1} aria-label="Descer campo"><ArrowDown className="w-3.5 h-3.5" /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-red-500" onClick={() => set({ itens: itens.filter((i) => i.id !== item.id) })} aria-label="Remover campo"><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => set({ itens: [...itens, { id: novoId("c"), rotulo: "CAMPO:", valor: "" }] })}>
          <Plus className="w-4 h-4 mr-1" /> Adicionar campo
        </Button>
      </div>
    </div>
  );
}

function EditorImagem({ bloco, set }: { bloco: Extract<BlocoEtiqueta, { tipo: "imagem" }>; set: (p: Record<string, unknown>) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const carregar = (arquivo?: File) => {
    if (!arquivo) return;
    if (arquivo.size > TAMANHO_MAX_IMAGEM) {
      toast.error("Imagem muito grande. Use um arquivo de até 300 KB (PNG/JPG/SVG).");
      return;
    }
    const leitor = new FileReader();
    leitor.onload = () => set({ src: String(leitor.result || "") });
    leitor.onerror = () => toast.error("Não foi possível ler a imagem.");
    leitor.readAsDataURL(arquivo);
  };
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2 flex items-center gap-3">
        <div className="w-24 h-16 rounded-md border border-dashed border-slate-300 dark:border-slate-700 bg-white flex items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {bloco.src ? <img src={bloco.src} alt="" className="max-w-full max-h-full object-contain" /> : <ImageIcon className="w-6 h-6 text-slate-300" />}
        </div>
        <div className="flex flex-col gap-2">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" className="hidden" onChange={(e) => { carregar(e.target.files?.[0]); e.target.value = ""; }} />
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}><Upload className="w-4 h-4 mr-1" /> Escolher imagem</Button>
          {bloco.src && <Button type="button" variant="ghost" size="sm" className="text-red-500" onClick={() => set({ src: "" })}>Remover</Button>}
        </div>
      </div>
      <Campo rotulo="Largura máxima"><NumeroInput valor={bloco.larguraPct} onChange={(v) => set({ larguraPct: v })} min={5} max={100} sufixo="%" /></Campo>
      <Alternar rotulo="Converter para preto e branco" marcado={bloco.pretoEBranco} onChange={(v) => set({ pretoEBranco: v })} />
    </div>
  );
}

function resumoBloco(bloco: BlocoEtiqueta): string {
  switch (bloco.tipo) {
    case "cabecalho": return bloco.titulo || "(sem título)";
    case "modelo": return `${bloco.tamanhoFonte}px${bloco.ajustarTexto ? " · ajuste automático" : ""}`;
    case "cores": return bloco.mostrarBanco ? "Carenagem + banco" : "Só carenagem";
    case "codigo_barras": return `${bloco.formato} · ${bloco.conteudo}`;
    case "qrcode": return `${bloco.tamanho}mm · ${bloco.conteudo}`;
    case "chassi": return bloco.destacarFinais > 0 ? `destaque nos ${bloco.destacarFinais} finais` : `${bloco.tamanhoFonte}px`;
    case "campos": return `${bloco.itens.length} campo(s)`;
    case "texto": return bloco.texto.replace(/\s+/g, " ").slice(0, 30) || "(vazio)";
    case "imagem": return bloco.src ? "imagem carregada" : "sem imagem";
    case "espaco": return "";
  }
}

// --- Editor ---

interface EditorEtiquetasProps {
  config: ConfigEtiquetas;
  origem: OrigemConfig;
  tabelaAusente: boolean;
  /** Motos reais (fila) para pré-visualizar com dados verdadeiros. */
  amostras: DadosEtiqueta[];
  onSalvo: (config: ConfigEtiquetas, origem: OrigemConfig, tabelaAusente: boolean) => void;
}

export function EditorEtiquetas({ config, origem, tabelaAusente, amostras, onSalvo }: EditorEtiquetasProps) {
  const [rascunho, setRascunho] = useState<ConfigEtiquetas>(() => clonar(config));
  const [modeloId, setModeloId] = useState(config.padraoId);
  const [blocoAberto, setBlocoAberto] = useState<string | null>(null);
  const [amostraIdx, setAmostraIdx] = useState(-1);
  const [salvando, setSalvando] = useState(false);
  const [dialogo, setDialogo] = useState<null | "excluir" | "restaurar">(null);
  const inputImportar = useRef<HTMLInputElement>(null);

  const modelo = rascunho.modelos.find((m) => m.id === modeloId) ?? rascunho.modelos[0];
  const alterado = JSON.stringify(rascunho) !== JSON.stringify(config);
  const dadosPreview = amostraIdx >= 0 && amostras[amostraIdx] ? amostras[amostraIdx] : DADOS_EXEMPLO;
  const { usada, disponivel } = medirAlturas(modelo);
  const temExpansivel = modelo.blocos.some((b) => b.visivel && b.expandir);

  // Avisa antes de sair com alterações não salvas
  useEffect(() => {
    if (!alterado) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [alterado]);

  // --- Mutadores ---
  const alterarModelo = (parcial: Partial<ModeloEtiqueta>) =>
    setRascunho((r) => ({ ...r, modelos: r.modelos.map((m) => (m.id === modelo.id ? { ...m, ...parcial } : m)) }));

  const alterarBlocos = (fn: (blocos: BlocoEtiqueta[]) => BlocoEtiqueta[]) =>
    setRascunho((r) => ({ ...r, modelos: r.modelos.map((m) => (m.id === modelo.id ? { ...m, blocos: fn(m.blocos) } : m)) }));

  const alterarBloco = (id: string, parcial: Partial<BlocoEtiqueta>) =>
    alterarBlocos((blocos) => blocos.map((b) => (b.id === id ? ({ ...b, ...parcial } as BlocoEtiqueta) : b)));

  const moverBloco = (idx: number, dir: -1 | 1) =>
    alterarBlocos((blocos) => {
      const alvo = idx + dir;
      if (alvo < 0 || alvo >= blocos.length) return blocos;
      const novos = [...blocos];
      [novos[idx], novos[alvo]] = [novos[alvo], novos[idx]];
      return novos;
    });

  const adicionarBloco = (tipo: TipoBloco) => {
    const bloco = criarBloco(tipo);
    alterarBlocos((blocos) => [...blocos, bloco]);
    setBlocoAberto(bloco.id);
  };

  const adicionarModelo = (base: ModeloEtiqueta, nome: string) => {
    const nomes = new Set(rascunho.modelos.map((m) => m.nome));
    let nomeFinal = nome;
    for (let n = 2; nomes.has(nomeFinal); n++) nomeFinal = `${nome} (${n})`;
    const novo: ModeloEtiqueta = { ...clonar(base), id: novoId("m"), nome: nomeFinal };
    novo.blocos = novo.blocos.map((b) => ({ ...b, id: novoId() }));
    setRascunho((r) => ({ ...r, modelos: [...r.modelos, novo] }));
    setModeloId(novo.id);
    setBlocoAberto(null);
  };

  const novoModelo = (tipo: string) => {
    if (tipo === "branco") adicionarModelo(modeloEmBranco(), "Novo modelo");
    else if (tipo === "copia") adicionarModelo(modelo, `Cópia de ${modelo.nome}`);
    else if (tipo === "caixa") adicionarModelo(modeloCaixa100x150(), "Etiqueta de Caixa (cópia)");
    else if (tipo === "subbanco") adicionarModelo(modeloSubBanco70x50(), "Etiqueta Sub-banco (cópia)");
  };

  const excluirModelo = () => {
    if (rascunho.modelos.length <= 1) {
      toast.error("É preciso manter pelo menos um modelo.");
      return;
    }
    const restantes = rascunho.modelos.filter((m) => m.id !== modelo.id);
    setRascunho((r) => ({
      ...r,
      modelos: restantes,
      padraoId: r.padraoId === modelo.id ? restantes[0].id : r.padraoId,
    }));
    setModeloId(restantes[0].id);
    setDialogo(null);
  };

  const restaurarFabrica = () => {
    const fabrica = configEtiquetasPadrao().modelos;
    setRascunho((r) => {
      const personalizados = r.modelos.filter((m) => !IDS_FABRICA.includes(m.id));
      return { ...r, modelos: [...fabrica, ...personalizados], padraoId: r.modelos.some((m) => m.id === r.padraoId) ? r.padraoId : fabrica[0].id };
    });
    setModeloId(fabrica[0].id);
    setBlocoAberto(null);
    setDialogo(null);
    toast.info("Modelos de fábrica restaurados. Clique em Salvar para aplicar.");
  };

  const exportar = () => {
    const conteudo = JSON.stringify({ formato: "sgm-etiqueta", versao: 1, modelo }, null, 2);
    const url = URL.createObjectURL(new Blob([conteudo], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `etiqueta-${modelo.nome.replace(/[^\w-]+/g, "_")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importar = async (arquivo?: File) => {
    if (!arquivo) return;
    try {
      const dados = JSON.parse(await arquivo.text());
      const candidatos: unknown[] = Array.isArray(dados?.modelos) ? dados.modelos : [dados?.modelo ?? dados];
      const validos = candidatos.map(normalizarModelo).filter((m): m is ModeloEtiqueta => !!m && m.blocos.length > 0);
      if (validos.length === 0) throw new Error("Arquivo sem modelo de etiqueta válido.");
      validos.forEach((m) => adicionarModelo(m, m.nome));
      toast.success(`${validos.length} modelo(s) importado(s). Revise e salve.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Arquivo inválido.");
    }
  };

  const imprimirTeste = async () => {
    try {
      const html = await renderizarEtiquetas({ ...modelo, copias: 1 }, [dadosPreview], { modo: "impressao", titulo: `Teste - ${modelo.nome}` });
      await imprimirHTML(html);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao imprimir.");
    }
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const agora = new Date().toISOString();
      const anteriores = new Map(config.modelos.map((m) => [m.id, JSON.stringify(m)]));
      const final = normalizarConfigEtiquetas({
        ...rascunho,
        modelos: rascunho.modelos.map((m) => (anteriores.get(m.id) === JSON.stringify(m) ? m : { ...m, atualizadoEm: agora })),
      });
      const usuario = getUsuarioLogado();
      const resultado = await salvarConfigEtiquetas(final, usuario?.nome);
      await registrarLog("CONFIGURACAO", "Etiquetas", {
        modelos: final.modelos.map((m) => `${m.nome} (${m.largura}x${m.altura})`),
        padrao: final.modelos.find((m) => m.id === final.padraoId)?.nome,
        armazenamento: resultado.origem,
      });
      if (resultado.origem === "servidor") {
        toast.success("Layout salvo e compartilhado com todas as estações.");
      } else {
        toast.warning(
          resultado.tabelaAusente
            ? "Salvo apenas neste dispositivo: a tabela de configurações não existe no banco (ver README)."
            : "Servidor indisponível: salvo apenas neste dispositivo."
        );
      }
      setRascunho(clonar(final));
      onSalvo(final, resultado.origem, resultado.tabelaAusente);
    } finally {
      setSalvando(false);
    }
  };

  const copiarVariavel = async (chave: string) => {
    try {
      await navigator.clipboard.writeText(`{${chave}}`);
      toast.success(`{${chave}} copiado`);
    } catch {
      toast.info(`Digite {${chave}} no campo desejado.`);
    }
  };

  const ehPadrao = rascunho.padraoId === modelo.id;
  const excesso = usada - disponivel;

  return (
    <div className="space-y-4">
      {/* Barra de modelos */}
      <Card className="py-0 gap-0 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <CardContent className="p-4 flex flex-col lg:flex-row gap-3 lg:items-end">
          <Campo rotulo="Modelo em edição" className="lg:w-80">
            <Selecao
              valor={modelo.id}
              onChange={(v) => { setModeloId(v); setBlocoAberto(null); }}
              opcoes={rascunho.modelos.map((m) => ({ valor: m.id, rotulo: `${m.nome} — ${m.largura}×${m.altura} mm${m.id === rascunho.padraoId ? " ★ padrão" : ""}` }))}
            />
          </Campo>
          <div className="flex flex-wrap gap-2">
            <select
              value=""
              onChange={(e) => { if (e.target.value) novoModelo(e.target.value); }}
              className="h-9 rounded-md border border-input bg-white dark:bg-slate-950 px-2 text-sm"
              aria-label="Criar modelo"
            >
              <option value="">+ Novo modelo…</option>
              <option value="copia">Duplicar o atual</option>
              <option value="branco">Em branco (100×50)</option>
              <option value="caixa">Baseado na Caixa 100×150</option>
              <option value="subbanco">Baseado no Sub-banco 70×50</option>
            </select>
            <Button type="button" variant="outline" size="sm" className="h-9" disabled={ehPadrao} onClick={() => setRascunho((r) => ({ ...r, padraoId: modelo.id }))}>
              <Star className={cn("w-4 h-4 mr-1", ehPadrao && "fill-amber-400 text-amber-500")} /> {ehPadrao ? "Modelo padrão" : "Definir como padrão"}
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={exportar}><Download className="w-4 h-4 mr-1" /> Exportar</Button>
            <input ref={inputImportar} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { importar(e.target.files?.[0]); e.target.value = ""; }} />
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => inputImportar.current?.click()}><Upload className="w-4 h-4 mr-1" /> Importar</Button>
            <Button type="button" variant="ghost" size="sm" className="h-9 text-slate-500" onClick={() => setDialogo("restaurar")}><RotateCcw className="w-4 h-4 mr-1" /> Restaurar fábrica</Button>
            <Button type="button" variant="ghost" size="sm" className="h-9 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setDialogo("excluir")} disabled={rascunho.modelos.length <= 1}>
              <Trash2 className="w-4 h-4 mr-1" /> Excluir
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(320px,440px)] gap-4 items-start">
        {/* --- Coluna de configurações --- */}
        <div className="space-y-4 min-w-0">
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Página</CardTitle>
              <CardDescription>Tamanho do papel, bordas, fonte e calibração da impressora.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Campo rotulo="Nome do modelo" className="col-span-2">
                <Input value={modelo.nome} onChange={(e) => alterarModelo({ nome: e.target.value })} className="h-9" maxLength={80} />
              </Campo>
              <Campo rotulo="Tamanho pronto" className="col-span-2">
                <select
                  value={TAMANHOS_PRESET.find((t) => t.largura === modelo.largura && t.altura === modelo.altura)?.rotulo ?? ""}
                  onChange={(e) => {
                    const t = TAMANHOS_PRESET.find((p) => p.rotulo === e.target.value);
                    if (t) alterarModelo({ largura: t.largura, altura: t.altura });
                  }}
                  className="h-9 w-full rounded-md border border-input bg-white dark:bg-slate-950 px-2 text-sm"
                >
                  <option value="">Personalizado</option>
                  {TAMANHOS_PRESET.map((t) => <option key={t.rotulo} value={t.rotulo}>{t.rotulo}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Largura"><NumeroInput valor={modelo.largura} onChange={(v) => alterarModelo({ largura: v })} min={20} max={300} sufixo="mm" /></Campo>
              <Campo rotulo="Altura"><NumeroInput valor={modelo.altura} onChange={(v) => alterarModelo({ altura: v })} min={10} max={400} sufixo="mm" /></Campo>
              <Campo rotulo="Margem interna"><NumeroInput valor={modelo.margem} onChange={(v) => alterarModelo({ margem: v })} min={0} max={20} step={0.5} sufixo="mm" /></Campo>
              <Campo rotulo="Borda externa" dica="0 = sem borda"><NumeroInput valor={modelo.bordaExterna} onChange={(v) => alterarModelo({ bordaExterna: v })} min={0} max={10} sufixo="px" /></Campo>
              <Campo rotulo="Linhas divisórias"><NumeroInput valor={modelo.espessuraDivisoria} onChange={(v) => alterarModelo({ espessuraDivisoria: v })} min={0} max={10} sufixo="px" /></Campo>
              <Campo rotulo="Cópias por moto"><NumeroInput valor={modelo.copias} onChange={(v) => alterarModelo({ copias: Math.round(v) })} min={1} max={10} /></Campo>
              <Campo rotulo="Fonte" className="col-span-2">
                <Selecao valor={modelo.fonte} onChange={(v) => alterarModelo({ fonte: v })} opcoes={FONTES_ETIQUETA.some((f) => f.valor === modelo.fonte) ? FONTES_ETIQUETA : [...FONTES_ETIQUETA, { valor: modelo.fonte, rotulo: modelo.fonte }]} />
              </Campo>
              <Campo rotulo="Ajuste horizontal" dica="+ direita / − esquerda"><NumeroInput valor={modelo.deslocamentoX} onChange={(v) => alterarModelo({ deslocamentoX: v })} min={-20} max={20} step={0.5} sufixo="mm" /></Campo>
              <Campo rotulo="Ajuste vertical" dica="+ desce / − sobe"><NumeroInput valor={modelo.deslocamentoY} onChange={(v) => alterarModelo({ deslocamentoY: v })} min={-20} max={20} step={0.5} sufixo="mm" /></Campo>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Blocos da etiqueta</CardTitle>
                  <CardDescription>De cima para baixo. Use as setas para reordenar e o olho para ocultar.</CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono",
                    excesso > 2 ? "border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400" : "border-green-300 text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400"
                  )}
                >
                  {usada} / {disponivel} mm
                </Badge>
              </div>
              {excesso > 2 && (
                <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mt-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> A soma das alturas passa {Math.round(excesso * 10) / 10} mm do espaço útil: os blocos serão comprimidos.
                </p>
              )}
              {excesso < -2 && !temExpansivel && (
                <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-2">
                  <Info className="w-3.5 h-3.5 shrink-0" /> Sobram {Math.round(-excesso * 10) / 10} mm no fim. Marque “Ocupar espaço restante” em um bloco para aproveitá-los.
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {modelo.blocos.map((bloco, idx) => {
                const aberto = blocoAberto === bloco.id;
                return (
                  <div key={bloco.id} className={cn("rounded-xl border transition-colors", aberto ? "border-blue-300 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/10" : "border-slate-200 dark:border-slate-800", !bloco.visivel && "opacity-60")}>
                    <div className="flex items-center gap-1 p-2">
                      <div className="flex flex-col">
                        <button type="button" className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" onClick={() => moverBloco(idx, -1)} disabled={idx === 0} aria-label="Subir bloco"><ArrowUp className="w-3.5 h-3.5" /></button>
                        <button type="button" className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" onClick={() => moverBloco(idx, 1)} disabled={idx === modelo.blocos.length - 1} aria-label="Descer bloco"><ArrowDown className="w-3.5 h-3.5" /></button>
                      </div>
                      <button type="button" className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => alterarBloco(bloco.id, { visivel: !bloco.visivel })} aria-label={bloco.visivel ? "Ocultar bloco" : "Mostrar bloco"} title={bloco.visivel ? "Ocultar" : "Mostrar"}>
                        {bloco.visivel ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button type="button" className="flex-1 min-w-0 flex items-center gap-2 text-left px-1" onClick={() => setBlocoAberto(aberto ? null : bloco.id)}>
                        {aberto ? <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" /> : <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />}
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-100 shrink-0">{ROTULO_TIPO_BLOCO[bloco.tipo]}</span>
                        <span className="text-xs text-slate-400 truncate">{resumoBloco(bloco)}</span>
                      </button>
                      <div className="w-24 shrink-0">
                        <NumeroInput valor={bloco.altura} onChange={(v) => alterarBloco(bloco.id, { altura: v })} min={1} max={400} sufixo="mm" />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Duplicar" aria-label="Duplicar bloco" onClick={() => alterarBlocos((blocos) => { const copia = { ...clonar(bloco), id: novoId() }; const novos = [...blocos]; novos.splice(idx + 1, 0, copia); return novos; })}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-500" title="Remover" aria-label="Remover bloco" onClick={() => alterarBlocos((blocos) => blocos.filter((b) => b.id !== bloco.id))}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    {aberto && (
                      <div className="border-t border-slate-200 dark:border-slate-800 p-3 space-y-4">
                        <CamposEspecificos bloco={bloco} alterar={(p) => alterarBloco(bloco.id, p)} />
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800">
                          <Campo rotulo="Alinhamento">
                            <Selecao valor={bloco.alinhamento} onChange={(v) => alterarBloco(bloco.id, { alinhamento: v })} opcoes={[{ valor: "left", rotulo: "Esquerda" }, { valor: "center", rotulo: "Centro" }, { valor: "right", rotulo: "Direita" }]} />
                          </Campo>
                          <Campo rotulo="Fundo">
                            <Selecao valor={bloco.fundo} onChange={(v) => alterarBloco(bloco.id, { fundo: v })} opcoes={[{ valor: "nenhum", rotulo: "Branco" }, { valor: "preto", rotulo: "Preto (texto branco)" }, { valor: "cinza", rotulo: "Cinza claro" }]} />
                          </Campo>
                          <Campo rotulo="Espaço interno"><NumeroInput valor={bloco.padding} onChange={(v) => alterarBloco(bloco.id, { padding: v })} min={0} max={20} step={0.5} sufixo="mm" /></Campo>
                          <div className="space-y-1">
                            <Alternar rotulo="Linha abaixo" marcado={bloco.bordaInferior} onChange={(v) => alterarBloco(bloco.id, { bordaInferior: v })} />
                            <Alternar rotulo="Ocupar espaço restante" marcado={bloco.expandir} onChange={(v) => alterarBloco(bloco.id, { expandir: v })} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <select
                value=""
                onChange={(e) => { if (e.target.value) adicionarBloco(e.target.value as TipoBloco); }}
                className="h-10 w-full rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-transparent px-3 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-blue-400 cursor-pointer"
                aria-label="Adicionar bloco"
              >
                <option value="">+ Adicionar bloco…</option>
                {(Object.keys(ROTULO_TIPO_BLOCO) as TipoBloco[]).map((t) => <option key={t} value={t}>{ROTULO_TIPO_BLOCO[t]}</option>)}
              </select>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Variáveis disponíveis</CardTitle>
              <CardDescription>Use em títulos, textos, campos e no conteúdo dos códigos. Clique para copiar.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {VARIAVEIS_ETIQUETA.map((v) => (
                <button key={v.chave} type="button" onClick={() => copiarVariavel(v.chave)} className="text-left rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors">
                  <span className="block font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{`{${v.chave}}`}</span>
                  <span className="block text-[10px] text-slate-500">{v.descricao}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* --- Coluna de pré-visualização --- */}
        <div className="xl:sticky xl:top-24 space-y-3">
          <Card className="pb-0 gap-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 overflow-hidden">
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Pré-visualização</CardTitle>
                <Badge variant="secondary" className="font-mono">{modelo.largura} × {modelo.altura} mm</Badge>
              </div>
              <select
                value={amostraIdx}
                onChange={(e) => setAmostraIdx(Number(e.target.value))}
                className="mt-2 h-9 w-full rounded-md border border-input bg-white dark:bg-slate-950 px-2 text-sm"
                aria-label="Dados usados na pré-visualização"
              >
                <option value={-1}>Dados de exemplo</option>
                {amostras.map((a, i) => <option key={`${a.sku}-${i}`} value={i}>{a.sku} — {a.modelo}</option>)}
              </select>
            </CardHeader>
            <CardContent className="bg-slate-100 dark:bg-slate-950 p-2">
              <PreviewEtiqueta modelo={modelo} dados={dadosPreview} alturaMaxima={620} />
            </CardContent>
          </Card>
          <Button type="button" variant="outline" className="w-full" onClick={imprimirTeste}>
            <Printer className="w-4 h-4 mr-2" /> Imprimir teste
          </Button>
          <p className="text-[11px] text-slate-500 leading-relaxed px-1">
            No driver da impressora, use papel de <strong>{modelo.largura} × {modelo.altura} mm</strong>, orientação retrato e margens zero.
            Se a impressão sair deslocada, corrija com o ajuste horizontal/vertical.
          </p>
        </div>
      </div>

      {/* Barra de salvar */}
      <div className="sticky bottom-4 z-30">
        <Card className={cn("py-0 gap-0 border-2 shadow-xl transition-colors", alterado ? "border-blue-400 bg-white dark:bg-slate-900" : "border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90")}>
          <CardContent className="p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              {origem === "servidor" ? <Cloud className="w-4 h-4 text-green-600" /> : <HardDrive className="w-4 h-4 text-amber-600" />}
              <span>
                {origem === "servidor" && "Layout compartilhado entre todas as estações."}
                {origem === "local" && (tabelaAusente ? "Layout salvo só neste dispositivo — execute a migração do banco (README) para compartilhar." : "Usando cópia local (servidor indisponível).")}
                {origem === "padrao" && (tabelaAusente ? "Usando o padrão de fábrica. Para compartilhar layouts entre estações, execute a migração do banco (README)." : "Usando o layout padrão de fábrica.")}
              </span>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button type="button" variant="ghost" disabled={!alterado || salvando} onClick={() => setRascunho(clonar(config))} className="flex-1 sm:flex-none">
                Descartar
              </Button>
              <Button type="button" disabled={!alterado || salvando} onClick={salvar} className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white font-bold">
                {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {alterado ? "Salvar alterações" : "Tudo salvo"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogo !== null} onOpenChange={(aberto) => !aberto && setDialogo(null)}>
        <DialogContent className="bg-white dark:bg-slate-950">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialogo === "excluir" ? <><Trash2 className="w-5 h-5 text-red-600" /> Excluir modelo</> : <><FilePlus2 className="w-5 h-5 text-blue-600" /> Restaurar modelos de fábrica</>}
            </DialogTitle>
            <DialogDescription>
              {dialogo === "excluir"
                ? `O modelo "${modelo.nome}" será removido quando você salvar.`
                : "Os modelos Caixa 100×150 e Sub-banco 70×50 voltam à configuração original. Modelos criados por você são mantidos."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogo(null)}>Cancelar</Button>
            {dialogo === "excluir"
              ? <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={excluirModelo}>Excluir</Button>
              : <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={restaurarFabrica}>Restaurar</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
