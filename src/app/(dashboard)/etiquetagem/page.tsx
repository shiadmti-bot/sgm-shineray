"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/sgm/PageHeader";
import {
  Printer, Tag, CheckCircle2, AlertTriangle, ScanBarcode, Eye, Loader2, Clock, LayoutTemplate, Search, Circle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { registrarLog } from "@/lib/logger";
import { usePode } from "@/lib/auth";
import { rotuloStatus } from "@/lib/constantes";
import { formatarDuracaoMin, minutosDesde } from "@/lib/datas";
import { tocarSom } from "@/lib/sons";
import { cn } from "@/lib/utils";
import { useConfigEtiquetas, modeloPadrao } from "@/lib/etiquetas/armazenamento";
import { renderizarEtiquetas } from "@/lib/etiquetas/render";
import { imprimirHTML } from "@/lib/etiquetas/imprimir";
import type { DadosEtiqueta, ModeloEtiqueta } from "@/lib/etiquetas/tipos";
import { PreviewEtiqueta } from "@/components/etiquetas/PreviewEtiqueta";
import { EditorEtiquetas } from "@/components/etiquetas/EditorEtiquetas";

interface MotoFila {
  id: string;
  sku: string;
  modelo: string;
  cor?: string | null;
  cor_banco?: string | null;
  ano?: string | number | null;
  localizacao?: string | null;
  updated_at?: string | null;
  montador?: { nome: string } | null;
  supervisor?: { nome: string } | null;
}

const CHAVE_MODELO_LOCAL = "sgm_etiqueta_modelo";
const CHAVE_AUTO_IMPRIMIR = "sgm_etiqueta_auto";

function paraDados(m: MotoFila): DadosEtiqueta {
  return {
    sku: m.sku,
    modelo: m.modelo,
    cor: m.cor,
    cor_banco: m.cor_banco,
    ano: m.ano,
    montador: m.montador?.nome,
    supervisor: m.supervisor?.nome,
    localizacao: m.localizacao,
  };
}

function lerPreferencia(chave: string, padrao: string): string {
  try {
    return localStorage.getItem(chave) ?? padrao;
  } catch {
    return padrao;
  }
}

function ChassiDestacado({ sku, className }: { sku: string; className?: string }) {
  return (
    <span className={cn("font-mono tracking-wider", className)}>
      {sku.slice(0, -4)}<strong className="text-info bg-info/10 rounded px-0.5">{sku.slice(-4)}</strong>
    </span>
  );
}

export default function EtiquetagemPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <EtiquetagemConteudo />
    </Suspense>
  );
}

