"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/sgm/PageHeader";
import { Painel } from "@/components/sgm/Painel";
import { StatCard } from "@/components/sgm/StatCard";
import { Dica } from "@/components/sgm/Guia";
import { Led } from "@/components/sgm/Led";
import { buscarTodas } from "@/lib/consultas";
import { formatarDuracaoMin } from "@/lib/datas";
import { useCoresGrafico } from "@/lib/cores-graficos";
import { getHexColor } from "@/lib/constantes";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, ReferenceLine,
} from "recharts";
import {
  ArrowDownRight, ArrowUpRight, CheckCircle2, Clock, FileSpreadsheet, Loader2, OctagonAlert, PauseCircle, Printer, Target,
  Timer, TriangleAlert, Warehouse, Workflow, Wrench, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format, subDays, differenceInMinutes, differenceInHours, startOfMonth } from "date-fns";
import { STATUS_APROVADOS } from "@/lib/constantes";
import { cn } from "@/lib/utils";

// ---------- Tipos ----------

interface MotoRel {
  id: string;
  sku: string;
  modelo: string | null;
  status: string | null;
  cor: string | null;
  cor_banco: string | null;
  rework_count: number | null;
  tecnico_reparo: string | null;
  detalhes_avaria: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string | null;
  inicio_montagem: string | null;
  fim_montagem: string | null;
  montador_id: string | null;
  montador?: { nome: string } | null;
  supervisor?: { nome: string } | null;
}
interface PausaRel { motivo: string | null; inicio: string | null; fim: string | null; montador_id: string | null }
interface AvariaRel { created_at: string; data_resolucao: string | null }
interface SolicitacaoRel { status: string }
interface SaidaRel { referencia: string; created_at: string }
interface MotoPeriodoAnterior { id: string }

interface DiaProducao { name: string; perfeitas: number; retrabalhos: number; avarias: number; emAndamento: number; total: number }
interface DiaFPY { name: string; fpy: number; total: number }
interface EtapaFunil { name: string; codigo: string; value: number; pct: string }
interface Contagem { name: string; value: number }
interface CombinacaoCor { cor: string; banco: string; value: number }
interface MontadorRel { nome: string; total: number; retrabalhos: number; pausas: number; tempoMedio: number }
interface InspetorRel { nome: string; totalInspecionado: number; aprovadas: number; reprovadas: number; tempoMedio: number; taxaReprovacao: number }
interface ModeloRel { name: string; total: number; aprovadas: number; avarias: number; retrabalhos: number }
interface HoraRel { hora: string; total: number }
interface PausaResumo { name: string; value: number; minutos: number }
interface AlertaRel { tipo: "ok" | "warn" | "crit"; msg: string }
interface LeadTime { esperaMontagem: number; esperaQA: number }
interface Kpis {
  totalEntrada: number; aprovadasDireto: number; aprovadasTotal: number; taxaRetrabalho: string;
  gargalo: string; gargaloNivel: "ok" | "warn" | "crit"; tempoMedioMontagem: number; tempoMedioAvaria: number;
  tempoMedioPatio: number; fpy: string; deltaProducao: number; deltaProdSinal: "up" | "down" | "same"; expedidas: number;
}

const KPIS_INICIAIS: Kpis = {
  totalEntrada: 0, aprovadasDireto: 0, aprovadasTotal: 0, taxaRetrabalho: "0", gargalo: "Fluxo Estável", gargaloNivel: "ok",
  tempoMedioMontagem: 0, tempoMedioAvaria: 0, tempoMedioPatio: 0, fpy: "0", deltaProducao: 0, deltaProdSinal: "up", expedidas: 0,
};

const META_FPY = 90;
const PERIODOS = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "semana", rotulo: "7 dias" },
  { valor: "mes", rotulo: "Este mês" },
  { valor: "custom", rotulo: "Personalizado" },
] as const;

const ehAprovada = (m: MotoRel) => STATUS_APROVADOS.includes(m.status ?? "");
const ehPerfeita = (m: MotoRel) => ehAprovada(m) && !m.rework_count && !m.tecnico_reparo;
const media = (lista: number[]) => (lista.length ? Math.round(lista.reduce((a, b) => a + b, 0) / lista.length) : 0);

// ---------- Cálculos (mesmas regras da versão anterior) ----------

function calcularTimeline(motos: MotoRel[], inicio: Date, tipoPeriodo: string, fim: Date): DiaProducao[] {
  const mapa: Record<string, DiaProducao> = {};
  const novo = (name: string): DiaProducao => ({ name, perfeitas: 0, retrabalhos: 0, avarias: 0, emAndamento: 0, total: 0 });
  if (tipoPeriodo !== "hoje") {
    const curr = new Date(inicio);
    const end = new Date(Math.min(fim.getTime(), Date.now()));
    while (curr <= end) {
      const key = format(curr, "dd/MM");
      mapa[key] = novo(key);
      curr.setDate(curr.getDate() + 1);
    }
  }
  motos.forEach((m) => {
    const key = format(new Date(m.created_at), "dd/MM");
    if (!mapa[key]) mapa[key] = novo(key);
    mapa[key].total++;
    if (m.status?.includes("avaria")) mapa[key].avarias++;
    else if ((m.rework_count ?? 0) > 0 || m.status === "retrabalho_montagem" || m.tecnico_reparo) mapa[key].retrabalhos++;
    else if (ehAprovada(m)) mapa[key].perfeitas++;
    else mapa[key].emAndamento++;
  });
  return Object.values(mapa);
}

function calcularFPY(motos: MotoRel[]): DiaFPY[] {
  const mapa: Record<string, { total: number; perfeitas: number }> = {};
  motos.forEach((m) => {
    const key = format(new Date(m.created_at), "dd/MM");
    if (!mapa[key]) mapa[key] = { total: 0, perfeitas: 0 };
    mapa[key].total++;
    if (ehPerfeita(m)) mapa[key].perfeitas++;
  });
  return Object.entries(mapa).map(([name, v]) => ({ name, total: v.total, fpy: v.total > 0 ? Math.round((v.perfeitas / v.total) * 100) : 0 }));
}

