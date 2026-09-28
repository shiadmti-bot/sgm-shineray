"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertOctagon, ArrowLeft, Boxes, CalendarClock, CheckCircle2, ClipboardCheck, Copy, FileSearch, Flag, History,
  MapPin, PauseCircle, Printer, RotateCcw, ScanBarcode, Tag, Truck, UserRound, Wrench, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/sgm/StatusBadge";
import { EmptyState } from "@/components/sgm/EmptyState";
import { FotosMoto } from "@/components/sgm/FotosMoto";
import { Carregando } from "@/components/sgm/Carregando";
import { supabase } from "@/lib/supabase";
import { usePode } from "@/lib/auth";
import { formatarDuracaoMin } from "@/lib/datas";
import { getHexColor, rotuloAvaria } from "@/lib/constantes";
import { resumoDetalhes, rotuloAcao } from "@/lib/eventos";
import { cn } from "@/lib/utils";

interface Moto {
  id: string;
  sku: string;
  modelo: string | null;
  ano: string | null;
  cor: string | null;
  cor_banco: string | null;
  status: string | null;
  localizacao: string | null;
  inicio_montagem: string | null;
  fim_montagem: string | null;
  observacoes: string | null;
  detalhes_avaria: string | null;
  tecnico_reparo: string | null;
  rework_count: number | null;
  created_at: string | null;
  updated_at: string | null;
  montador?: { nome: string } | null;
  supervisor?: { nome: string } | null;
}

interface Log { id: string; acao: string; usuario: string | null; detalhes: unknown; created_at: string }
interface Pausa { id: string; motivo: string | null; inicio: string; fim: string | null; montador?: { nome: string } | null }
interface Avaria {
  id: string; tipo_avaria: string | null; descricao_problema: string | null; status_ticket: string | null; data_reporte: string | null;
  created_at: string; tecnico_nome: string | null; descricao_solucao: string | null; data_resolucao: string | null;
  supervisor?: { nome: string } | null;
}
interface Leitura { id: string; situacao: string; lido_em: string; inventario?: { descricao: string | null } | null }

interface Evento {
  chave: string;
  quando: string;
  titulo: string;
  detalhe?: string;
  autor?: string | null;
  icone: LucideIcon;
  cor: string;
}

const ICONE_ACAO: Record<string, { icone: LucideIcon; cor: string }> = {
  ENTRADA_ESTOQUE: { icone: ScanBarcode, cor: "bg-muted text-muted-foreground" },
  INICIO_MONTAGEM: { icone: Wrench, cor: "bg-info/10 text-info" },
  PRODUCAO_FIM: { icone: Flag, cor: "bg-info/10 text-info" },
  FIM_MONTAGEM: { icone: Flag, cor: "bg-info/10 text-info" },
  APROVACAO_QA: { icone: ClipboardCheck, cor: "bg-success/10 text-success" },
  RETRABALHO_QA: { icone: RotateCcw, cor: "bg-destructive/10 text-destructive" },
  REPROVACAO_QA: { icone: AlertOctagon, cor: "bg-orange-500/10 text-orange-600" },
  REPARO_OFICINA: { icone: CheckCircle2, cor: "bg-success/10 text-success" },
  IMPRESSAO_ETIQUETA: { icone: Tag, cor: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400" },
  REIMPRESSAO_ETIQUETA: { icone: Printer, cor: "bg-muted text-muted-foreground" },
  REVERSAO_ESTOQUE: { icone: RotateCcw, cor: "bg-warning/10 text-warning" },
  SAIDA_ESTOQUE: { icone: Truck, cor: "bg-success/10 text-success" },
};
const iconeAcao = (acao: string) =>
  ICONE_ACAO[acao] ?? (acao.startsWith("PAUSA") ? { icone: PauseCircle, cor: "bg-warning/10 text-warning" } : { icone: History, cor: "bg-muted text-muted-foreground" });

const dataHora = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const minutosEntre = (a?: string | null, b?: string | null) => (a && b ? Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60000) : null);
const ROTULO_LEITURA: Record<string, string> = { confere: "Conferida", fora_do_escopo: "Fora do escopo", nao_cadastrada: "Não cadastrada" };

