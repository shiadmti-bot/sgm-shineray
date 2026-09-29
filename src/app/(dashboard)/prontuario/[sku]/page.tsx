"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertOctagon, ArrowLeft, CalendarClock, Camera, CheckCircle2, ClipboardCheck, Copy, FileSearch, Flag, History,
  MapPin, PauseCircle, Printer, RotateCcw, ScanBarcode, Tag, Truck, UserRound, Wrench, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/sgm/StatusBadge";
import { EmptyState } from "@/components/sgm/EmptyState";
import { FotosMoto } from "@/components/sgm/FotosMoto";
import { Carregando } from "@/components/sgm/Carregando";
import { Led } from "@/components/sgm/Led";
import { Painel } from "@/components/sgm/Painel";
import { PlacaChassi } from "@/components/sgm/PlacaChassi";
import { supabase } from "@/lib/supabase";
import { usePode } from "@/lib/auth";
import { formatarDuracaoMin } from "@/lib/datas";
import { getHexColor, rotuloAvaria } from "@/lib/constantes";
import { estacaoDaAcao, resumoDetalhes, rotuloAcao } from "@/lib/eventos";
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
  /** Cor do ícone (sinalização do tipo de evento). */
  cor: string;
  estacao?: string;
}

/** Estações do fluxo principal, na ordem (para mostrar onde a moto está). */
const ETAPAS = [
  { codigo: "E1", titulo: "Entrada" },
  { codigo: "E2", titulo: "Montagem" },
  { codigo: "E3", titulo: "Qualidade" },
  { codigo: "E4", titulo: "Etiquetagem" },
  { codigo: "E5", titulo: "Estoque" },
  { codigo: "EXP", titulo: "Expedição" },
];

/** Como a moto está dentro da estação atual. */
const SITUACAO_NA_ETAPA: Record<string, string> = {
  aguardando_montagem: "na fila",
  em_producao: "montando",
  pausado: "pausada",
  retrabalho_montagem: "em retrabalho",
  em_analise: "aguardando inspeção",
  aguardando_etiqueta: "aguardando etiqueta",
  aprovado: "aguardando etiqueta",
  estoque: "no pátio",
};

/** Estação em que a moto está, pelo status atual. */
function estacaoAtual(status?: string | null): string | undefined {
  if (!status) return undefined;
  if (status.startsWith("avaria_")) return "AV";
  switch (status) {
    case "aguardando_montagem":
    case "em_producao":
    case "pausado":
    case "retrabalho_montagem":
      return "E2";
    case "em_analise":
      return "E3";
    case "aguardando_etiqueta":
    case "aprovado":
      return "E4";
    case "estoque":
      return "E5";
    case "expedido":
      return "EXP";
    default:
      return undefined;
  }
}