function EtiquetagemConteudo() {
  const router = useRouter();
  const params = useSearchParams();
  const podeEditarLayout = usePode("etiquetas.layout");
  const podeImprimir = usePode("etiquetas.imprimir");
  // Quem só edita o layout (sem imprimir) abre direto no editor
  const aba = podeEditarLayout && (params.get("aba") === "layout" || !podeImprimir) ? "layout" : "fila";

  const etiquetas = useConfigEtiquetas();

  const [motos, setMotos] = useState<MotoFila[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modeloEscolhido, setModeloEscolhido] = useState<string>(() => (typeof window === "undefined" ? "" : lerPreferencia(CHAVE_MODELO_LOCAL, "")));
  const [autoImprimir, setAutoImprimir] = useState<boolean>(() => (typeof window === "undefined" ? true : lerPreferencia(CHAVE_AUTO_IMPRIMIR, "1") === "1"));
  const [imprimindo, setImprimindo] = useState(false);
  const [previewMoto, setPreviewMoto] = useState<MotoFila | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [, setRelogio] = useState(0);

  // Lote em confirmação (etiquetas impressas aguardando conferência)
  const [lote, setLote] = useState<MotoFila[]>([]);
  const [confirmados, setConfirmados] = useState<Set<string>>(new Set());
  const [leitura, setLeitura] = useState("");
  const [declaracaoLida, setDeclaracaoLida] = useState(false);
  const [enviandoEstoque, setEnviandoEstoque] = useState(false);
  const [modeloReimpressao, setModeloReimpressao] = useState("");
  const buscaRef = useRef<HTMLInputElement>(null);
  const leituraRef = useRef<HTMLInputElement>(null);

  const config = etiquetas.config;
  const amostras = useMemo(() => motos.slice(0, 20).map(paraDados), [motos]);
  const modeloAtual: ModeloEtiqueta | null = useMemo(() => {
    if (!config) return null;
    return config.modelos.find((m) => m.id === modeloEscolhido) || modeloPadrao(config);
  }, [config, modeloEscolhido]);

  const fetchMotos = useCallback(async () => {
    const { data, error } = await supabase
      .from('motos')
      .select(`*, montador:funcionarios!motos_montador_id_fkey(nome), supervisor:funcionarios!motos_supervisor_id_fkey(nome)`)
      .eq('status', 'aguardando_etiqueta')
      .order('updated_at', { ascending: true });
    if (error) {
      console.error(error);
    } else if (data) {
      const lista = data as MotoFila[];
      setMotos(lista);
      // Remove da seleção o que saiu da fila
      setSelecionados((prev) => new Set([...prev].filter((id) => lista.some((m) => m.id === id))));
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    fetchMotos();
    const interval = setInterval(fetchMotos, 10000);
    const relogio = setInterval(() => setRelogio((r) => r + 1), 60000);
    return () => { clearInterval(interval); clearInterval(relogio); };
  }, [fetchMotos]);

  const trocarAba = (valor: string) => {
    router.replace(valor === "layout" ? "/etiquetagem?aba=layout" : "/etiquetagem", { scroll: false });
  };

  const escolherModelo = (id: string) => {
    setModeloEscolhido(id);
    try { localStorage.setItem(CHAVE_MODELO_LOCAL, id); } catch { /* ignore */ }
  };

  const alternarAuto = (valor: boolean) => {
    setAutoImprimir(valor);
    try { localStorage.setItem(CHAVE_AUTO_IMPRIMIR, valor ? "1" : "0"); } catch { /* ignore */ }
  };

  const termo = busca.trim().toUpperCase();
  const motosFiltradas = termo
    ? motos.filter((m) => m.sku.toUpperCase().includes(termo) || m.modelo?.toUpperCase().includes(termo))
    : motos;
  const todasSelecionadas = motosFiltradas.length > 0 && motosFiltradas.every((m) => selecionados.has(m.id));

  const alternarSelecao = (id: string) => {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  };

  const alternarTodas = () => {
    setSelecionados((prev) => {
      if (todasSelecionadas) {
        const novo = new Set(prev);
        motosFiltradas.forEach((m) => novo.delete(m.id));
        return novo;
      }
      return new Set([...prev, ...motosFiltradas.map((m) => m.id)]);
    });
  };

  // --- Impressão ---
  const imprimir = async (lista: MotoFila[], modelo: ModeloEtiqueta | null = modeloAtual) => {
    if (!modelo || lista.length === 0) return;
    setImprimindo(true);
    try {
      const html = await renderizarEtiquetas(modelo, lista.map(paraDados), {
        modo: "impressao",
        titulo: lista.length === 1 ? `ETIQUETA ${lista[0].sku}` : `ETIQUETAS (${lista.length})`,
      });
      await imprimirHTML(html);
      // Abre/atualiza a conferência com as motos impressas
      setLote((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        return [...prev, ...lista.filter((m) => !ids.has(m.id))];
      });
      setModeloReimpressao(modelo.id);
      setTimeout(() => leituraRef.current?.focus(), 300);
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível abrir a impressão.");
    } finally {
      setImprimindo(false);
    }
  };

  const imprimirSelecionadas = () => {
    const lista = motos.filter((m) => selecionados.has(m.id));
    if (lista.length === 0) return toast.warning("Selecione ao menos uma moto.");
    imprimir(lista);
  };

  // Bipar chassi: localiza a moto na fila (e imprime, se configurado)
  const processarBusca = async (e: React.FormEvent) => {
    e.preventDefault();
    const codigo = termo;
    if (!codigo) return;
    const exata = motos.find((m) => m.sku.toUpperCase() === codigo);
    // Final do chassi (4+ caracteres) também localiza, ex.: "0462"
    const candidatas = exata ? [exata] : codigo.length >= 4 ? motos.filter((m) => m.sku.toUpperCase().endsWith(codigo)) : [];

    if (candidatas.length === 1) {
      const moto = candidatas[0];
      tocarSom("sucesso");
      setDestaque(moto.id);
      setTimeout(() => setDestaque(null), 4000);
      document.getElementById(`moto-${moto.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setBusca("");
      if (autoImprimir) await imprimir([moto]);
      else setSelecionados((prev) => new Set(prev).add(moto.id));
      return;
    }

    if (candidatas.length > 1) {
      toast.info(`${candidatas.length} motos correspondem a "${codigo}". Refine a busca.`);
      return;
    }

    // Busca por modelo: a lista abaixo já está filtrada.
    if (motosFiltradas.length > 0) return;

    // Não está na fila: informa onde a moto está
    tocarSom("erro");
    if (codigo.length === 17) {
      const { data } = await supabase.from('motos').select('status, modelo').eq('sku', codigo).maybeSingle();
      if (data) toast.error(`Esta moto não está aguardando etiqueta.`, { description: `${data.modelo} — ${rotuloStatus(data.status)}` });
      else toast.error("Chassi não encontrado no sistema.");
    } else {
      toast.error("Nenhuma moto da fila corresponde a esta busca.");
    }
  };

  // --- Conferência do lote ---
  const pendentesLote = lote.filter((m) => !confirmados.has(m.id));

  const processarLeitura = (valorBruto: string) => {
    const valor = valorBruto.trim().toUpperCase();
    if (!valor) return;
    let alvo: MotoFila[] = [];
    if (valor.length >= 17) alvo = pendentesLote.filter((m) => m.sku.toUpperCase() === valor);
    else if (valor.length === 4) alvo = pendentesLote.filter((m) => m.sku.toUpperCase().endsWith(valor));

    if (alvo.length === 1) {
      setConfirmados((prev) => new Set(prev).add(alvo[0].id));
      tocarSom("sucesso");
      setLeitura("");
      return;
    }
    tocarSom("erro");
    if (alvo.length > 1) toast.warning(`Mais de uma moto termina com ${valor}. Bipe o código de barras completo.`);
    else if (lote.some((m) => m.sku.toUpperCase() === valor || (valor.length === 4 && m.sku.toUpperCase().endsWith(valor)))) toast.info("Essa etiqueta já foi conferida.");
    else toast.error("Não confere com nenhuma etiqueta impressa neste lote.");
    setLeitura("");
  };

  const fecharLote = () => {
    setLote([]);
    setConfirmados(new Set());
    setLeitura("");
    setDeclaracaoLida(false);
    setTimeout(() => buscaRef.current?.focus(), 200);
  };

  const enviarConfirmadasAoEstoque = async () => {
    const paraEnviar = lote.filter((m) => confirmados.has(m.id));
    if (paraEnviar.length === 0 || !declaracaoLida) return;
    setEnviandoEstoque(true);
    const nomeModelo = config?.modelos.find((m) => m.id === modeloReimpressao)?.nome || modeloAtual?.nome;
    const enviados: string[] = [];
    const falhas: string[] = [];

    for (const moto of paraEnviar) {
      const { data, error } = await supabase.from('motos').update({
          status: 'estoque',
          localizacao: 'Pátio de Estoque',
          updated_at: new Date().toISOString()
      })
      .eq('id', moto.id)
      .eq('status', 'aguardando_etiqueta') // evita mover moto que outra estação já tratou
      .select('id');

      if (error || !data || data.length === 0) {
        falhas.push(moto.sku);
      } else {
        enviados.push(moto.id);
        await registrarLog('IMPRESSAO_ETIQUETA', moto.sku, { modelo_etiqueta: nomeModelo, conferencia: 'bipagem/digitos' });
      }
    }

    if (enviados.length > 0) toast.success(`${enviados.length} moto(s) enviada(s) ao estoque!`);
    if (falhas.length > 0) toast.error(`Não foi possível enviar: ${falhas.join(", ")}`, { description: "Elas podem ter sido movidas por outra estação." });

    const restantes = lote.filter((m) => !enviados.includes(m.id) && !falhas.includes(m.sku));
    setLote(restantes);
    setConfirmados(new Set());
    setDeclaracaoLida(false);
    setEnviandoEstoque(false);
    fetchMotos();
    if (restantes.length === 0) fecharLote();
  };

  const origemLayout = etiquetas.origem;

  return (
      <div className="space-y-6 animate-in fade-in pb-20">
        <PageHeader
          icone={Tag}
          titulo="Etiquetagem"
          descricao={modeloAtual ? <>Modelo em uso: <strong className="text-foreground">{modeloAtual.nome}</strong> ({modeloAtual.largura} × {modeloAtual.altura} mm)</> : "Carregando modelos de etiqueta..."}
          acoes={<Badge variant="outline" className="h-8 px-3 text-sm">{motos.length} aguardando etiqueta</Badge>}
        />

        <Tabs value={aba} onValueChange={trocarAba} className="w-full">
          {podeEditarLayout && podeImprimir && (
            <TabsList className="bg-muted h-auto p-1 w-full sm:w-fit">
              <TabsTrigger value="fila" className="px-4 py-2"><Printer className="w-4 h-4" /> Fila de impressão</TabsTrigger>
              <TabsTrigger value="layout" className="px-4 py-2"><LayoutTemplate className="w-4 h-4" /> Layout das etiquetas</TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="fila" className="space-y-4 mt-2">
            {/* Barra de ações */}
            <Card className="py-0 gap-0 bg-card border-border shadow-sm">
              <CardContent className="p-4 flex flex-col xl:flex-row gap-3 xl:items-center">
                <form onSubmit={processarBusca} className="relative flex-1">
                  <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    ref={buscaRef}
                    value={busca}
                    onChange={(e) => setBusca(e.target.value.toUpperCase())}
                    placeholder="Bipe o chassi ou busque por chassi / modelo e tecle Enter"
                    className="pl-10 h-11 font-mono uppercase"
                    autoFocus
                  />
                </form>
                <div className="flex flex-wrap items-center gap-3">
                  {config && (
                    <select
                      value={modeloAtual?.id}
                      onChange={(e) => escolherModelo(e.target.value)}
                      className="h-11 rounded-md border border-input bg-card px-3 text-sm max-w-[260px]"
                      aria-label="Modelo de etiqueta para impressão"
                    >
                      {config.modelos.map((m) => (
                        <option key={m.id} value={m.id}>{m.nome} ({m.largura}×{m.altura}){m.id === config.padraoId ? " ★" : ""}</option>
                      ))}
                    </select>
                  )}
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none" title="Ao bipar um chassi da fila, imprime a etiqueta na hora">
                    <Checkbox checked={autoImprimir} onCheckedChange={(v) => alternarAuto(v === true)} />
                    Imprimir ao bipar
                  </label>
                  <Button variant="outline" size="icon" className="h-11 w-11" onClick={fetchMotos} title="Atualizar fila" aria-label="Atualizar fila">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
              {motosFiltradas.length > 0 && (
                <div className="px-4 pb-4 flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                    <Checkbox checked={todasSelecionadas} onCheckedChange={alternarTodas} />
                    Selecionar todas ({motosFiltradas.length})
                  </label>
                  <Button onClick={imprimirSelecionadas} disabled={selecionados.size === 0 || imprimindo || !modeloAtual} className="bg-primary hover:bg-primary/90 text-white font-bold">
                    {imprimindo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                    Imprimir selecionadas ({selecionados.size})
                  </Button>
                </div>
              )}
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {carregando ? (
                    [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)
                ) : motosFiltradas.length === 0 ? (
                    <div className="col-span-full text-center py-20 text-muted-foreground border-2 border-dashed rounded-xl">
                        {termo ? <Search className="w-12 h-12 mx-auto mb-2 opacity-20"/> : <Printer className="w-12 h-12 mx-auto mb-2 opacity-20"/>}
                        <p>{termo ? "Nenhuma moto da fila corresponde à busca." : "Nenhuma moto aguardando etiqueta."}</p>
                    </div>
                ) : (
                    motosFiltradas.map(moto => {
                        const espera = minutosDesde(moto.updated_at);
                        const selecionada = selecionados.has(moto.id);
                        return (
                        <Card
                          key={moto.id}
                          id={`moto-${moto.id}`}
                          className={cn(
                            "bg-card shadow-lg hover:shadow-xl transition-all border-2",
                            selecionada ? "border-blue-500" : "border-blue-100 dark:border-blue-950",
                            destaque === moto.id && "ring-4 ring-green-400 border-green-500"
                          )}
                        >
                            <CardContent className="p-5 flex flex-col space-y-4">
                                <div className="flex items-start justify-between gap-2">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                      <Checkbox checked={selecionada} onCheckedChange={() => alternarSelecao(moto.id)} aria-label={`Selecionar ${moto.sku}`} />
                                      <ChassiDestacado sku={moto.sku} className="text-xs text-muted-foreground" />
                                    </label>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary shrink-0" onClick={() => setPreviewMoto(moto)} title="Pré-visualizar" aria-label="Pré-visualizar etiqueta">
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                </div>
                                <h3 className="text-xl font-black text-foreground leading-tight">{moto.modelo}</h3>

                                <div className="w-full bg-muted/50 p-3 rounded-lg text-xs space-y-1 border border-border">
                                    <div className="flex justify-between gap-2"><span>Cor:</span> <strong className="text-right">{moto.cor || '—'}</strong></div>
                                    <div className="flex justify-between gap-2"><span>Banco:</span> <strong className="text-right">{moto.cor_banco || '—'}</strong></div>
                                    <div className="flex justify-between gap-2"><span>Montador:</span> <strong className="text-right">{moto.montador?.nome?.split(' ')[0] || '—'}</strong></div>
                                </div>

                                <p className={cn("text-xs flex items-center gap-1", espera >= 60 ? "text-amber-600 font-bold" : "text-muted-foreground")}>
                                  <Clock className="w-3 h-3" /> Aguardando há {formatarDuracaoMin(espera)}
                                </p>

                                <Button onClick={() => imprimir([moto])} disabled={imprimindo || !modeloAtual} className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-bold shadow-lg shadow-primary/20">
                                    <Printer className="mr-2 w-5 h-5"/> IMPRIMIR {modeloAtual ? `(${modeloAtual.largura}×${modeloAtual.altura})` : ""}
                                </Button>
                            </CardContent>
                        </Card>
                        );
                    })
                )}
            </div>
          </TabsContent>

          {podeEditarLayout && (
            <TabsContent value="layout" className="mt-2">
              {etiquetas.carregando || !config ? (
                <Skeleton className="h-[600px] w-full rounded-2xl" />
              ) : (
                <EditorEtiquetas
                  config={config}
                  origem={origemLayout}
                  tabelaAusente={etiquetas.tabelaAusente}
                  amostras={amostras}
                  onSalvo={etiquetas.definir}
                />
              )}
            </TabsContent>
          )}
        </Tabs>

        {/* PRÉ-VISUALIZAÇÃO */}
        <Dialog open={!!previewMoto} onOpenChange={(open) => !open && setPreviewMoto(null)}>
          <DialogContent className="bg-card border-border sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Eye className="w-5 h-5 text-primary" /> Pré-visualização</DialogTitle>
              <DialogDescription>{modeloAtual?.nome} — exatamente como será impresso.</DialogDescription>
            </DialogHeader>
            {previewMoto && modeloAtual && (
              <div className="bg-muted rounded-xl p-2">
                <PreviewEtiqueta modelo={modeloAtual} dados={paraDados(previewMoto)} alturaMaxima={520} />
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setPreviewMoto(null)}>Fechar</Button>
              <Button className="bg-primary hover:bg-primary/90 text-white" onClick={() => { const m = previewMoto; setPreviewMoto(null); if (m) imprimir([m]); }}>
                <Printer className="w-4 h-4 mr-2" /> Imprimir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* CONFERÊNCIA DAS ETIQUETAS IMPRESSAS */}
        <Dialog open={lote.length > 0} onOpenChange={(open) => !open && !enviandoEstoque && fecharLote()}>
            <DialogContent className="bg-card border-border sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle className="text-primary flex items-center gap-2 text-xl font-black">
                         <CheckCircle2 className="w-6 h-6"/> Conferência de Etiquetas
                    </DialogTitle>
                    <DialogDescription>
                         Evite enviar motos ao estoque sem a etiqueta física. Bipe o código de barras de cada etiqueta impressa
                         (ou digite os 4 últimos dígitos do chassi).
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <form onSubmit={(e) => { e.preventDefault(); processarLeitura(leitura); }} className="space-y-2">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                             <AlertTriangle className="w-3.5 h-3.5 text-amber-500"/> Leitura da etiqueta ({confirmados.size}/{lote.length} conferidas)
                        </label>
                        <Input
                             ref={leituraRef}
                             placeholder="Bipe ou digite os 4 finais"
                             value={leitura}
                             onChange={e => {
                               const v = e.target.value.toUpperCase();
                               setLeitura(v);
                               // 4 dígitos digitados à mão: confere sem precisar de Enter
                               if (/^\d{4}$/.test(v) && pendentesLote.filter((m) => m.sku.toUpperCase().endsWith(v)).length === 1) processarLeitura(v);
                             }}
                             className="font-mono text-center text-lg tracking-widest h-12 uppercase"
                             autoFocus
                        />
                    </form>

                    <div className="max-h-[35vh] overflow-y-auto space-y-2 pr-1">
                        {lote.map((moto) => {
                          const ok = confirmados.has(moto.id);
                          return (
                            <div key={moto.id} className={cn("flex items-center gap-3 p-3 rounded-xl border", ok ? "border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-900" : "border-border")}>
                              {ok ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" /> : <Circle className="w-5 h-5 text-slate-300 shrink-0" />}
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-sm text-foreground truncate">{moto.modelo}</p>
                                <ChassiDestacado sku={moto.sku} className="text-xs text-muted-foreground" />
                              </div>
                              {!ok && (
                                <Button variant="ghost" size="sm" className="shrink-0 text-primary" onClick={() => imprimir([moto], config?.modelos.find((m) => m.id === modeloReimpressao) || modeloAtual)} disabled={imprimindo}>
                                  <Printer className="w-4 h-4 mr-1" /> Reimprimir
                                </Button>
                              )}
                            </div>
                          );
                        })}
                    </div>

                    {config && config.modelos.length > 1 && (
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center p-3 rounded-xl bg-muted/50 border border-border">
                        <span className="text-xs text-muted-foreground shrink-0">Imprimir outra etiqueta:</span>
                        <select value={modeloReimpressao} onChange={(e) => setModeloReimpressao(e.target.value)} className="h-9 flex-1 min-w-0 rounded-md border border-input bg-card px-2 text-sm">
                          {config.modelos.map((m) => <option key={m.id} value={m.id}>{m.nome} ({m.largura}×{m.altura})</option>)}
                        </select>
                        <Button size="sm" variant="outline" className="shrink-0" disabled={imprimindo} onClick={() => imprimir(lote, config.modelos.find((m) => m.id === modeloReimpressao) || modeloAtual)}>
                          <Printer className="w-4 h-4 mr-1" /> Todas
                        </Button>
                      </div>
                    )}

                    {/* Declaração Visual */}
                    <label className="flex items-start gap-3 p-3 rounded-lg border border-info/30 bg-info/10 cursor-pointer select-none">
                        <input
                             type="checkbox"
                             checked={declaracaoLida}
                             onChange={(e) => setDeclaracaoLida(e.target.checked)}
                             className="mt-1 w-4 h-4 rounded text-primary focus:ring-ring border-slate-300"
                        />
                        <span className="text-sm font-medium text-foreground/90">
                             Confirmo que as etiquetas conferidas foram impressas e fixadas nas caixas das motos.
                        </span>
                    </label>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={fecharLote} disabled={enviandoEstoque}>
                      {confirmados.size > 0 ? "Fechar sem enviar" : "Cancelar"}
                    </Button>
                    <Button
                         onClick={enviarConfirmadasAoEstoque}
                         disabled={!declaracaoLida || confirmados.size === 0 || enviandoEstoque}
                         className={`h-11 font-bold ${
                              declaracaoLida && confirmados.size > 0
                                   ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20'
                                   : 'bg-slate-100 text-muted-foreground dark:bg-slate-800 dark:text-slate-600'
                         }`}
                    >
                         {enviandoEstoque ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</> : `Enviar ${confirmados.size} ao Estoque`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

      </div>
  );
}