export default function ProntuarioPage() {
  const { sku: bruto } = useParams<{ sku: string }>();
  const sku = decodeURIComponent(String(bruto || "")).toUpperCase();
  const podeFotografar = usePode(["qualidade.inspecionar", "avarias.reparar"]);

  const [carregando, setCarregando] = useState(true);
  const [moto, setMoto] = useState<Moto | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [pausas, setPausas] = useState<Pausa[]>([]);
  const [avarias, setAvarias] = useState<Avaria[]>([]);
  const [leituras, setLeituras] = useState<Leitura[]>([]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const { data: encontrada } = await supabase
        .from("motos")
        .select(`*, montador:funcionarios!motos_montador_id_fkey(nome), supervisor:funcionarios!motos_supervisor_id_fkey(nome)`)
        .ilike("sku", sku)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const m = encontrada as Moto | null;
      const referencia = m?.sku ?? sku;
      const [rLogs, rPausas, rAvarias, rLeituras] = await Promise.all([
        supabase.from("logs_sistema").select("id, acao, usuario, detalhes, created_at").eq("referencia", referencia).order("created_at", { ascending: true }).limit(500),
        m ? supabase.from("pausas_producao").select("id, motivo, inicio, fim, montador_id").eq("moto_id", m.id).order("inicio") : Promise.resolve({ data: [] }),
        m ? supabase.from("historico_avarias").select("*").eq("moto_id", m.id).order("created_at") : Promise.resolve({ data: [] }),
        m ? supabase.from("inventario_leituras").select("id, situacao, lido_em, inventario:inventarios(descricao)").eq("moto_id", m.id).order("lido_em") : Promise.resolve({ data: [] }),
      ]);
      // Nomes das pessoas (sem depender de chaves estrangeiras nas tabelas antigas)
      const listaPausas = ((rPausas.data as unknown) as (Pausa & { montador_id: string | null })[]) || [];
      const listaAvarias = ((rAvarias.data as unknown) as (Avaria & { supervisor_id: string | null })[]) || [];
      const ids = [...new Set([...listaPausas.map((p) => p.montador_id), ...listaAvarias.map((a) => a.supervisor_id)].filter(Boolean))] as string[];
      const nomes = new Map<string, string>();
      if (ids.length > 0) {
        const { data: pessoas } = await supabase.from("funcionarios").select("id, nome").in("id", ids);
        (pessoas || []).forEach((f: { id: string; nome: string }) => nomes.set(f.id, f.nome));
      }
      if (!ativo) return;
      setMoto(m);
      setLogs((rLogs.data as Log[]) || []);
      setPausas(listaPausas.map((p) => ({ ...p, montador: p.montador_id ? { nome: nomes.get(p.montador_id) ?? "—" } : null })));
      setAvarias(listaAvarias.map((a) => ({ ...a, supervisor: a.supervisor_id ? { nome: nomes.get(a.supervisor_id) ?? "—" } : null })));
      setLeituras(((rLeituras.data as unknown) as Leitura[]) || []);
      setCarregando(false);
    })();
    return () => {
      ativo = false;
    };
  }, [sku]);

  if (carregando) return <Carregando texto="Montando o prontuário…" />;

  // Linha do tempo: eventos da auditoria + pausas registradas
  const eventos: Evento[] = [];
  if (moto?.created_at && !logs.some((l) => l.acao === "ENTRADA_ESTOQUE")) {
    eventos.push({ chave: "entrada", quando: moto.created_at, titulo: "Entrada registrada", icone: ScanBarcode, cor: "bg-muted text-muted-foreground" });
  }
  const temPausas = pausas.length > 0;
  for (const l of logs) {
    if (temPausas && (l.acao === "PAUSA_APROVADA" || l.acao === "PAUSA_RETOMADA")) continue;
    const { icone, cor } = iconeAcao(l.acao);
    eventos.push({ chave: l.id, quando: l.created_at, titulo: rotuloAcao(l.acao), detalhe: resumoDetalhes(l.detalhes) || undefined, autor: l.usuario, icone, cor });
  }
  for (const p of pausas) {
    const duracao = minutosEntre(p.inicio, p.fim);
    eventos.push({
      chave: `pausa-${p.id}`,
      quando: p.inicio,
      titulo: p.fim ? `Pausa de ${formatarDuracaoMin(duracao ?? 0)}` : "Pausa em andamento",
      detalhe: p.motivo ? `motivo: ${p.motivo}` : undefined,
      autor: p.montador?.nome,
      icone: PauseCircle,
      cor: "bg-warning/10 text-warning",
    });
  }
  eventos.sort((a, b) => new Date(a.quando).getTime() - new Date(b.quando).getTime());

  if (!moto && eventos.length === 0) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm"><Link href="/prontuario"><ArrowLeft /> Voltar à busca</Link></Button>
        <EmptyState icone={FileSearch} titulo="Chassi não encontrado" descricao={`Não há moto nem eventos registrados para ${sku}.`} />
      </div>
    );
  }

  const tempoMontagem = minutosEntre(moto?.inicio_montagem, moto?.fim_montagem);
  const tempoPausado = pausas.reduce((soma, p) => soma + (minutosEntre(p.inicio, p.fim) ?? 0), 0);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(moto?.sku ?? sku);
      toast.success("Chassi copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm"><Link href="/prontuario"><ArrowLeft /> Prontuário</Link></Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}><Printer /> Imprimir</Button>
      </div>

      <Card className="py-5">
        <CardContent className="flex flex-col gap-4 px-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prontuário</p>
            <h1 className="text-2xl font-bold tracking-tight">{moto?.modelo || "Moto removida do cadastro"}</h1>
            <button type="button" onClick={copiar} className="flex items-center gap-2 font-mono text-lg font-semibold tracking-wide hover:text-primary" title="Copiar chassi">
              {moto?.sku ?? sku} <Copy className="size-4 opacity-60 print:hidden" />
            </button>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            {moto ? <StatusBadge status={moto.status} className="text-sm" /> : <span className="rounded-full border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">Fora do cadastro</span>}
            {moto?.localizacao && <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-4" /> {moto.localizacao}</p>}
          </div>
        </CardContent>
      </Card>

      {moto && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="gap-3 py-4">
            <CardHeader className="px-4"><CardTitle className="text-sm">Identificação</CardTitle></CardHeader>
            <CardContent className="space-y-2 px-4 text-sm">
              <Linha rotulo="Ano">{moto.ano || "—"}</Linha>
              <Linha rotulo="Cor">
                <span className="flex items-center gap-2">{moto.cor && <span className="size-3 rounded-full border" style={{ backgroundColor: getHexColor(moto.cor) }} />}{moto.cor || "—"}</span>
              </Linha>
              <Linha rotulo="Banco">{moto.cor_banco || "—"}</Linha>
              <Linha rotulo="Entrada">{dataHora(moto.created_at)}</Linha>
            </CardContent>
          </Card>
          <Card className="gap-3 py-4">
            <CardHeader className="px-4"><CardTitle className="text-sm">Responsáveis</CardTitle></CardHeader>
            <CardContent className="space-y-2 px-4 text-sm">
              <Linha rotulo="Montador"><span className="flex items-center gap-1"><UserRound className="size-3.5 text-muted-foreground" />{moto.montador?.nome || "—"}</span></Linha>
              <Linha rotulo="Inspeção (QA)">{moto.supervisor?.nome || "—"}</Linha>
              <Linha rotulo="Técnico de reparo">{moto.tecnico_reparo || "—"}</Linha>
              <Linha rotulo="Retrabalhos">
                <span className={cn("font-semibold", (moto.rework_count ?? 0) > 0 && "text-destructive")}>{moto.rework_count ?? 0}</span>
              </Linha>
            </CardContent>
          </Card>
          <Card className="gap-3 py-4">
            <CardHeader className="px-4"><CardTitle className="text-sm">Tempos</CardTitle></CardHeader>
            <CardContent className="space-y-2 px-4 text-sm">
              <Linha rotulo="Início da montagem">{dataHora(moto.inicio_montagem)}</Linha>
              <Linha rotulo="Fim da montagem">{dataHora(moto.fim_montagem)}</Linha>
              <Linha rotulo="Tempo de montagem">{tempoMontagem !== null ? formatarDuracaoMin(tempoMontagem) : "—"}</Linha>
              <Linha rotulo="Tempo parado">{pausas.length ? `${formatarDuracaoMin(tempoPausado)} (${pausas.length} pausa${pausas.length > 1 ? "s" : ""})` : "—"}</Linha>
            </CardContent>
          </Card>
        </div>
      )}

      {moto && (moto.observacoes || moto.detalhes_avaria) && (
        <Card className="gap-2 border-warning/40 bg-warning/5 py-4">
          <CardContent className="space-y-1 px-4 text-sm">
            {moto.detalhes_avaria && <p><strong>Avaria atual:</strong> {moto.detalhes_avaria}</p>}
            {moto.observacoes && <p><strong>Observações:</strong> {moto.observacoes}</p>}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="size-4" /> Linha do tempo</CardTitle>
          </CardHeader>
          <CardContent>
            {eventos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
            ) : (
              <ol className="relative space-y-5 border-l pl-6">
                {eventos.map((ev) => {
                  const Icone = ev.icone;
                  return (
                    <li key={ev.chave} className="relative">
                      <span className={cn("absolute -left-[37px] flex size-7 items-center justify-center rounded-full ring-4 ring-card", ev.cor)}>
                        <Icone className="size-3.5" />
                      </span>
                      <p className="text-sm font-semibold">{ev.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {dataHora(ev.quando)}{ev.autor ? ` · ${ev.autor}` : ""}
                      </p>
                      {ev.detalhe && <p className="mt-1 text-xs text-muted-foreground">{ev.detalhe}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {moto && (
            <Card>
              <CardContent>
                <FotosMoto motoId={moto.id} sku={moto.sku} etapaEnvio={podeFotografar ? "outro" : undefined} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><AlertOctagon className="size-4" /> Avarias e reparos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {avarias.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma avaria registrada.</p>
              ) : (
                avarias.map((a) => (
                  <div key={a.id} className="space-y-1 rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{rotuloAvaria(a.tipo_avaria)}</p>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", a.status_ticket === "resolvido" ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
                        {a.status_ticket === "resolvido" ? "Resolvida" : "Pendente"}
                      </span>
                    </div>
                    <p className="text-muted-foreground">{a.descricao_problema || "—"}</p>
                    <p className="text-xs text-muted-foreground">Reportada em {dataHora(a.data_reporte || a.created_at)}{a.supervisor?.nome ? ` por ${a.supervisor.nome}` : ""}</p>
                    {a.data_resolucao && (
                      <p className="text-xs text-muted-foreground">
                        Reparo: {a.descricao_solucao || "—"} · {a.tecnico_nome || "—"} · {dataHora(a.data_resolucao)}
                      </p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {leituras.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Boxes className="size-4" /> Inventários</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {leituras.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{l.inventario?.descricao || "Inventário"}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{ROTULO_LEITURA[l.situacao] ?? l.situacao} · {dataHora(l.lido_em)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      {!moto && (
        <p className="text-sm text-muted-foreground">
          Esta moto não está mais no cadastro (ex.: removida da fila). Os eventos acima continuam na auditoria.
        </p>
      )}
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