const ICONE_ACAO: Record<string, { icone: LucideIcon; cor: string }> = {
  ENTRADA_ESTOQUE: { icone: ScanBarcode, cor: "text-sutil" },
  INICIO_MONTAGEM: { icone: Wrench, cor: "text-info" },
  PRODUCAO_FIM: { icone: Flag, cor: "text-info" },
  FIM_MONTAGEM: { icone: Flag, cor: "text-info" },
  APROVACAO_QA: { icone: ClipboardCheck, cor: "text-success" },
  RETRABALHO_QA: { icone: RotateCcw, cor: "text-serio" },
  REPROVACAO_QA: { icone: AlertOctagon, cor: "text-destructive" },
  REPARO_OFICINA: { icone: CheckCircle2, cor: "text-success" },
  IMPRESSAO_ETIQUETA: { icone: Tag, cor: "text-sutil" },
  REIMPRESSAO_ETIQUETA: { icone: Printer, cor: "text-sutil" },
  REVERSAO_ESTOQUE: { icone: RotateCcw, cor: "text-warning" },
  SAIDA_ESTOQUE: { icone: Truck, cor: "text-success" },
};
const iconeAcao = (acao: string) =>
  ICONE_ACAO[acao] ?? (acao.startsWith("PAUSA") ? { icone: PauseCircle, cor: "text-warning" } : { icone: History, cor: "text-sutil" });

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
    eventos.push({ chave: "entrada", quando: moto.created_at, titulo: "Entrada registrada", icone: ScanBarcode, cor: "text-sutil", estacao: "E1" });
  }
  const temPausas = pausas.length > 0;
  for (const l of logs) {
    if (temPausas && (l.acao === "PAUSA_APROVADA" || l.acao === "PAUSA_RETOMADA")) continue;
    const { icone, cor } = iconeAcao(l.acao);
    eventos.push({ chave: l.id, quando: l.created_at, titulo: rotuloAcao(l.acao), detalhe: resumoDetalhes(l.detalhes) || undefined, autor: l.usuario, icone, cor, estacao: estacaoDaAcao(l.acao) });
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
      cor: "text-warning",
      estacao: "E2",
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

  const etapaAtual = estacaoAtual(moto?.status);
  // No pátio de avarias a moto está parada no desvio da E3
  const indiceAtual = etapaAtual === "AV" ? ETAPAS.findIndex((e) => e.codigo === "E3") : ETAPAS.findIndex((e) => e.codigo === etapaAtual);

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm"><Link href="/prontuario"><ArrowLeft /> Prontuário</Link></Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}><Printer /> Imprimir</Button>
      </div>

      {/* Cabeçalho do prontuário */}
      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-col gap-4 border-b border-white/10 bg-sidebar p-5 text-white md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="rotulo text-white/60">Prontuário do chassi</p>
            <h1 className="text-[28px] font-semibold leading-tight">{moto?.modelo || "Moto removida do cadastro"}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <PlacaChassi chassi={moto?.sku ?? sku} tamanho="md" />
              <button type="button" onClick={copiar} className="flex h-7 items-center gap-1.5 rounded-sm border border-white/15 px-2 text-xs text-white/80 hover:bg-white/10 print:hidden" title="Copiar chassi">
                <Copy className="size-3.5" /> Copiar
              </button>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            {moto ? <StatusBadge status={moto.status} className="text-sm" /> : <span className="rounded-sm border border-white/20 px-2 py-0.5 text-xs font-semibold text-white/80">Fora do cadastro</span>}
            {moto?.localizacao && <p className="flex items-center gap-1 text-sm text-white/70"><MapPin className="size-4" /> {moto.localizacao}</p>}
          </div>
        </div>

        {/* Onde a moto está no fluxo */}
        {moto && (
          <div className="space-y-3 p-5">
            <p className="rotulo text-sutil">Posição no fluxo</p>
            <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {ETAPAS.map((e, i) => {
                const passou = indiceAtual > i || moto.status === "expedido";
                const aqui = i === indiceAtual && moto.status !== "expedido";
                return (
                  <li
                    key={e.codigo}
                    className={cn(
                      "flex items-center gap-2 rounded-sm border px-2.5 py-2",
                      aqui && "border-foreground shadow-[0_0_0_1px_hsl(var(--foreground))]",
                      !passou && !aqui && "border-dashed text-sutil",
                    )}
                    aria-current={aqui ? "step" : undefined}
                  >
                    <span className={cn("codigo-estacao", !passou && !aqui && "border border-dashed border-foreground/30 bg-transparent text-sutil")}>{e.codigo}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold">{e.titulo}</span>
                      <span className="block text-[11px] text-sutil">{aqui ? SITUACAO_NA_ETAPA[moto.status ?? ""] ?? (etapaAtual === "AV" ? "em avarias (AV)" : "está aqui") : passou ? "concluída" : "a seguir"}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
            {(etapaAtual === "AV" || (moto.rework_count ?? 0) > 0 || avarias.length > 0) && (
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {etapaAtual === "AV" && <span className="flex items-center gap-1.5"><Led estado="critico" className="size-2" /> Agora no pátio de avarias (desvio da E3)</span>}
                {(moto.rework_count ?? 0) > 0 && <span className="flex items-center gap-1.5"><RotateCcw className="size-3.5 text-serio" /> Voltou {moto.rework_count}x para retrabalho</span>}
                {avarias.length > 0 && <span className="flex items-center gap-1.5"><AlertOctagon className="size-3.5 text-destructive" /> {avarias.length} registro(s) de avaria</span>}
              </p>
            )}
            <details className="group text-sm print:hidden">
              <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground hover:text-foreground">
                Como ler o número do chassi
              </summary>
              <div className="pt-3">
                <PlacaChassi chassi={moto.sku} tamanho="sm" explicar modelo={moto.modelo} />
              </div>
            </details>
          </div>
        )}
      </section>

      {moto && (
        <div className="grid gap-4 md:grid-cols-3">
          <Painel titulo="Identificação" corpoClassName="space-y-2 text-sm">
            <Linha rotulo="Ano">{moto.ano || "—"}</Linha>
            <Linha rotulo="Cor">
              <span className="flex items-center gap-2">{moto.cor && <span aria-hidden className="size-3.5 rounded-[2px] border border-foreground/25" style={{ backgroundColor: getHexColor(moto.cor) }} />}{moto.cor || "—"}</span>
            </Linha>
            <Linha rotulo="Banco">{moto.cor_banco || "—"}</Linha>
            <Linha rotulo="Entrada">{dataHora(moto.created_at)}</Linha>
          </Painel>
          <Painel titulo="Responsáveis" corpoClassName="space-y-2 text-sm">
            <Linha rotulo="Montador"><span className="flex items-center gap-1"><UserRound className="size-3.5 text-muted-foreground" />{moto.montador?.nome || "—"}</span></Linha>
            <Linha rotulo="Inspeção (QA)">{moto.supervisor?.nome || "—"}</Linha>
            <Linha rotulo="Técnico de reparo">{moto.tecnico_reparo || "—"}</Linha>
            <Linha rotulo="Retrabalhos">
              <span className="flex items-center gap-1.5 font-semibold">
                {(moto.rework_count ?? 0) > 0 && <RotateCcw className="size-3.5 text-serio" />}
                {moto.rework_count ?? 0}
              </span>
            </Linha>
          </Painel>
          <Painel titulo="Tempos" corpoClassName="space-y-2 text-sm">
            <Linha rotulo="Início da montagem">{dataHora(moto.inicio_montagem)}</Linha>
            <Linha rotulo="Fim da montagem">{dataHora(moto.fim_montagem)}</Linha>
            <Linha rotulo="Tempo de montagem"><span className="font-mono">{tempoMontagem !== null ? formatarDuracaoMin(tempoMontagem) : "—"}</span></Linha>
            <Linha rotulo="Tempo parado">{pausas.length ? `${formatarDuracaoMin(tempoPausado)} (${pausas.length} pausa${pausas.length > 1 ? "s" : ""})` : "—"}</Linha>
          </Painel>
        </div>
      )}

      {moto && (moto.observacoes || moto.detalhes_avaria) && (
        <div className="space-y-1 rounded-md border border-l-[3px] border-l-warning bg-card px-4 py-3 text-sm">
          {moto.detalhes_avaria && <p><strong className="font-semibold">Avaria atual:</strong> {moto.detalhes_avaria}</p>}
          {moto.observacoes && <p><strong className="font-semibold">Observações:</strong> {moto.observacoes}</p>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Painel titulo="Linha do tempo" icone={CalendarClock} meta={`${eventos.length} registro(s)`} className="lg:col-span-3">
          {eventos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
          ) : (
            <ol className="relative space-y-4">
              <span aria-hidden className="absolute bottom-3 left-[17px] top-3 w-px bg-border" />
              {eventos.map((ev) => {
                const Icone = ev.icone;
                return (
                  <li key={ev.chave} className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-3">
                    <span className="relative z-10 flex flex-col items-center gap-1">
                      {ev.estacao ? (
                        <span className={cn("codigo-estacao h-6 min-w-9", (ev.estacao === "AV" || ev.estacao === "IN") && "border border-dashed border-foreground/40 bg-card text-foreground")}>{ev.estacao}</span>
                      ) : (
                        <span className="flex h-6 min-w-9 items-center justify-center rounded-sm border bg-card"><Icone className="size-3.5 text-sutil" /></span>
                      )}
                    </span>
                    <div className="min-w-0 pb-1">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        {ev.estacao && <Icone className={cn("size-3.5 shrink-0", ev.cor)} aria-hidden />}
                        {ev.titulo}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{dataHora(ev.quando)}</span>{ev.autor ? ` · ${ev.autor}` : ""}
                      </p>
                      {ev.detalhe && <p className="mt-1 text-xs text-muted-foreground">{ev.detalhe}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Painel>

        <div className="space-y-6 lg:col-span-2">
          {moto && (
            <Painel titulo="Fotos" icone={Camera}>
              <FotosMoto motoId={moto.id} sku={moto.sku} etapaEnvio={podeFotografar ? "outro" : undefined} />
            </Painel>
          )}

          <Painel titulo="Avarias e reparos" codigo="AV" corpoClassName="space-y-3">
            {avarias.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma avaria registrada.</p>
            ) : (
              avarias.map((a) => (
                <div key={a.id} className={cn("space-y-1 rounded-sm border border-l-[3px] p-3 text-sm", a.status_ticket === "resolvido" ? "border-l-success" : "border-l-destructive")}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{rotuloAvaria(a.tipo_avaria)}</p>
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <Led estado={a.status_ticket === "resolvido" ? "bom" : "critico"} className="size-2" />
                      {a.status_ticket === "resolvido" ? "Resolvida" : "Pendente"}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{a.descricao_problema || "—"}</p>
                  <p className="text-xs text-sutil">Reportada em {dataHora(a.data_reporte || a.created_at)}{a.supervisor?.nome ? ` por ${a.supervisor.nome}` : ""}</p>
                  {a.data_resolucao && (
                    <p className="text-xs text-sutil">
                      Reparo: {a.descricao_solucao || "—"} · {a.tecnico_nome || "—"} · {dataHora(a.data_resolucao)}
                    </p>
                  )}
                </div>
              ))
            )}
          </Painel>

          {leituras.length > 0 && (
            <Painel titulo="Inventários" codigo="IN" corpoClassName="space-y-2 text-sm">
              {leituras.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{l.inventario?.descricao || "Inventário"}</span>
                  <span className="shrink-0 text-xs text-sutil">{ROTULO_LEITURA[l.situacao] ?? l.situacao} · {dataHora(l.lido_em)}</span>
                </div>
              ))}
            </Painel>
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
    <div className="flex items-center justify-between gap-3 border-b border-dashed pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