function calcularKPIs(motos: MotoRel[], histAv: AvariaRel[], prevMotos: MotoPeriodoAnterior[], saidas: SaidaRel[]): Kpis {
  const total = motos.length;
  const aprovadasTotal = motos.filter(ehAprovada).length;
  const perfeitas = motos.filter(ehPerfeita).length;
  const comRetrabalho = motos.filter((m) => (m.rework_count ?? 0) > 0 || m.status === "retrabalho_montagem" || m.tecnico_reparo).length;
  const taxaRetrabalho = total > 0 ? ((comRetrabalho / total) * 100).toFixed(1) : "0";
  const fpy = total > 0 ? ((perfeitas / total) * 100).toFixed(1) : "0";

  const tempoMedioMontagem = media(
    motos.filter((m) => m.inicio_montagem && m.fim_montagem).map((m) => differenceInMinutes(new Date(m.fim_montagem!), new Date(m.inicio_montagem!))),
  );
  const tempoMedioAvaria = media(
    histAv.filter((a) => a.data_resolucao).map((a) => differenceInHours(new Date(a.data_resolucao!), new Date(a.created_at))),
  );
  const tempoMedioPatio = media(
    motos.filter((m) => m.status === "estoque" && m.updated_at).map((m) => differenceInHours(new Date(), new Date(m.updated_at!))),
  );

  const prevTotal = prevMotos.length;
  const deltaProducao = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : 0;
  const deltaProdSinal = deltaProducao > 0 ? "up" : deltaProducao < 0 ? "down" : "same";

  const counts = {
    fila: motos.filter((m) => m.status === "aguardando_montagem").length,
    qa: motos.filter((m) => m.status === "em_analise").length,
    reparo: motos.filter((m) => m.status?.startsWith("avaria_")).length,
  };
  let gargalo = "Fluxo Estável";
  let gargaloNivel: Kpis["gargaloNivel"] = "ok";
  if (counts.fila > 20) { gargalo = "Acúmulo na Entrada"; gargaloNivel = "warn"; }
  if (counts.qa > 10) { gargalo = "Fila na Inspeção"; gargaloNivel = "warn"; }
  if (counts.reparo > 5) { gargalo = "Alto Índice Avarias"; gargaloNivel = "crit"; }

  return {
    totalEntrada: total, aprovadasDireto: perfeitas, aprovadasTotal, taxaRetrabalho, gargalo, gargaloNivel,
    tempoMedioMontagem, tempoMedioAvaria, tempoMedioPatio, fpy, deltaProducao, deltaProdSinal, expedidas: saidas.length,
  };
}

function calcularFunil(motos: MotoRel[]): EtapaFunil[] {
  const t = motos.length;
  const pct = (v: number) => (t > 0 ? `${Math.round((v / t) * 100)}%` : "0%");
  const montagem = motos.filter((m) => m.status !== "aguardando_montagem").length;
  const inspecao = motos.filter((m) => m.fim_montagem).length;
  const aprovadas = motos.filter(ehAprovada).length;
  return [
    { name: "Entrada", codigo: "E1", value: t, pct: "100%" },
    { name: "Montagem iniciada", codigo: "E2", value: montagem, pct: pct(montagem) },
    { name: "Chegaram à inspeção", codigo: "E3", value: inspecao, pct: pct(inspecao) },
    { name: "Aprovadas", codigo: "E4", value: aprovadas, pct: pct(aprovadas) },
  ];
}

