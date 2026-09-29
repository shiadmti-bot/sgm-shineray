"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle, Boxes, Camera, CheckCircle2, ClipboardList, Download, FileSearch, History, Loader2, PackageSearch, Play,
  ScanBarcode, Undo2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/sgm/PageHeader";
import { StatCard } from "@/components/sgm/StatCard";
import { EmptyState } from "@/components/sgm/EmptyState";
import { ConfirmDialog } from "@/components/sgm/ConfirmDialog";
import { StatusBadge } from "@/components/sgm/StatusBadge";
import { LeitorCamera } from "@/components/sgm/LeitorCamera";
import { Carregando } from "@/components/sgm/Carregando";
import { Selo } from "@/components/sgm/Selo";
import { Led, type EstadoLed } from "@/components/sgm/Led";
import { supabase } from "@/lib/supabase";
import { usePode } from "@/lib/auth";
import { registrarLog } from "@/lib/logger";
import { tocarSom } from "@/lib/sons";
import { baixarPlanilha } from "@/lib/excel";
import { rotuloStatus, TIPOS_AVARIA } from "@/lib/constantes";
import { cn } from "@/lib/utils";

const ESCOPOS = [
  { valor: "estoque", rotulo: "Estoque", status: ["estoque"] },
  { valor: "aguardando_etiqueta", rotulo: "Aguardando etiqueta", status: ["aguardando_etiqueta"] },
  { valor: "em_analise", rotulo: "Inspeção (QA)", status: ["em_analise"] },
  { valor: "avarias", rotulo: "Pátio de avarias", status: TIPOS_AVARIA.map((t) => t.valor as string) },
  { valor: "aguardando_montagem", rotulo: "Caixas aguardando montagem", status: ["aguardando_montagem"] },
] as const;

interface Inventario {
  id: string;
  descricao: string | null;
  status: "aberto" | "finalizado" | "cancelado";
  escopo: string[];
  iniciado_em: string;
  finalizado_em: string | null;
  total_esperado: number | null;
  total_lido: number | null;
  total_faltas: number | null;
  total_sobras: number | null;
  resultado: { faltas: ItemFalta[]; sobras: ItemSobra[] } | null;
  observacoes: string | null;
  iniciador?: { nome: string } | null;
  finalizador?: { nome: string } | null;
}
interface ItemFalta { sku: string; modelo: string | null; status: string | null; localizacao: string | null }
interface ItemSobra { sku: string; modelo: string | null; situacao: string; status_sistema: string | null }
interface Leitura {
  id: string;
  sku: string;
  modelo: string | null;
  situacao: "confere" | "fora_do_escopo" | "nao_cadastrada";
  status_sistema: string | null;
  lido_em: string;
  leitor?: { nome: string } | null;
}
interface MotoEscopo { id: string; sku: string; modelo: string | null; status: string | null; localizacao: string | null }

const COLUNAS_INVENTARIO =
  "*, iniciador:funcionarios!inventarios_iniciado_por_fkey(nome), finalizador:funcionarios!inventarios_finalizado_por_fkey(nome)";

const SITUACAO: Record<string, { rotulo: string; estado: EstadoLed; borda: string }> = {
  confere: { rotulo: "Confere", estado: "bom", borda: "border-l-success" },
  fora_do_escopo: { rotulo: "Fora do escopo", estado: "atencao", borda: "border-l-warning" },
  nao_cadastrada: { rotulo: "Não cadastrada", estado: "critico", borda: "border-l-destructive" },
  duplicada: { rotulo: "Já lida", estado: "neutro", borda: "border-l-sutil" },
};

const dataHora = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const rotuloEscopo = (escopo: string[]) =>
  ESCOPOS.filter((e) => e.status.some((s) => escopo.includes(s))).map((e) => e.rotulo).join(", ") || escopo.join(", ");

