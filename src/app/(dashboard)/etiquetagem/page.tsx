"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/sgm/PageHeader";
import { EmptyState } from "@/components/sgm/EmptyState";
import { Dica } from "@/components/sgm/Guia";
import { Led } from "@/components/sgm/Led";
import {
  Printer, CheckCircle2, ScanBarcode, Eye, Loader2, Clock, LayoutTemplate, Search, Circle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

/** Chassi com os 4 dígitos finais em destaque (os mesmos conferidos na etiqueta). */
function ChassiDestacado({ sku, className }: { sku: string; className?: string }) {
  return (
    <span className={cn("font-mono tracking-wider", className)}>
      {sku.slice(0, -4)}<strong className="border-b-2 border-primary font-semibold text-foreground">{sku.slice(-4)}</strong>
    </span>
  );
}

export default function EtiquetagemPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
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
      <div className="space-y-6 pb-20">
        <PageHeader
          titulo="Etiquetagem"
          descricao={modeloAtual ? <>Etiqueta em uso: <strong className="font-semibold text-foreground">{modeloAtual.nome}</strong> ({modeloAtual.largura} × {modeloAtual.altura} mm). Motos aprovadas na Qualidade (E3) aguardam aqui.</> : "Carregando modelos de etiqueta..."}
          acoes={
            <div className="flex items-center gap-3 rounded-md border bg-card px-3.5 py-2">
              <span className="text-2xl font-semibold leading-none">{motos.length}</span>
              <span className="rotulo text-sutil">aguardando</span>
            </div>
          }
        />

        <Dica titulo="Da impressão ao estoque em três passos">
          <span className="font-semibold text-foreground">1.</span> Selecione as motos (ou bipe o chassi) e imprima.{" "}
          <span className="font-semibold text-foreground">2.</span> Na conferência, bipe cada etiqueta impressa ou digite os 4 últimos dígitos do chassi.{" "}
          <span className="font-semibold text-foreground">3.</span> Confirme que as etiquetas foram fixadas e envie ao Estoque (E5).
        </Dica>

        <Tabs value={aba} onValueChange={trocarAba} className="w-full">
          {podeEditarLayout && podeImprimir && (
            <TabsList className="h-auto w-full sm:w-fit">
              <TabsTrigger value="fila" className="px-4 py-2"><Printer className="w-4 h-4" /> Fila de impressão</TabsTrigger>
              <TabsTrigger value="layout" className="px-4 py-2"><LayoutTemplate className="w-4 h-4" /> Layout das etiquetas</TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="fila" className="space-y-4 mt-2">
            {/* Barra de ações */}
            <section className="rounded-lg border bg-card">
              <div className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center">
                <form onSubmit={processarBusca} className="relative flex-1">
                  <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    ref={buscaRef}
                    value={busca}
                    onChange={(e) => setBusca(e.target.value.toUpperCase())}
                    placeholder="Bipe o chassi ou busque por chassi / modelo e tecle Enter"
                    className="h-11 bg-background pl-10 font-mono uppercase"
                    autoFocus
                  />
                </form>
                <div className="flex flex-wrap items-center gap-3">
                  {config && (
                    <select
                      value={modeloAtual?.id}
                      onChange={(e) => escolherModelo(e.target.value)}
                      className="h-11 max-w-[260px] rounded-md border border-input bg-background px-3 text-sm"
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
              </div>
              {motosFiltradas.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-painel-cabecalho px-4 py-3">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                    <Checkbox checked={todasSelecionadas} onCheckedChange={alternarTodas} />
                    Selecionar todas ({motosFiltradas.length})
                  </label>
                  <Button onClick={imprimirSelecionadas} disabled={selecionados.size === 0 || imprimindo || !modeloAtual} className="font-semibold">
                    {imprimindo ? <Loader2 className="animate-spin" /> : <Printer />}
                    Imprimir selecionadas ({selecionados.size})
                  </Button>
                </div>
              )}
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {carregando ? (
                    [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-64 w-full rounded-lg" />)
                ) : motosFiltradas.length === 0 ? (
                    <EmptyState
                      className="col-span-full"
                      icone={termo ? Search : Printer}
                      titulo={termo ? "Nenhuma moto da fila corresponde à busca" : "Nenhuma moto aguardando etiqueta"}
                      descricao={termo ? "Confira o chassi ou o modelo digitado." : "Motos aprovadas na Qualidade (E3) aparecem aqui para imprimir a etiqueta."}
                    />
                ) : (
                    motosFiltradas.map(moto => {
                        const espera = minutosDesde(moto.updated_at);
                        const selecionada = selecionados.has(moto.id);
                        return (
                        <article
                          key={moto.id}
                          id={`moto-${moto.id}`}
                          className={cn(
                            "rounded-md border bg-card transition-colors",
                            selecionada ? "border-foreground shadow-[0_0_0_1px_hsl(var(--foreground))]" : "hover:border-foreground/40",
                            destaque === moto.id && "ring-2 ring-success ring-offset-2 ring-offset-background"
                          )}
                        >
                            <div className="flex flex-col space-y-4 p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                      <Checkbox checked={selecionada} onCheckedChange={() => alternarSelecao(moto.id)} aria-label={`Selecionar ${moto.sku}`} />
                                      <ChassiDestacado sku={moto.sku} className="text-xs text-muted-foreground" />
                                    </label>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary shrink-0" onClick={() => setPreviewMoto(moto)} title="Pré-visualizar" aria-label="Pré-visualizar etiqueta">
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                </div>
                                <h3 className="text-lg font-semibold leading-tight text-foreground">{moto.modelo}</h3>

                                <dl className="grid grid-cols-3 gap-2 border-y py-3 text-xs">
                                    <div className="min-w-0"><dt className="rotulo text-sutil">Cor</dt><dd className="mt-1 truncate font-medium">{moto.cor || '—'}</dd></div>
                                    <div className="min-w-0"><dt className="rotulo text-sutil">Banco</dt><dd className="mt-1 truncate font-medium">{moto.cor_banco || '—'}</dd></div>
                                    <div className="min-w-0"><dt className="rotulo text-sutil">Montador</dt><dd className="mt-1 truncate font-medium">{moto.montador?.nome?.split(' ')[0] || '—'}</dd></div>
                                </dl>

                                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Clock className="size-3" /> Aguardando há {formatarDuracaoMin(espera)}
                                  {espera >= 60 && <Led estado="atencao" className="size-2" />}
                                </p>

                                <Button onClick={() => imprimir([moto])} disabled={imprimindo || !modeloAtual} className="h-12 w-full font-semibold">
                                    <Printer className="size-5"/> IMPRIMIR {modeloAtual ? `(${modeloAtual.largura}×${modeloAtual.altura})` : ""}
                                </Button>
                            </div>
                        </article>
                        );
                    })
                )}
            </div>
          </TabsContent>

          {podeEditarLayout && (
            <TabsContent value="layout" className="mt-2">
              {etiquetas.carregando || !config ? (
                <Skeleton className="h-[600px] w-full rounded-lg" />
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
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Eye className="size-5" /> Pré-visualização</DialogTitle>
              <DialogDescription>{modeloAtual?.nome} — exatamente como será impresso.</DialogDescription>
            </DialogHeader>
            {previewMoto && modeloAtual && (
              <div className="fundo-tecnico rounded-md border bg-muted p-2">
                <PreviewEtiqueta modelo={modeloAtual} dados={paraDados(previewMoto)} alturaMaxima={520} />
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setPreviewMoto(null)}>Fechar</Button>
              <Button onClick={() => { const m = previewMoto; setPreviewMoto(null); if (m) imprimir([m]); }}>
                <Printer /> Imprimir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* CONFERÊNCIA DAS ETIQUETAS IMPRESSAS */}
        <Dialog open={lote.length > 0} onOpenChange={(open) => !open && !enviandoEstoque && fecharLote()}>
            <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                         <CheckCircle2 className="size-5 text-success"/> Conferência de etiquetas
                    </DialogTitle>
                    <DialogDescription>
                         Evite enviar motos ao estoque sem a etiqueta física. Bipe o código de barras de cada etiqueta impressa
                         (ou digite os 4 últimos dígitos do chassi).
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <form onSubmit={(e) => { e.preventDefault(); processarLeitura(leitura); }} className="space-y-2">
                        <label className="rotulo flex items-center gap-1.5 text-sutil">
                             <ScanBarcode className="size-3.5"/> Leitura da etiqueta · {confirmados.size} de {lote.length} conferidas
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
                            <div key={moto.id} className={cn("flex items-center gap-3 rounded-md border p-3", ok ? "border-success/60 bg-success/[0.07]" : "bg-card")}>
                              {ok ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Conferida" /> : <Circle className="size-5 shrink-0 text-sutil" aria-label="Pendente" />}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-foreground">{moto.modelo}</p>
                                <ChassiDestacado sku={moto.sku} className="text-xs text-muted-foreground" />
                              </div>
                              {!ok && (
                                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => imprimir([moto], config?.modelos.find((m) => m.id === modeloReimpressao) || modeloAtual)} disabled={imprimindo}>
                                  <Printer className="w-4 h-4 mr-1" /> Reimprimir
                                </Button>
                              )}
                            </div>
                          );
                        })}
                    </div>

                    {config && config.modelos.length > 1 && (
                      <div className="flex flex-col gap-2 rounded-md border bg-background/60 p-3 sm:flex-row sm:items-center">
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
                    <label className={cn("flex cursor-pointer select-none items-start gap-3 rounded-md border p-3", declaracaoLida && "border-foreground")}>
                        <input
                             type="checkbox"
                             checked={declaracaoLida}
                             onChange={(e) => setDeclaracaoLida(e.target.checked)}
                             className="mt-0.5 size-4 accent-[hsl(var(--foreground))]"
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
                         variant="grafite"
                         onClick={enviarConfirmadasAoEstoque}
                         disabled={!declaracaoLida || confirmados.size === 0 || enviandoEstoque}
                         className="h-11 font-semibold"
                    >
                         {enviandoEstoque ? <><Loader2 className="animate-spin" /> Enviando...</> : `Enviar ${confirmados.size} ao Estoque`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

      </div>
  );
}