function calcularAvarias(motos: MotoRel[]): Contagem[] {
  const mapa: Record<string, number> = {};
  motos.forEach((m) => {
    if (m.status?.startsWith("avaria_")) {
      const bruto = m.status.replace("avaria_", "");
      const tipo = bruto.charAt(0).toUpperCase() + bruto.slice(1);
      mapa[tipo] = (mapa[tipo] || 0) + 1;
    }
  });
  return Object.entries(mapa).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function calcularCores(motos: MotoRel[]): CombinacaoCor[] {
  const mapa: Record<string, CombinacaoCor> = {};
  motos.forEach((m) => {
    if (!m.cor) return;
    const banco = m.cor_banco || "Std";
    const key = `${m.cor} / ${banco}`;
    mapa[key] = mapa[key] || { cor: m.cor, banco, value: 0 };
    mapa[key].value++;
  });
  return Object.values(mapa).sort((a, b) => b.value - a.value).slice(0, 5);
}

function calcularMontadores(motos: MotoRel[], pausas: PausaRel[]): MontadorRel[] {
  const stats: Record<string, MontadorRel & { tempos: number[] }> = {};
  const idToNome: Record<string, string> = {};
  motos.forEach((m) => {
    if (!m.montador?.nome) return;
    const nome = m.montador.nome.split(" ")[0];
    if (m.montador_id) idToNome[m.montador_id] = nome;
    if (!stats[nome]) stats[nome] = { nome, total: 0, retrabalhos: 0, pausas: 0, tempoMedio: 0, tempos: [] };
    stats[nome].total++;
    if ((m.rework_count ?? 0) > 0) stats[nome].retrabalhos++;
    if (m.inicio_montagem && m.fim_montagem) stats[nome].tempos.push(differenceInMinutes(new Date(m.fim_montagem), new Date(m.inicio_montagem)));
  });
  pausas.forEach((p) => {
    const nome = p.montador_id ? idToNome[p.montador_id] : undefined;
    if (nome && stats[nome]) stats[nome].pausas++;
  });
  return Object.values(stats)
    .map(({ tempos, ...s }) => ({ ...s, tempoMedio: media(tempos) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
}

function calcularQA(motos: MotoRel[]): InspetorRel[] {
  const stats: Record<string, InspetorRel & { tempos: number[] }> = {};
  motos.forEach((m) => {
    if (!m.supervisor?.nome) return;
    const nome = m.supervisor.nome.split(" ")[0];
    if (!stats[nome]) stats[nome] = { nome, totalInspecionado: 0, aprovadas: 0, reprovadas: 0, tempoMedio: 0, taxaReprovacao: 0, tempos: [] };
    stats[nome].totalInspecionado++;
    if (ehAprovada(m)) stats[nome].aprovadas++;
    if ((m.rework_count ?? 0) > 0 || m.status?.startsWith("avaria_") || m.status === "retrabalho_montagem") stats[nome].reprovadas++;
    if (m.fim_montagem && m.updated_at && (["aprovado", "aguardando_etiqueta", "estoque", "retrabalho_montagem"].includes(m.status ?? "") || m.status?.startsWith("avaria_"))) {
      // Tempo do fim da montagem até a decisão da qualidade (ignora dados acima de 10 h)
      const gap = differenceInMinutes(new Date(m.updated_at), new Date(m.fim_montagem));
      if (gap > 0 && gap < 600) stats[nome].tempos.push(gap);
    }
  });
  return Object.values(stats)
    .map(({ tempos, ...s }) => ({
      ...s,
      tempoMedio: media(tempos),
      taxaReprovacao: s.totalInspecionado > 0 ? Math.round((s.reprovadas / s.totalInspecionado) * 100) : 0,
    }))
    .sort((a, b) => b.totalInspecionado - a.totalInspecionado);
}

function calcularLeadTime(motos: MotoRel[]): LeadTime {
  const filaMontagem: number[] = [];
  const filaQA: number[] = [];
  motos.forEach((m) => {
    if (m.created_at && m.inicio_montagem) filaMontagem.push(differenceInMinutes(new Date(m.inicio_montagem), new Date(m.created_at)));
    if (m.fim_montagem && m.updated_at && m.status !== "aguardando_montagem" && m.status !== "em_producao") {
      filaQA.push(differenceInMinutes(new Date(m.updated_at), new Date(m.fim_montagem)));
    }
  });
  return { esperaMontagem: media(filaMontagem), esperaQA: media(filaQA) };
}

function calcularModelos(motos: MotoRel[]): ModeloRel[] {
  const mapa: Record<string, ModeloRel> = {};
  motos.forEach((m) => {
    const mod = m.modelo || "Desconhecido";
    if (!mapa[mod]) mapa[mod] = { name: mod, total: 0, aprovadas: 0, avarias: 0, retrabalhos: 0 };
    mapa[mod].total++;
    if (ehAprovada(m)) mapa[mod].aprovadas++;
    if (m.status?.startsWith("avaria_")) mapa[mod].avarias++;
    if ((m.rework_count ?? 0) > 0) mapa[mod].retrabalhos++;
  });
  return Object.values(mapa).sort((a, b) => b.total - a.total);
}

function calcularHoras(motos: MotoRel[]): HoraRel[] {
  const horas = Array.from({ length: 24 }, (_, i) => ({ hora: `${String(i).padStart(2, "0")}h`, total: 0 }));
  motos.forEach((m) => {
    if (m.inicio_montagem) horas[new Date(m.inicio_montagem).getHours()].total++;
  });
  return horas.filter((h) => h.total > 0);
}

function calcularPausas(pausas: PausaRel[]): PausaResumo[] {
  // Duração real: a V2 registra o fim de cada pausa (pausas em andamento contam até agora)
  const motivos: Record<string, { value: number; minutos: number }> = {};
  pausas.forEach((p) => {
    const mot = p.motivo || "Não informado";
    const fim = p.fim ? new Date(p.fim).getTime() : Date.now();
    const minutos = p.inicio ? Math.max(0, Math.round((fim - new Date(p.inicio).getTime()) / 60000)) : 0;
    motivos[mot] = motivos[mot] || { value: 0, minutos: 0 };
    motivos[mot].value += 1;
    motivos[mot].minutos += minutos;
  });
  return Object.entries(motivos).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.minutos - a.minutos || b.value - a.value);
}

function gerarAlertas(motos: MotoRel[]): AlertaRel[] {
  const al: AlertaRel[] = [];
  const taxa = motos.length > 0 ? (motos.filter((m) => (m.rework_count ?? 0) > 0).length / motos.length) * 100 : 0;
  if (taxa > 15) al.push({ tipo: "warn", msg: `Taxa de retrabalho em ${taxa.toFixed(1)}% — acima do limite de 15%` });
  const modAvaria: Record<string, number> = {};
  motos.filter((m) => m.status?.startsWith("avaria_")).forEach((m) => {
    const mod = m.modelo || "Desconhecido";
    modAvaria[mod] = (modAvaria[mod] || 0) + 1;
  });
  Object.entries(modAvaria).forEach(([mod, count]) => {
    const totalMod = motos.filter((m) => (m.modelo || "Desconhecido") === mod).length;
    if (totalMod > 3 && count / totalMod > 0.3) al.push({ tipo: "crit", msg: `Modelo ${mod} com ${Math.round((count / totalMod) * 100)}% de avarias — investigar` });
  });
  const fpy = motos.length > 0 ? (motos.filter(ehPerfeita).length / motos.length) * 100 : 100;
  if (motos.length > 0 && fpy >= 95) al.push({ tipo: "ok", msg: `FPY em ${fpy.toFixed(1)}% — excelente qualidade.` });
  return al;
}

// ---------- Peças visuais dos gráficos ----------

interface ItemDica { name?: string | number; value?: number | string | Array<number | string>; color?: string; dataKey?: string | number }

/** Dica ao passar o mouse: tinta do tema, cor só no quadradinho de identificação. */
function DicaGrafico({ active, payload, label, unidade = "" }: { active?: boolean; payload?: ItemDica[]; label?: string | number; unidade?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {label !== undefined && <p className="mb-1.5 font-semibold">{label}</p>}
      <div className="space-y-1">
        {payload.map((p) => (
          <p key={String(p.dataKey)} className="flex items-center gap-2 text-muted-foreground">
            <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: p.color }} />
            <span className="flex-1">{p.name}</span>
            <span className="font-mono font-semibold text-foreground">{String(p.value)}{unidade}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

function Legenda({ itens }: { itens: { nome: string; cor: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {itens.map((i) => (
        <li key={i.nome} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[2px]" style={{ backgroundColor: i.cor }} />
          {i.nome}
        </li>
      ))}
    </ul>
  );
}

/** Linha de ranking com barra fina (tinta) proporcional ao maior valor. */
function LinhaRanking({ rotulo, valor, maximo, detalhe, prefixo }: { rotulo: React.ReactNode; valor: number; maximo: number; detalhe?: string; prefixo?: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2.5">
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium">{prefixo}<span className="truncate">{rotulo}</span></span>
      <span className="text-right font-mono text-sm font-semibold tabular-nums">{valor}</span>
      <span className="col-span-2 flex items-center gap-3">
        <span className="h-1.5 flex-1 overflow-hidden rounded-[1px] bg-foreground/10">
          <span className="block h-full rounded-[1px] bg-foreground/80" style={{ width: `${(valor / Math.max(1, maximo)) * 100}%` }} />
        </span>
        {detalhe && <span className="w-28 shrink-0 text-right text-xs text-sutil">{detalhe}</span>}
      </span>
    </li>
  );
}

const estiloEixo = (cor: string) => ({ fill: cor, fontSize: 11 });

// ---------- Página ----------

export default function RelatoriosPage() {
  const cores = useCoresGrafico();
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState("semana");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const [rawData, setRawData] = useState<MotoRel[]>([]);
  const [timelineData, setTimelineData] = useState<DiaProducao[]>([]);
  const [fpyData, setFpyData] = useState<DiaFPY[]>([]);
  const [funnelData, setFunnelData] = useState<EtapaFunil[]>([]);
  const [avariasData, setAvariasData] = useState<Contagem[]>([]);
  const [montadoresData, setMontadoresData] = useState<MontadorRel[]>([]);
  const [modelosData, setModelosData] = useState<ModeloRel[]>([]);
  const [horasData, setHorasData] = useState<HoraRel[]>([]);
  const [pausasResumo, setPausasResumo] = useState<PausaResumo[]>([]);
  const [solicitacoesPausa, setSolicitacoesPausa] = useState<SolicitacaoRel[]>([]);
  const [alertas, setAlertas] = useState<AlertaRel[]>([]);
  const [coresData, setCoresData] = useState<CombinacaoCor[]>([]);
  const [qaData, setQaData] = useState<InspetorRel[]>([]);
  const [leadTime, setLeadTime] = useState<LeadTime | null>(null);
  const [kpis, setKpis] = useState<Kpis>(KPIS_INICIAIS);
  const requisicao = useRef(0);

  const carregar = useCallback(async () => {
    const id = ++requisicao.current;
    setLoading(true);
    const agora = new Date();
    let dataInicio = new Date();
    if (periodo === "hoje") dataInicio.setHours(0, 0, 0, 0);
    else if (periodo === "semana") dataInicio = subDays(agora, 7);
    else if (periodo === "mes") dataInicio = startOfMonth(agora);
    else if (periodo === "custom" && customStart) dataInicio = new Date(customStart + "T00:00:00");
    else dataInicio = new Date(2023, 0, 1);
    const dataFim = periodo === "custom" && customEnd ? new Date(customEnd + "T23:59:59") : agora;
    const diff = dataFim.getTime() - dataInicio.getTime();
    const prevInicio = new Date(dataInicio.getTime() - diff);
    const prevFim = new Date(dataInicio.getTime());

    try {
      // allSettled: uma tabela com problema não impede o restante do relatório
      const results = await Promise.allSettled([
        // Em páginas: a API devolve no máximo 1.000 linhas por consulta
        buscarTodas<MotoRel>((de, ate) =>
          supabase.from("motos").select(`*, montador:funcionarios!motos_montador_id_fkey(nome), supervisor:funcionarios!motos_supervisor_id_fkey(nome)`)
            .gte("created_at", dataInicio.toISOString()).lte("created_at", dataFim.toISOString())
            .order("created_at", { ascending: true }).order("id", { ascending: true }).range(de, ate),
        ).then((data) => ({ data })),
        supabase.from("pausas_producao").select("*").gte("inicio", dataInicio.toISOString()),
        supabase.from("historico_avarias").select("*").gte("created_at", dataInicio.toISOString()),
        supabase.from("solicitacoes_pausa").select("*").gte("created_at", dataInicio.toISOString()),
        supabase.from("motos").select("id", { count: "exact" }).gte("created_at", prevInicio.toISOString()).lt("created_at", prevFim.toISOString()),
        supabase.from("logs_sistema").select("referencia, created_at").eq("acao", "SAIDA_ESTOQUE").gte("created_at", dataInicio.toISOString()),
      ]);
      if (id !== requisicao.current) return;

      const extrair = <T,>(r: PromiseSettledResult<{ data: unknown }>): T[] =>
        r.status === "fulfilled" && Array.isArray(r.value?.data) ? (r.value.data as T[]) : [];
      const motos = extrair<MotoRel>(results[0]);
      const pausas = extrair<PausaRel>(results[1] as PromiseSettledResult<{ data: unknown }>);
      const histAv = extrair<AvariaRel>(results[2] as PromiseSettledResult<{ data: unknown }>);
      const solPausa = extrair<SolicitacaoRel>(results[3] as PromiseSettledResult<{ data: unknown }>);
      const prevMotos = extrair<MotoPeriodoAnterior>(results[4] as PromiseSettledResult<{ data: unknown }>);
      const saidas = extrair<SaidaRel>(results[5] as PromiseSettledResult<{ data: unknown }>);

      setRawData(motos);
      setSolicitacoesPausa(solPausa);
      setTimelineData(calcularTimeline(motos, dataInicio, periodo, dataFim));
      setFpyData(calcularFPY(motos));
      setFunnelData(calcularFunil(motos));
      setAvariasData(calcularAvarias(motos));
      setMontadoresData(calcularMontadores(motos, pausas));
      setModelosData(calcularModelos(motos));
      setHorasData(calcularHoras(motos));
      setPausasResumo(calcularPausas(pausas));
      setCoresData(calcularCores(motos));
      setQaData(calcularQA(motos));
      setLeadTime(calcularLeadTime(motos));
      setKpis(calcularKPIs(motos, histAv, prevMotos, saidas));
      setAlertas(gerarAlertas(motos));
    } catch (error) {
      console.error(error);
      toast.error("Erro ao carregar dados.");
    } finally {
      if (id === requisicao.current) setLoading(false);
    }
  }, [periodo, customStart, customEnd]);

  useEffect(() => {
    const t = setTimeout(carregar, 0);
    return () => clearTimeout(t);
  }, [carregar]);

  const handleExportExcel = async () => {
    if (rawData.length === 0) return toast.warning("Sem dados.");
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();

    const sheet1 = workbook.addWorksheet("Dados");
    sheet1.columns = [
      { header: "Data", key: "data", width: 14 }, { header: "Chassi", key: "sku", width: 22 },
      { header: "Modelo", key: "modelo", width: 20 }, { header: "Montador", key: "montador", width: 18 },
      { header: "Cor", key: "cor", width: 12 }, { header: "Status", key: "status", width: 18 },
      { header: "Retrabalhos", key: "rework", width: 12 }, { header: "Tempo (min)", key: "tempo", width: 12 },
      { header: "Obs", key: "obs", width: 35 },
    ];
    sheet1.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet1.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF121315" } };
    rawData.forEach((m) => {
      const tempo = m.inicio_montagem && m.fim_montagem ? differenceInMinutes(new Date(m.fim_montagem), new Date(m.inicio_montagem)) : "-";
      sheet1.addRow({
        data: format(new Date(m.created_at), "dd/MM/yyyy HH:mm"), sku: m.sku, modelo: m.modelo, montador: m.montador?.nome || "-",
        cor: m.cor || "-", status: m.status, rework: m.rework_count || 0, tempo, obs: m.detalhes_avaria || m.observacoes || "",
      });
    });

    const sheet2 = workbook.addWorksheet("KPIs");
    sheet2.columns = [{ header: "Indicador", key: "ind", width: 30 }, { header: "Valor", key: "val", width: 20 }];
    sheet2.getRow(1).font = { bold: true };
    ([
      ["Total Entrada", kpis.totalEntrada], ["Aprovadas 1ª Tentativa", kpis.aprovadasDireto], ["Total Aprovadas", kpis.aprovadasTotal],
      ["Taxa Retrabalho", `${kpis.taxaRetrabalho}%`], ["FPY", `${kpis.fpy}%`], ["Tempo Médio Montagem", `${kpis.tempoMedioMontagem} min`],
      ["Tempo Médio Resolução Avaria", `${kpis.tempoMedioAvaria}h`], ["Expedidas no período", kpis.expedidas], ["Status Fluxo", kpis.gargalo],
    ] as [string, string | number][]).forEach(([ind, val]) => sheet2.addRow({ ind, val }));

    const sheet3 = workbook.addWorksheet("Por Modelo");
    sheet3.columns = [
      { header: "Modelo", key: "name", width: 25 }, { header: "Total", key: "total", width: 10 }, { header: "Aprovadas", key: "aprovadas", width: 12 },
      { header: "Avarias", key: "avarias", width: 10 }, { header: "Retrabalhos", key: "retrabalhos", width: 12 },
    ];
    sheet3.getRow(1).font = { bold: true };
    modelosData.forEach((m) => sheet3.addRow(m));

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SGM_Relatorio_${format(new Date(), "dd-MM-yyyy")}.xlsx`;
    a.click();
    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    toast.success("Relatório exportado!");
  };

  const tomGargalo = kpis.gargaloNivel === "ok" ? "sucesso" : kpis.gargaloNivel === "warn" ? "alerta" : "perigo";
  const series = [
    { chave: "perfeitas", nome: "Aprovada direto", cor: cores.aprovado },
    { chave: "retrabalhos", nome: "Com retrabalho ou reparo", cor: cores.retrabalho },
    { chave: "emAndamento", nome: "Em andamento", cor: cores.andamento },
    { chave: "avarias", nome: "Com avaria", cor: cores.avaria },
  ] as const;
  const maxCores = Math.max(1, ...coresData.map((c) => c.value));
  const maxAvarias = Math.max(1, ...avariasData.map((a) => a.value));
  const maxPausasQtd = Math.max(1, ...pausasResumo.map((p) => p.value));
  const maxPausasMin = Math.max(1, ...pausasResumo.map((p) => p.minutos));
  const maxFunil = Math.max(1, ...funnelData.map((f) => f.value));
  const totalAvarias = avariasData.reduce((a, b) => a + b.value, 0);

  return (
      <div className="space-y-6 pb-20 print:p-0">
        <PageHeader
          titulo="Relatórios"
          descricao={<>Volume, qualidade e eficiência da linha no período. Aprovadas incluem as motos aguardando etiqueta.{loading && <Loader2 className="ml-2 inline size-4 animate-spin" aria-label="Carregando" />}</>}
          acoes={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-md border bg-card p-0.5" role="radiogroup" aria-label="Período">
                {PERIODOS.map((p) => (
                  <button
                    key={p.valor}
                    type="button"
                    role="radio"
                    aria-checked={periodo === p.valor}
                    onClick={() => setPeriodo(p.valor)}
                    className={cn(
                      "h-8 rounded-sm px-2.5 font-rotulo text-[13px] font-semibold uppercase tracking-[0.04em] transition-colors",
                      periodo === p.valor ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p.rotulo}
                  </button>
                ))}
              </div>
              {periodo === "custom" && (
                <div className="flex gap-2">
                  <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-9 w-[150px] bg-card" aria-label="Data inicial" />
                  <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-9 w-[150px] bg-card" aria-label="Data final" />
                </div>
              )}
              <Button onClick={handleExportExcel} variant="outline" size="sm" className="gap-1.5"><FileSpreadsheet className="size-3.5" /> Excel</Button>
              <Button onClick={() => window.print()} variant="outline" size="sm" className="gap-1.5"><Printer className="size-3.5" /> Imprimir</Button>
            </div>
          }
        />

        {alertas.length > 0 && (
          <ul className="space-y-2 print:hidden">
            {alertas.map((a, i) => {
              const Icone = a.tipo === "ok" ? CheckCircle2 : a.tipo === "crit" ? OctagonAlert : TriangleAlert;
              return (
                <li
                  key={i}
                  className={cn(
                    "flex items-center gap-3 rounded-md border border-l-[3px] bg-card px-3.5 py-2.5 text-sm font-medium",
                    a.tipo === "ok" ? "border-l-success" : a.tipo === "crit" ? "border-l-destructive" : "border-l-warning",
                  )}
                >
                  <Icone className={cn("size-4 shrink-0", a.tipo === "ok" ? "text-success" : a.tipo === "crit" ? "text-destructive" : "text-warning")} aria-hidden />
                  {a.msg}
                </li>
              );
            })}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            rotulo="Entradas (CD)"
            valor={kpis.totalEntrada}
            icone={Activity}
            carregando={loading}
            dica={kpis.deltaProdSinal === "same" ? "igual ao período anterior" : (
              <span className="flex items-center gap-1">
                {kpis.deltaProdSinal === "up" ? <ArrowUpRight className="size-3.5 text-success" /> : <ArrowDownRight className="size-3.5 text-destructive" />}
                {Math.abs(kpis.deltaProducao)}% vs período anterior
              </span>
            )}
          />
          <StatCard rotulo="FPY · 1ª passagem" valor={`${kpis.fpy}%`} icone={Target} carregando={loading} dica={`${kpis.aprovadasDireto} de ${kpis.totalEntrada} sem retrabalho nem avaria`} />
          <StatCard rotulo="Taxa de retrabalho" valor={`${kpis.taxaRetrabalho}%`} icone={TriangleAlert} tom={Number(kpis.taxaRetrabalho) > 15 ? "alerta" : "neutro"} destacar={Number(kpis.taxaRetrabalho) > 15} carregando={loading} dica="Limite de alerta: 15%" />
          <StatCard rotulo="Situação do fluxo" valor={<span className="text-xl">{kpis.gargalo}</span>} icone={Workflow} tom={tomGargalo} destacar={kpis.gargaloNivel !== "ok"} carregando={loading} />
          <StatCard rotulo="Tempo médio de montagem" valor={`${kpis.tempoMedioMontagem} min`} icone={Timer} carregando={loading} />
          <StatCard rotulo="Resolução de avaria" valor={`${kpis.tempoMedioAvaria} h`} icone={Wrench} carregando={loading} dica="Média entre o registro e o reparo" />
          <StatCard rotulo="Aprovadas" valor={kpis.aprovadasTotal} icone={CheckCircle2} carregando={loading} />
          <StatCard rotulo="Tempo no pátio" valor={`${kpis.tempoMedioPatio} h`} icone={Warehouse} carregando={loading} dica={`${kpis.expedidas} expedida(s) no período`} />
        </div>

        <Dica titulo="Como ler os relatórios">
          O período vale para tudo nesta tela. <strong className="font-semibold text-foreground">FPY</strong> (first pass yield) é a parcela de motos aprovadas
          sem nenhum retrabalho ou reparo. Passe o mouse sobre as barras para ver os números de cada dia, hora ou pessoa.
        </Dica>

        <Tabs defaultValue="evolucao" className="w-full">
          <TabsList className="h-auto w-full flex-wrap justify-start sm:w-fit">
            <TabsTrigger value="evolucao">Evolução</TabsTrigger>
            <TabsTrigger value="equipe">Equipe</TabsTrigger>
            <TabsTrigger value="modelos">Modelos</TabsTrigger>
            <TabsTrigger value="avarias">Avarias</TabsTrigger>
            <TabsTrigger value="pausas">Pausas</TabsTrigger>
            <TabsTrigger value="funil">Funil</TabsTrigger>
          </TabsList>

          {/* Evolução */}
          <TabsContent value="evolucao" className="mt-4 space-y-6">
            <Painel titulo="Desfecho das motos por dia de entrada" icone={Activity} acoes={<Legenda itens={series.map((s) => ({ nome: s.nome, cor: s.cor }))} />}>
              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timelineData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="30%">
                    <CartesianGrid vertical={false} stroke={cores.grade} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={estiloEixo(cores.sutil)} dy={6} />
                    <YAxis axisLine={false} tickLine={false} tick={estiloEixo(cores.sutil)} allowDecimals={false} />
                    <Tooltip cursor={{ fill: cores.grade, opacity: 0.4 }} content={<DicaGrafico />} />
                    {series.map((s, i) => (
                      <Bar
                        key={s.chave}
                        dataKey={s.chave}
                        name={s.nome}
                        stackId="a"
                        fill={s.cor}
                        stroke={cores.superficie}
                        strokeWidth={1.5}
                        maxBarSize={28}
                        radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-sutil">Cada barra é o total de motos que entraram no dia, dividido pelo que aconteceu com elas até agora.</p>
            </Painel>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Painel titulo="FPY por dia" icone={Target} meta={`Linha tracejada: meta de ${META_FPY}%`}>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fpyData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                      <CartesianGrid vertical={false} stroke={cores.grade} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={estiloEixo(cores.sutil)} />
                      <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={estiloEixo(cores.sutil)} unit="%" />
                      <Tooltip cursor={{ fill: cores.grade, opacity: 0.4 }} content={<DicaGrafico unidade="%" />} />
                      <ReferenceLine y={META_FPY} stroke={cores.tinta} strokeDasharray="4 4" strokeWidth={1.5} />
                      <Bar dataKey="fpy" name="FPY" fill={cores.serie1} maxBarSize={28} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Painel>

              <Painel titulo="Montagens iniciadas por hora" icone={Clock} meta="Horários de pico no período">
                <div className="h-[260px]">
                  {horasData.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma montagem iniciada no período.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={horasData} margin={{ top: 16, right: 8, bottom: 0, left: -12 }}>
                        <CartesianGrid vertical={false} stroke={cores.grade} />
                        <XAxis dataKey="hora" axisLine={false} tickLine={false} tick={estiloEixo(cores.sutil)} />
                        <YAxis axisLine={false} tickLine={false} tick={estiloEixo(cores.sutil)} allowDecimals={false} />
                        <Tooltip cursor={{ fill: cores.grade, opacity: 0.4 }} content={<DicaGrafico />} />
                        <Bar dataKey="total" name="Montagens" fill={cores.serie1} maxBarSize={24} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Painel>
            </div>
          </TabsContent>

          {/* Equipe */}
          <TabsContent value="equipe" className="mt-4 space-y-6">
            <Painel
              titulo="Produtividade de montagem"
              codigo="E2"
              meta="10 montadores com mais motos no período"
              acoes={<Legenda itens={[{ nome: "Montadas", cor: cores.serie1 }, { nome: "Com retrabalho", cor: cores.serie2 }]} />}
            >
              {montadoresData.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma montagem no período.</p>
              ) : (
                <div style={{ height: Math.max(220, montadoresData.length * 52) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={montadoresData} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 8 }} barGap={2}>
                      <CartesianGrid horizontal={false} stroke={cores.grade} />
                      <XAxis type="number" hide allowDecimals={false} />
                      <YAxis dataKey="nome" type="category" width={96} axisLine={false} tickLine={false} tick={{ fill: cores.tinta, fontSize: 12 }} />
                      <Tooltip
                        cursor={{ fill: cores.grade, opacity: 0.4 }}
                        content={({ active, payload }) => {
                          const d = active && payload?.[0] ? (payload[0].payload as MontadorRel) : null;
                          if (!d) return null;
                          return (
                            <div className="min-w-40 space-y-1 rounded-md border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">
                              <p className="font-semibold text-foreground">{d.nome}</p>
                              <p>Montagens: <span className="font-mono font-semibold text-foreground">{d.total}</span></p>
                              <p>Com retrabalho: <span className="font-mono font-semibold text-foreground">{d.retrabalhos}</span></p>
                              <p>Tempo médio: <span className="font-mono font-semibold text-foreground">{d.tempoMedio} min</span></p>
                              <p>Pausas: <span className="font-mono font-semibold text-foreground">{d.pausas}</span></p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="total" name="Montadas" fill={cores.serie1} maxBarSize={16} radius={[0, 4, 4, 0]}>
                        <LabelList dataKey="total" position="right" fontSize={11} fill={cores.tinta} />
                      </Bar>
                      <Bar dataKey="retrabalhos" name="Com retrabalho" fill={cores.serie2} maxBarSize={16} radius={[0, 4, 4, 0]}>
                        <LabelList dataKey="retrabalhos" position="right" fontSize={11} fill={cores.tinta} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Painel>

            <Painel titulo="Inspeção de qualidade" codigo="E3" meta="Desempenho de quem decidiu na inspeção" semRecuo>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      {["Inspetor", "Inspecionadas", "Aprovadas", "Reprovadas", "Tempo até decidir", "Taxa de reprovação"].map((c, i) => (
                        <th key={c} scope="col" className={cn("rotulo px-4 py-2.5 font-semibold text-sutil", i > 0 && "text-right")}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {qaData.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Nenhuma inspeção no período.</td></tr>
                    )}
                    {qaData.map((q) => (
                      <tr key={q.nome}>
                        <td className="px-4 py-2.5 font-semibold">{q.nome}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{q.totalInspecionado}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{q.aprovadas}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{q.reprovadas}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{q.tempoMedio} min</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                            {q.taxaReprovacao > 20 && <Led estado="atencao" className="size-2" />}
                            {q.taxaReprovacao}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Painel>
          </TabsContent>

          {/* Modelos */}
          <TabsContent value="modelos" className="mt-4 space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Painel titulo="Resumo por modelo" semRecuo className="lg:col-span-2">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        {["Modelo", "Entradas", "Aprovadas", "Com retrabalho", "Em avaria", "Taxa de avaria"].map((c, i) => (
                          <th key={c} scope="col" className={cn("rotulo px-4 py-2.5 font-semibold text-sutil", i > 0 && "text-right")}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {modelosData.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Nenhuma moto no período.</td></tr>
                      )}
                      {modelosData.map((m) => {
                        const taxa = m.total > 0 ? Math.round((m.avarias / m.total) * 100) : 0;
                        return (
                          <tr key={m.name}>
                            <td className="px-4 py-2.5">
                              <p className="font-semibold">{m.name}</p>
                              <span className="mt-1 block h-1 overflow-hidden rounded-[1px] bg-foreground/10">
                                <span className="block h-full bg-foreground/70" style={{ width: `${(m.total / Math.max(1, modelosData[0]?.total ?? 1)) * 100}%` }} />
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums">{m.total}</td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums">{m.aprovadas}</td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums">{m.retrabalhos}</td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums">{m.avarias}</td>
                            <td className="px-4 py-2.5 text-right">
                              <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                                {taxa > 10 && <Led estado="critico" className="size-2" />}
                                {taxa}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="border-t px-4 py-2.5 text-xs text-sutil">
                  As colunas podem se sobrepor: uma moto aprovada que passou por retrabalho conta nas duas.
                </p>
              </Painel>

              <Painel titulo="Combinações de cor mais montadas" meta="Carenagem / banco">
                {coresData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma cor registrada no período.</p>
                ) : (
                  <ol className="divide-y">
                    {coresData.map((c) => (
                      <LinhaRanking
                        key={`${c.cor}/${c.banco}`}
                        rotulo={`${c.cor} / ${c.banco}`}
                        valor={c.value}
                        maximo={maxCores}
                        prefixo={
                          <span aria-hidden className="flex shrink-0 overflow-hidden rounded-[2px] border border-foreground/25">
                            <span className="size-4" style={{ backgroundColor: getHexColor(c.cor) }} />
                            <span className="h-4 w-2" style={{ backgroundColor: getHexColor(c.banco) }} />
                          </span>
                        }
                      />
                    ))}
                  </ol>
                )}
              </Painel>
            </div>
          </TabsContent>

          {/* Avarias */}
          <TabsContent value="avarias" className="mt-4">
            <Painel titulo="Motos em avaria por tipo de defeito" codigo="AV" meta="Motos do período que estão no pátio de avarias">
              {avariasData.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma moto do período está em avaria.</p>
              ) : (
                <ol className="divide-y">
                  {avariasData.map((a, i) => (
                    <LinhaRanking
                      key={a.name}
                      rotulo={a.name}
                      valor={a.value}
                      maximo={maxAvarias}
                      detalhe={rawData.length > 0 ? `${((a.value / rawData.length) * 100).toFixed(1)}% das entradas` : undefined}
                      prefixo={<span className="flex h-5 min-w-7 items-center justify-center rounded-sm border font-mono text-[11px] text-muted-foreground">{i + 1}º</span>}
                    />
                  ))}
                </ol>
              )}
              {totalAvarias > 0 && <p className="mt-3 text-xs text-sutil">Total: {totalAvarias} moto(s). Reparadas não aparecem aqui — veja o tempo de resolução nos indicadores.</p>}
            </Painel>
          </TabsContent>

          {/* Pausas */}
          <TabsContent value="pausas" className="mt-4 space-y-6">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <StatCard rotulo="Pausas registradas" valor={pausasResumo.reduce((a, b) => a + b.value, 0)} icone={PauseCircle} carregando={loading} />
              <StatCard
                rotulo="Pedidos negados"
                valor={solicitacoesPausa.filter((s) => s.status === "rejeitado" || s.status === "rejeitada").length}
                carregando={loading}
                dica={`de ${solicitacoesPausa.length} pedido(s)`}
              />
              <StatCard
                rotulo="Tempo total parado"
                valor={formatarDuracaoMin(pausasResumo.reduce((a, b) => a + (b.minutos || 0), 0))}
                icone={Clock}
                carregando={loading}
                dica={`${pausasResumo.length} motivo(s) diferente(s)`}
              />
            </div>
            <Painel titulo="Pausas por motivo" codigo="E2" meta="Quantidade e tempo parado lado a lado, cada um na sua escala" semRecuo>
              {pausasResumo.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Nenhuma pausa no período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th scope="col" className="rotulo px-4 py-2.5 font-semibold text-sutil">Motivo</th>
                        <th scope="col" className="rotulo w-[32%] px-4 py-2.5 font-semibold text-sutil">Ocorrências</th>
                        <th scope="col" className="rotulo w-[32%] px-4 py-2.5 font-semibold text-sutil">Tempo parado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {pausasResumo.map((p) => (
                        <tr key={p.name}>
                          <td className="px-4 py-2.5 font-medium">{p.name}</td>
                          <td className="px-4 py-2.5">
                            <span className="flex items-center gap-2">
                              <span className="h-1.5 flex-1 overflow-hidden rounded-[1px] bg-foreground/10">
                                <span className="block h-full bg-foreground/80" style={{ width: `${(p.value / maxPausasQtd) * 100}%` }} />
                              </span>
                              <span className="w-10 text-right font-mono tabular-nums">{p.value}</span>
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="flex items-center gap-2">
                              <span className="h-1.5 flex-1 overflow-hidden rounded-[1px] bg-foreground/10">
                                <span className="block h-full bg-foreground/80" style={{ width: `${(p.minutos / maxPausasMin) * 100}%` }} />
                              </span>
                              <span className="w-20 text-right font-mono tabular-nums">{formatarDuracaoMin(p.minutos)}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Painel>
          </TabsContent>

          {/* Funil */}
          <TabsContent value="funil" className="mt-4">
            <Painel titulo="Conversão entre etapas" icone={Workflow} meta="Das motos que entraram no período, quantas chegaram a cada etapa">
              <ol className="space-y-2">
                {funnelData.map((f, i) => (
                  <li key={f.name}>
                    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[auto_12rem_minmax(0,1fr)]">
                      <span className="codigo-estacao">{f.codigo}</span>
                      <span className="text-sm font-medium">{f.name}</span>
                      <span className="col-span-2 flex items-center gap-3 sm:col-span-1">
                        <span className="h-7 flex-1 overflow-hidden rounded-[2px] bg-foreground/[0.06]">
                          <span className="block h-full rounded-[2px]" style={{ width: `${(f.value / maxFunil) * 100}%`, backgroundColor: cores.etapas[i] ?? cores.serie1 }} />
                        </span>
                        <span className="w-24 shrink-0 text-right">
                          <span className="font-mono text-sm font-semibold tabular-nums">{f.value}</span>
                          <span className="ml-1.5 text-xs text-sutil">{f.pct}</span>
                        </span>
                      </span>
                    </div>
                    {i === 0 && (leadTime?.esperaMontagem ?? 0) > 0 && (
                      <p className="ml-11 mt-1 flex items-center gap-1.5 text-xs text-sutil"><Clock className="size-3" /> espera média na fila de montagem: {formatarDuracaoMin(leadTime!.esperaMontagem)}</p>
                    )}
                    {i === 2 && (leadTime?.esperaQA ?? 0) > 0 && (
                      <p className="ml-11 mt-1 flex items-center gap-1.5 text-xs text-sutil"><Clock className="size-3" /> espera média até a decisão da qualidade: {formatarDuracaoMin(leadTime!.esperaQA)}</p>
                    )}
                  </li>
                ))}
              </ol>
            </Painel>
          </TabsContent>
        </Tabs>
      </div>
  );
}