export default function InventarioPage() {
  const podeExecutar = usePode("inventario.executar");
  const [carregado, setCarregado] = useState(false);
  const [aberto, setAberto] = useState<Inventario | null>(null);
  const [historico, setHistorico] = useState<Inventario[]>([]);
  const [detalhe, setDetalhe] = useState<Inventario | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("inventarios").select(COLUNAS_INVENTARIO).order("iniciado_em", { ascending: false }).limit(30);
    const lista = (data as unknown as Inventario[]) || [];
    setAberto(lista.find((i) => i.status === "aberto") ?? null);
    setHistorico(lista.filter((i) => i.status !== "aberto"));
    setCarregado(true);
  }, []);

  useEffect(() => {
    let ativo = true;
    supabase.from("inventarios").select(COLUNAS_INVENTARIO).order("iniciado_em", { ascending: false }).limit(30).then(({ data }) => {
      if (!ativo) return;
      const lista = (data as unknown as Inventario[]) || [];
      setAberto(lista.find((i) => i.status === "aberto") ?? null);
      setHistorico(lista.filter((i) => i.status !== "aberto"));
      setCarregado(true);
    });
    return () => {
      ativo = false;
    };
  }, []);

  if (!carregado) return <Carregando />;

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        icone={Boxes}
        titulo="Inventário do pátio"
        descricao="Conte as motos bipando o chassi. O sistema compara com o cadastro e aponta faltas e sobras."
      />

      {aberto ? (
        <ContagemAberta inventario={aberto} podeExecutar={podeExecutar} aoConcluir={(inv) => { setDetalhe(inv); carregar(); }} aoCancelar={carregar} />
      ) : podeExecutar ? (
        <NovoInventario aoIniciar={carregar} />
      ) : (
        <EmptyState icone={Boxes} titulo="Nenhum inventário em andamento" descricao="Quem tem a permissão “Fazer inventário” pode iniciar uma contagem." />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><History className="size-4" /> Inventários anteriores</CardTitle>
        </CardHeader>
        <CardContent className="px-2">
          {historico.length === 0 ? (
            <p className="px-4 pb-2 text-sm text-muted-foreground">Nenhum inventário concluído ainda.</p>
          ) : (
            historico.map((inv) => (
              <button
                key={inv.id}
                type="button"
                onClick={() => setDetalhe(inv)}
                className="flex w-full flex-col gap-2 rounded-lg px-4 py-3 text-left hover:bg-accent sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{inv.descricao || "Inventário"}</p>
                  <p className="text-xs text-muted-foreground">
                    {dataHora(inv.iniciado_em)} · {rotuloEscopo(inv.escopo)} · {inv.iniciador?.nome ?? "—"}
                  </p>
                </div>
                {inv.status === "cancelado" ? (
                  <Selo estado="desligado">Cancelado</Selo>
                ) : (
                  <div className="flex gap-2 text-xs">
                    <Selo>{inv.total_lido ?? 0}/{inv.total_esperado ?? 0} lidas</Selo>
                    <Selo estado={(inv.total_faltas ?? 0) > 0 ? "critico" : "bom"}>{inv.total_faltas ?? 0} falta(s)</Selo>
                    <Selo estado={(inv.total_sobras ?? 0) > 0 ? "atencao" : "bom"}>{inv.total_sobras ?? 0} sobra(s)</Selo>
                  </div>
                )}
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <ResultadoInventario inventario={detalhe} aoFechar={() => setDetalhe(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function NovoInventario({ aoIniciar }: { aoIniciar: () => void }) {
  const [descricao, setDescricao] = useState(() => `Inventário ${new Date().toLocaleDateString("pt-BR")}`);
  const [escopos, setEscopos] = useState<string[]>(["estoque"]);
  const [iniciando, setIniciando] = useState(false);

  const iniciar = async () => {
    const status = ESCOPOS.filter((e) => escopos.includes(e.valor)).flatMap((e) => [...e.status]);
    if (status.length === 0) return toast.warning("Escolha pelo menos uma área para contar.");
    setIniciando(true);
    const { error } = await supabase.from("inventarios").insert({ descricao: descricao.trim() || null, escopo: status, status: "aberto" });
    setIniciando(false);
    if (error) {
      toast.error(error.code === "23505" ? "Já existe um inventário em andamento." : `Não foi possível iniciar: ${error.message}`);
      aoIniciar();
      return;
    }
    await registrarLog("INVENTARIO_INICIADO", "Sistema", { descricao, escopo: status });
    toast.success("Inventário iniciado. Pode começar a bipar!");
    aoIniciar();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Play className="size-5 text-primary" /> Nova contagem</CardTitle>
        <CardDescription>Várias pessoas podem bipar ao mesmo tempo, cada uma no seu tablet ou celular.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="descricao">Descrição</Label>
          <Input id="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={80} />
        </div>
        <div className="space-y-2">
          <Label>O que será contado</Label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ESCOPOS.map((e) => {
              const marcado = escopos.includes(e.valor);
              return (
                <label key={e.valor} className={cn("alvo-toque flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm", marcado && "border-primary bg-primary/5")}>
                  <input
                    type="checkbox"
                    className="size-4 accent-[hsl(var(--primary))]"
                    checked={marcado}
                    onChange={() => setEscopos((l) => (marcado ? l.filter((x) => x !== e.valor) : [...l, e.valor]))}
                  />
                  {e.rotulo}
                </label>
              );
            })}
          </div>
        </div>
        <Button onClick={iniciar} disabled={iniciando} className="h-11">
          {iniciando ? <Loader2 className="animate-spin" /> : <Play />} Iniciar inventário
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function ContagemAberta({
  inventario,
  podeExecutar,
  aoConcluir,
  aoCancelar,
}: {
  inventario: Inventario;
  podeExecutar: boolean;
  aoConcluir: (inv: Inventario) => void;
  aoCancelar: () => void;
}) {
  const [leituras, setLeituras] = useState<Leitura[]>([]);
  const [escopo, setEscopo] = useState<MotoEscopo[] | null>(null);
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [camera, setCamera] = useState(false);
  const [ultima, setUltima] = useState<{ sku: string; situacao: string; modelo: string | null } | null>(null);
  const [confirmarFim, setConfirmarFim] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [observacoes, setObservacoes] = useState("");
  const entrada = useRef<HTMLInputElement>(null);

  const atualizar = useCallback(async () => {
    const [{ data: lidas }, { data: motos }] = await Promise.all([
      supabase
        .from("inventario_leituras")
        .select("id, sku, modelo, situacao, status_sistema, lido_em, leitor:funcionarios!inventario_leituras_lido_por_fkey(nome)")
        .eq("inventario_id", inventario.id)
        .order("lido_em", { ascending: false }),
      supabase.from("motos").select("id, sku, modelo, status, localizacao").in("status", inventario.escopo).order("modelo"),
    ]);
    setLeituras((lidas as unknown as Leitura[]) || []);
    setEscopo((motos as MotoEscopo[]) || []);
  }, [inventario.id, inventario.escopo]);

  useEffect(() => {
    let ativo = true;
    const buscar = () =>
      Promise.all([
        supabase
          .from("inventario_leituras")
          .select("id, sku, modelo, situacao, status_sistema, lido_em, leitor:funcionarios!inventario_leituras_lido_por_fkey(nome)")
          .eq("inventario_id", inventario.id)
          .order("lido_em", { ascending: false }),
        supabase.from("motos").select("id, sku, modelo, status, localizacao").in("status", inventario.escopo).order("modelo"),
      ]).then(([{ data: lidas }, { data: motos }]) => {
        if (!ativo) return;
        setLeituras((lidas as unknown as Leitura[]) || []);
        setEscopo((motos as MotoEscopo[]) || []);
      });
    buscar();
    // Outras pessoas podem estar contando ao mesmo tempo
    const id = setInterval(buscar, 8000);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, [inventario.id, inventario.escopo]);

  const lidasSku = useMemo(() => new Set(leituras.map((l) => l.sku.toUpperCase())), [leituras]);
  const pendentes = useMemo(() => (escopo ?? []).filter((m) => !lidasSku.has(m.sku.toUpperCase())), [escopo, lidasSku]);
  const conferidas = leituras.filter((l) => l.situacao === "confere").length;
  const divergentes = leituras.filter((l) => l.situacao !== "confere");
  const esperado = escopo?.length ?? 0;
  const progresso = esperado > 0 ? Math.min(100, (conferidas / esperado) * 100) : 0;

  const registrar = async (bruto: string) => {
    const sku = bruto.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (sku.length < 5) {
      toast.warning("Código muito curto.");
      return;
    }
    setEnviando(true);
    const { data, error } = await supabase.rpc("registrar_leitura_inventario", { p_inventario: inventario.id, p_sku: sku });
    setEnviando(false);
    setCodigo("");
    if (error) {
      tocarSom("erro");
      toast.error(error.message || "Falha ao registrar a leitura.");
      return;
    }
    const r = data as { situacao: string; sku: string; modelo: string | null };
    setUltima({ sku: r.sku, situacao: r.situacao, modelo: r.modelo });
    tocarSom(r.situacao === "confere" ? "sucesso" : r.situacao === "duplicada" ? "alerta" : "erro");
    if (r.situacao !== "duplicada") atualizar();
    setTimeout(() => entrada.current?.focus(), 50);
  };

  const desfazer = async (l: Leitura) => {
    const { error } = await supabase.from("inventario_leituras").delete().eq("id", l.id);
    if (error) toast.error("Não foi possível desfazer a leitura.");
    else {
      toast.success(`Leitura de ${l.sku} desfeita.`);
      atualizar();
    }
  };

  const finalizar = async () => {
    const { data, error } = await supabase.rpc("finalizar_inventario", { p_inventario: inventario.id, p_observacoes: observacoes || null });
    if (error) {
      toast.error(error.message || "Não foi possível finalizar.");
      return;
    }
    const inv = data as Inventario;
    await registrarLog("INVENTARIO_FINALIZADO", "Sistema", {
      descricao: inv.descricao, lidas: inv.total_lido, esperadas: inv.total_esperado, faltas: inv.total_faltas, sobras: inv.total_sobras,
    });
    setConfirmarFim(false);
    toast.success("Inventário finalizado.");
    aoConcluir({ ...inv, iniciador: inventario.iniciador });
  };

  const cancelar = async () => {
    const { error } = await supabase.from("inventarios").update({ status: "cancelado" }).eq("id", inventario.id).eq("status", "aberto");
    if (error) {
      toast.error("Não foi possível cancelar.");
      return;
    }
    await registrarLog("INVENTARIO_CANCELADO", "Sistema", { descricao: inventario.descricao, leituras: leituras.length });
    setConfirmarCancelar(false);
    toast.success("Inventário cancelado.");
    aoCancelar();
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/30">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Led estado="processo" piscando /> {inventario.descricao || "Inventário em andamento"}</CardTitle>
              <CardDescription>
                {rotuloEscopo(inventario.escopo)} · iniciado {dataHora(inventario.iniciado_em)} por {inventario.iniciador?.nome ?? "—"}
              </CardDescription>
            </div>
            {podeExecutar && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setConfirmarCancelar(true)}><XCircle /> Cancelar</Button>
                <Button onClick={() => setConfirmarFim(true)}><CheckCircle2 /> Finalizar</Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard rotulo="Esperadas" valor={escopo ? esperado : "…"} icone={ClipboardList} />
            <StatCard rotulo="Conferidas" valor={conferidas} icone={CheckCircle2} tom="sucesso" />
            <StatCard rotulo="Pendentes" valor={escopo ? pendentes.length : "…"} icone={PackageSearch} tom={pendentes.length > 0 ? "alerta" : "sucesso"} />
            <StatCard rotulo="Divergências" valor={divergentes.length} icone={AlertTriangle} tom={divergentes.length > 0 ? "perigo" : "neutro"} />
          </div>
          <div className="space-y-1">
            <Progress value={progresso} className="h-2.5" />
            <p className="text-right text-xs text-muted-foreground">{Math.round(progresso)}% conferido</p>
          </div>

          {podeExecutar && (
            <div className="space-y-3">
              {camera && <LeitorCamera continuo aoLer={registrar} aoFechar={() => setCamera(false)} />}
              <form
                onSubmit={(e) => { e.preventDefault(); if (codigo.trim()) registrar(codigo); }}
                className="flex gap-2"
              >
                <div className="relative flex-1">
                  <ScanBarcode className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={entrada}
                    autoFocus
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    placeholder="Bipe ou digite o chassi"
                    className="h-12 pl-10 font-mono text-base uppercase placeholder:font-sans placeholder:normal-case"
                    disabled={enviando}
                  />
                </div>
                <Button type="submit" className="h-12" disabled={enviando || !codigo.trim()}>
                  {enviando ? <Loader2 className="animate-spin" /> : "Registrar"}
                </Button>
                <Button type="button" variant="outline" className="h-12" onClick={() => setCamera((v) => !v)} aria-label="Ler pela câmera">
                  <Camera />
                </Button>
              </form>
              {ultima && (
                <div className={cn("flex items-center justify-between gap-3 rounded-md border border-l-[3px] bg-card px-4 py-3", SITUACAO[ultima.situacao]?.borda)}>
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">{ultima.sku}</p>
                    <p className="text-xs text-muted-foreground">{ultima.modelo || "Sem cadastro"}</p>
                  </div>
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Led estado={SITUACAO[ultima.situacao]?.estado ?? "neutro"} />
                    {SITUACAO[ultima.situacao]?.rotulo ?? ultima.situacao}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="lidas">
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-grid">
          <TabsTrigger value="lidas">Lidas ({leituras.length})</TabsTrigger>
          <TabsTrigger value="pendentes">Pendentes ({pendentes.length})</TabsTrigger>
          <TabsTrigger value="divergencias">Divergências ({divergentes.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="lidas">
          <ListaLeituras itens={leituras} aoDesfazer={podeExecutar ? desfazer : undefined} vazio="Nenhuma moto lida ainda." />
        </TabsContent>
        <TabsContent value="pendentes">
          <Card className="py-2">
            <CardContent className="px-2">
              {escopo === null ? (
                <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
              ) : pendentes.length === 0 ? (
                <EmptyState icone={CheckCircle2} titulo="Tudo conferido" descricao="Todas as motos esperadas já foram lidas." compacto className="border-0" />
              ) : (
                pendentes.map((m) => (
                  <Link key={m.id} href={`/prontuario/${encodeURIComponent(m.sku)}`} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-accent">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold">{m.sku}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.modelo || "—"}{m.localizacao ? ` · ${m.localizacao}` : ""}</p>
                    </div>
                    <StatusBadge status={m.status} />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="divergencias">
          <ListaLeituras itens={divergentes} aoDesfazer={podeExecutar ? desfazer : undefined} vazio="Nenhuma divergência até agora." />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        aberto={confirmarFim}
        aoMudar={setConfirmarFim}
        titulo="Finalizar inventário?"
        descricao={
          <div className="space-y-1">
            <p>{conferidas} de {esperado} motos conferidas.</p>
            {pendentes.length > 0 && <p className="font-medium text-destructive">{pendentes.length} moto(s) não lida(s) serão registradas como FALTA.</p>}
            {divergentes.length > 0 && <p className="font-medium text-warning">{divergentes.length} leitura(s) serão registradas como SOBRA.</p>}
          </div>
        }
        confirmar="Finalizar"
        aoConfirmar={finalizar}
      >
        <div className="space-y-2">
          <Label htmlFor="obs">Observações (opcional)</Label>
          <Textarea id="obs" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        aberto={confirmarCancelar}
        aoMudar={setConfirmarCancelar}
        titulo="Cancelar inventário?"
        descricao="As leituras feitas ficam registradas, mas o inventário não gera resultado."
        confirmar="Cancelar inventário"
        destrutivo
        aoConfirmar={cancelar}
      />
    </div>
  );
}

function ListaLeituras({ itens, aoDesfazer, vazio }: { itens: Leitura[]; aoDesfazer?: (l: Leitura) => void; vazio: string }) {
  return (
    <Card className="py-2">
      <CardContent className="px-2">
        {itens.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{vazio}</p>
        ) : (
          itens.map((l) => (
            <div key={l.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/50">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-semibold">{l.sku}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {l.modelo || "Sem cadastro"}
                  {l.situacao === "fora_do_escopo" && l.status_sistema ? ` · no sistema: ${rotuloStatus(l.status_sistema)}` : ""}
                  {` · ${new Date(l.lido_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
                  {l.leitor?.nome ? ` · ${l.leitor.nome}` : ""}
                </p>
              </div>
              <Selo estado={SITUACAO[l.situacao]?.estado} className="hidden sm:inline-flex">
                {SITUACAO[l.situacao]?.rotulo ?? l.situacao}
              </Selo>
              {aoDesfazer && (
                <Button variant="ghost" size="icon-sm" onClick={() => aoDesfazer(l)} aria-label={`Desfazer leitura de ${l.sku}`} title="Desfazer leitura">
                  <Undo2 />
                </Button>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function ResultadoInventario({ inventario, aoFechar }: { inventario: Inventario | null; aoFechar: () => void }) {
  const faltas = inventario?.resultado?.faltas ?? [];
  const sobras = inventario?.resultado?.sobras ?? [];

  const exportar = async () => {
    if (!inventario) return;
    await baixarPlanilha(`SGM_Inventario_${new Date(inventario.iniciado_em).toLocaleDateString("pt-BR").replace(/\//g, "-")}`, [
      {
        nome: "Resumo",
        colunas: [{ header: "Item", key: "item", width: 28 }, { header: "Valor", key: "valor", width: 40 }],
        linhas: [
          { item: "Descrição", valor: inventario.descricao ?? "" },
          { item: "Áreas", valor: rotuloEscopo(inventario.escopo) },
          { item: "Início", valor: dataHora(inventario.iniciado_em) },
          { item: "Fim", valor: dataHora(inventario.finalizado_em) },
          { item: "Esperadas", valor: inventario.total_esperado ?? 0 },
          { item: "Lidas", valor: inventario.total_lido ?? 0 },
          { item: "Faltas", valor: inventario.total_faltas ?? 0 },
          { item: "Sobras", valor: inventario.total_sobras ?? 0 },
          { item: "Observações", valor: inventario.observacoes ?? "" },
        ],
      },
      {
        nome: "Faltas",
        colunas: [
          { header: "Chassi", key: "sku", width: 22 }, { header: "Modelo", key: "modelo", width: 22 },
          { header: "Etapa no sistema", key: "status", width: 22 }, { header: "Localização", key: "localizacao", width: 28 },
        ],
        linhas: faltas.map((f) => ({ ...f, status: rotuloStatus(f.status) })),
      },
      {
        nome: "Sobras",
        colunas: [
          { header: "Chassi", key: "sku", width: 22 }, { header: "Modelo", key: "modelo", width: 22 },
          { header: "Situação", key: "situacao", width: 18 }, { header: "Etapa no sistema", key: "status_sistema", width: 22 },
        ],
        linhas: sobras.map((s) => ({ ...s, situacao: SITUACAO[s.situacao]?.rotulo ?? s.situacao, status_sistema: s.status_sistema ? rotuloStatus(s.status_sistema) : "—" })),
      },
    ]);
  };

  return (
    <Dialog open={!!inventario} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{inventario?.descricao || "Inventário"}</DialogTitle>
          <DialogDescription>
            {inventario && `${rotuloEscopo(inventario.escopo)} · ${dataHora(inventario.iniciado_em)} → ${dataHora(inventario.finalizado_em)}`}
          </DialogDescription>
        </DialogHeader>
        {inventario?.status === "cancelado" ? (
          <p className="text-sm text-muted-foreground">Este inventário foi cancelado e não tem resultado.</p>
        ) : (
          <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard rotulo="Esperadas" valor={inventario?.total_esperado ?? 0} />
              <StatCard rotulo="Lidas" valor={inventario?.total_lido ?? 0} />
              <StatCard rotulo="Faltas" valor={faltas.length} tom={faltas.length ? "perigo" : "sucesso"} destacar={faltas.length > 0} />
              <StatCard rotulo="Sobras" valor={sobras.length} tom={sobras.length ? "alerta" : "sucesso"} destacar={sobras.length > 0} />
            </div>
            <Secao titulo="Faltas (no sistema, mas não lidas)" vazio="Nenhuma falta.">
              {faltas.map((f) => (
                <Link key={f.sku} href={`/prontuario/${encodeURIComponent(f.sku)}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                  <span><span className="font-mono font-semibold">{f.sku}</span> · {f.modelo || "—"}</span>
                  <span className="text-xs text-muted-foreground">{f.localizacao || rotuloStatus(f.status)}</span>
                </Link>
              ))}
            </Secao>
            <Secao titulo="Sobras (lidas, mas fora do esperado)" vazio="Nenhuma sobra.">
              {sobras.map((s) => (
                <div key={s.sku} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm">
                  <span><span className="font-mono font-semibold">{s.sku}</span> · {s.modelo || "Sem cadastro"}</span>
                  <span className="text-xs text-muted-foreground">
                    {SITUACAO[s.situacao]?.rotulo ?? s.situacao}{s.status_sistema ? ` (${rotuloStatus(s.status_sistema)})` : ""}
                  </span>
                </div>
              ))}
            </Secao>
            {inventario?.observacoes && <p className="text-sm"><strong>Observações:</strong> {inventario.observacoes}</p>}
          </div>
        )}
        <div className="flex justify-end gap-2">
          {inventario?.status === "finalizado" && (
            <Button variant="outline" onClick={exportar}><Download /> Exportar Excel</Button>
          )}
          <Button onClick={aoFechar}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Secao({ titulo, vazio, children }: { titulo: string; vazio: string; children: React.ReactNode[] }) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-semibold"><FileSearch className="size-4 text-muted-foreground" /> {titulo}</p>
      {children.length === 0 ? <p className="text-sm text-muted-foreground">{vazio}</p> : <div className="rounded-lg border p-1">{children}</div>}
    </div>
  );
}
