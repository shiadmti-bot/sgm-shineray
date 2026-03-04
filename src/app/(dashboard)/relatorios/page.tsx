"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, FunnelChart, Funnel, LabelList, ComposedChart, Line, RadialBarChart, RadialBar
} from "recharts";
import {
  Calendar, FileSpreadsheet, CheckCircle2, TrendingUp, TrendingDown, AlertTriangle, Activity,
  Clock, Timer, Target, Wrench, PauseCircle, Zap, Printer, ArrowUpRight, ArrowDownRight, Package, Warehouse, ArrowRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import ExcelJS from 'exceljs';
import { format, subDays, differenceInMinutes, differenceInHours, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

const COLORS = {
  queue: "#94a3b8", prod: "#3b82f6", analise: "#8b5cf6",
  ok: "#22c55e", avaria: "#ef4444", warning: "#f59e0b",
  pause: "#8b5cf6", line: "#64748b", em_andamento: "#0ea5e9"
};
const PIE_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16", "#06b6d4"];

export default function RelatoriosPage() {
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState("semana");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const [rawData, setRawData] = useState<any[]>([]);
  const [timelineData, setTimelineData] = useState<any[]>([]);
  const [funnelData, setFunnelData] = useState<any[]>([]);
  const [avariasData, setAvariasData] = useState<any[]>([]);
  const [tecnicosData, setTecnicosData] = useState<any[]>([]);
  const [modelosData, setModelosData] = useState<any[]>([]);
  const [horasData, setHorasData] = useState<any[]>([]);
  const [pausasResumo, setPausasResumo] = useState<any[]>([]);
  const [avariasHistorico, setAvariasHistorico] = useState<any[]>([]);
  const [solicitacoesPausa, setSolicitacoesPausa] = useState<any[]>([]);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [fypTimeline, setFypTimeline] = useState<any[]>([]);

  // Novas métricas (Parte 2)
  const [coresData, setCoresData] = useState<any[]>([]);
  const [qaData, setQaData] = useState<any[]>([]);
  const [funnelLeadTimeData, setFunnelLeadTimeData] = useState<any>(null);
  const [kpis, setKpis] = useState({
    totalEntrada: 0, aprovadasDireto: 0, aprovadasTotal: 0,
    taxaRetrabalho: "0", gargalo: "Fluxo Estável", gargaloNivel: "ok" as "ok"|"warn"|"crit",
    tempoMedioMontagem: 0, tempoMedioAvaria: 0, tempoMedioPatio: 0, fpy: "0",
    deltaProducao: 0, deltaProdSinal: "up" as "up"|"down"|"same"
  });

  useEffect(() => { fetchDados(); }, [periodo, customStart, customEnd]);

  function getDateRange() {
    const agora = new Date();
    let dataInicio = new Date();
    if (periodo === 'hoje') { dataInicio.setHours(0, 0, 0, 0); }
    else if (periodo === 'semana') { dataInicio = subDays(agora, 7); }
    else if (periodo === 'mes') { dataInicio = startOfMonth(agora); }
    else if (periodo === 'custom' && customStart) { dataInicio = new Date(customStart + 'T00:00:00'); }
    else { dataInicio = new Date(2023, 0, 1); }
    const dataFim = periodo === 'custom' && customEnd ? new Date(customEnd + 'T23:59:59') : agora;
    return { dataInicio, dataFim };
  }

  function getPreviousPeriodRange(dataInicio: Date, dataFim: Date) {
    const diff = dataFim.getTime() - dataInicio.getTime();
    return { prevInicio: new Date(dataInicio.getTime() - diff), prevFim: new Date(dataInicio.getTime()) };
  }

  async function fetchDados() {
    setLoading(true);
    const { dataInicio, dataFim } = getDateRange();
    const { prevInicio, prevFim } = getPreviousPeriodRange(dataInicio, dataFim);

    try {
      // Use allSettled so a failing table (e.g. historico_avarias) doesn't block the page
      const results = await Promise.allSettled([
        supabase.from('motos').select(`*, montador:funcionarios!motos_montador_id_fkey(nome), supervisor:funcionarios!motos_supervisor_id_fkey(nome)`)
          .gte('created_at', dataInicio.toISOString()).lte('created_at', dataFim.toISOString()).order('created_at', { ascending: true }),
        supabase.from('pausas_producao').select('*').gte('inicio', dataInicio.toISOString()),
        supabase.from('historico_avarias').select('*').gte('created_at', dataInicio.toISOString()),
        supabase.from('solicitacoes_pausa').select('*').gte('created_at', dataInicio.toISOString()),
        supabase.from('motos').select('id, status, rework_count', { count: 'exact' })
          .gte('created_at', prevInicio.toISOString()).lt('created_at', prevFim.toISOString()),
        supabase.from('logs_sistema').select('referencia, created_at')
          .eq('acao', 'SAIDA_ESTOQUE')
          .gte('created_at', dataInicio.toISOString())
      ]);

      const extract = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? (r.value?.data || []) : [];
      const motos = extract(results[0]);
      const pausas = extract(results[1]);
      const histAv = extract(results[2]);
      const solPausa = extract(results[3]);
      const prevMotos = extract(results[4]);
      const logsSaida = extract(results[5]);

      setRawData(motos);
      setAvariasHistorico(histAv);
      setSolicitacoesPausa(solPausa);

      processarTimeline(motos, dataInicio, periodo);
      processarFunil(motos);
      processarAvarias(motos);
      processarTecnicos(motos, pausas);
      processarModelos(motos);
      processarHorasPico(motos);
      processarPausas(pausas, solPausa, motos);
      processarFPYTimeline(motos, dataInicio);
      processarCores(motos);
      processarQA(motos);
      processarLeadTime(motos);
      calcularKPIs(motos, histAv, prevMotos, logsSaida);
      gerarAlertas(motos, histAv);

    } catch (error) {
      console.error(error);
      toast.error("Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  function processarTimeline(motos: any[], inicio: Date, tipoPeriodo: string) {
    const mapa: Record<string, any> = {};
    if (tipoPeriodo !== 'hoje') {
      let curr = new Date(inicio);
      const end = new Date();
      while (curr <= end) {
        const key = format(curr, 'dd/MM');
        mapa[key] = { name: key, perfeitas: 0, retrabalhos: 0, avarias: 0, emAndamento: 0, total: 0 };
        curr.setDate(curr.getDate() + 1);
      }
    }
    motos.forEach(m => {
      const dataKey = format(new Date(m.created_at), 'dd/MM');
      if (!mapa[dataKey]) mapa[dataKey] = { name: dataKey, perfeitas: 0, retrabalhos: 0, avarias: 0, emAndamento: 0, total: 0 };
      mapa[dataKey].total++;
      if (m.status?.includes('avaria')) mapa[dataKey].avarias++;
      else if (m.rework_count > 0 || m.status === 'retrabalho_montagem') mapa[dataKey].retrabalhos++;
      else if (m.status === 'aprovado') mapa[dataKey].perfeitas++;
      else mapa[dataKey].emAndamento++;
    });
    setTimelineData(Object.values(mapa));
  }

  function processarFPYTimeline(motos: any[], inicio: Date) {
    const mapa: Record<string, { total: number; perfeitas: number }> = {};
    motos.forEach(m => {
      const key = format(new Date(m.created_at), 'dd/MM');
      if (!mapa[key]) mapa[key] = { total: 0, perfeitas: 0 };
      mapa[key].total++;
      if (m.status === 'aprovado' && (!m.rework_count || m.rework_count === 0)) mapa[key].perfeitas++;
    });
    setFypTimeline(Object.entries(mapa).map(([name, v]) => ({
      name, fpy: v.total > 0 ? Math.round((v.perfeitas / v.total) * 100) : 0, meta: 90
    })));
  }

  function calcularKPIs(motos: any[], histAv: any[], prevMotos: any[], logsSaida: any[]) {
    const total = motos.length;
    const aprovadasTotal = motos.filter(m => m.status === 'aprovado').length;
    const perfeitas = motos.filter(m => m.status === 'aprovado' && (!m.rework_count || m.rework_count === 0)).length;
    const comRetrabalho = motos.filter(m => m.rework_count > 0 || m.status === 'retrabalho_montagem').length;
    const taxaRetrabalho = total > 0 ? ((comRetrabalho / total) * 100).toFixed(1) : "0";
    const fpy = total > 0 ? ((perfeitas / total) * 100).toFixed(1) : "0";

    // Tempo médio de montagem
    const comTempo = motos.filter(m => m.inicio_montagem && m.fim_montagem);
    const tempoMedioMontagem = comTempo.length > 0
      ? Math.round(comTempo.reduce((acc, m) => acc + differenceInMinutes(new Date(m.fim_montagem), new Date(m.inicio_montagem)), 0) / comTempo.length)
      : 0;

    // Tempo médio resolução avaria
    const resolvidas = histAv.filter((a: any) => a.data_resolucao);
    const tempoMedioAvaria = resolvidas.length > 0
      ? Math.round(resolvidas.reduce((acc: number, a: any) => acc + differenceInHours(new Date(a.data_resolucao), new Date(a.created_at)), 0) / resolvidas.length)
      : 0;

    // Tempo médio de pátio (Estoque -> Expedido)
    const emEstoque = motos.filter(m => m.status === 'estoque' && m.updated_at);
    const tempoMedioPatio = emEstoque.length > 0 
      ? Math.round(emEstoque.reduce((acc, m) => acc + differenceInHours(new Date(), new Date(m.updated_at)), 0) / emEstoque.length) 
      : 0;

    // Delta vs período anterior
    const prevTotal = prevMotos.length;
    const deltaProducao = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : 0;
    const deltaProdSinal = deltaProducao > 0 ? "up" : deltaProducao < 0 ? "down" : "same";

    // Gargalo com nível
    const counts = {
      fila: motos.filter(m => m.status === 'aguardando_montagem').length,
      qa: motos.filter(m => m.status === 'em_analise').length,
      reparo: motos.filter(m => m.status?.startsWith('avaria_')).length
    };
    let gargalo = "Fluxo Estável"; let gargaloNivel: "ok"|"warn"|"crit" = "ok";
    if (counts.fila > 20) { gargalo = "Acúmulo na Entrada"; gargaloNivel = "warn"; }
    if (counts.qa > 10) { gargalo = "Fila na Inspeção"; gargaloNivel = "warn"; }
    if (counts.reparo > 5) { gargalo = "Alto Índice Avarias"; gargaloNivel = "crit"; }

    setKpis({ totalEntrada: total, aprovadasDireto: perfeitas, aprovadasTotal, taxaRetrabalho, gargalo, gargaloNivel, tempoMedioMontagem, tempoMedioAvaria, tempoMedioPatio, fpy, deltaProducao, deltaProdSinal });
  }

  function processarFunil(motos: any[]) {
    const t = motos.length;
    const montagem = motos.filter(m => m.status !== 'aguardando_montagem').length;
    const inspecao = motos.filter(m => ['em_analise', 'aprovado'].includes(m.status)).length;
    const aprovadas = motos.filter(m => m.status === 'aprovado').length;
    setFunnelData([
      { name: "Entrada", value: t, fill: COLORS.queue, pct: "100%" },
      { name: "Montagem", value: montagem, fill: COLORS.prod, pct: t > 0 ? `${Math.round((montagem/t)*100)}%` : "0%" },
      { name: "Inspeção", value: inspecao, fill: COLORS.analise, pct: t > 0 ? `${Math.round((inspecao/t)*100)}%` : "0%" },
      { name: "Aprovadas", value: aprovadas, fill: COLORS.ok, pct: t > 0 ? `${Math.round((aprovadas/t)*100)}%` : "0%" }
    ]);
  }

  function processarAvarias(motos: any[]) {
    const mapa: Record<string, number> = {};
    motos.forEach(m => {
      if (m.status?.startsWith('avaria_')) {
        const tipo = m.status.replace('avaria_', '').charAt(0).toUpperCase() + m.status.replace('avaria_', '').slice(1);
        mapa[tipo] = (mapa[tipo] || 0) + 1;
      }
    });
    setAvariasData(Object.entries(mapa).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value));
  }

  function processarTecnicos(motos: any[], pausas: any[]) {
    const stats: Record<string, any> = {};
    const idToNome: Record<string, string> = {};

    motos.forEach(m => {
      if (!m.montador?.nome) return;
      const nome = m.montador.nome.split(' ')[0];
      if (m.montador_id) idToNome[m.montador_id] = nome;
      if (!stats[nome]) stats[nome] = { nome, total: 0, retrabalhos: 0, pausas: 0, tempoMedio: 0, temposArr: [] };
      stats[nome].total++;
      if (m.rework_count > 0) stats[nome].retrabalhos++;
      if (m.inicio_montagem && m.fim_montagem) {
        stats[nome].temposArr.push(differenceInMinutes(new Date(m.fim_montagem), new Date(m.inicio_montagem)));
      }
    });

    pausas.forEach(p => {
      const nome = idToNome[p.montador_id];
      if (nome && stats[nome]) stats[nome].pausas++;
    });

    Object.values(stats).forEach((s: any) => {
      s.tempoMedio = s.temposArr.length > 0 ? Math.round(s.temposArr.reduce((a: number, b: number) => a + b, 0) / s.temposArr.length) : 0;
      delete s.temposArr;
    });

    setTecnicosData(Object.values(stats).sort((a: any, b: any) => b.total - a.total).slice(0, 10));
  }

  function processarCores(motos: any[]) {
    const mapa: Record<string, number> = {};
    motos.forEach(m => {
      if (!m.cor) return;
      const key = `${m.cor} / ${m.cor_banco || 'Std'}`;
      mapa[key] = (mapa[key] || 0) + 1;
    });
    setCoresData(Object.entries(mapa).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 5));
  }

  function processarQA(motos: any[]) {
    const stats: Record<string, any> = {};
    motos.forEach(m => {
      // Usamos apenas motos que já passaram pelo QA (aprovado ou com retrabalho por QA)
      if (!m.supervisor?.nome) return;
      const nome = m.supervisor.nome.split(' ')[0];
      if (!stats[nome]) stats[nome] = { nome, totalInspecionado: 0, aprovadas: 0, reprovadas: 0, tempoMedio: 0, temposArr: [] };
      
      stats[nome].totalInspecionado++;
      
      if (m.status === 'aprovado' || m.status === 'estoque' || m.status === 'expedido') {
          stats[nome].aprovadas++;
      }
      
      if (m.rework_count > 0 || m.status?.startsWith('avaria_') || m.status === 'retrabalho_montagem') {
          stats[nome].reprovadas++;
      }

      if (m.fim_montagem && m.updated_at && ['aprovado', 'estoque', 'retrabalho_montagem'].includes(m.status) || m.status?.startsWith('avaria_')) {
          // Tempo que o QA levou da fim_montagem até sua ação
          const gap = differenceInMinutes(new Date(m.updated_at), new Date(m.fim_montagem));
          if (gap > 0 && gap < 600) { // Ignora dados anômalos > 10h
             stats[nome].temposArr.push(gap);
          }
      }
    });

    Object.values(stats).forEach((s: any) => {
      s.taxaReprovacao = s.totalInspecionado > 0 ? Math.round((s.reprovadas / s.totalInspecionado) * 100) : 0;
      s.tempoMedio = s.temposArr.length > 0 ? Math.round(s.temposArr.reduce((a: number, b: number) => a + b, 0) / s.temposArr.length) : 0;
      delete s.temposArr;
    });

    setQaData(Object.values(stats).sort((a: any, b: any) => b.totalInspecionado - a.totalInspecionado));
  }

  function processarLeadTime(motos: any[]) {
    const tempos = { filaMontagem: [] as number[], filaQA: [] as number[] };
    motos.forEach(m => {
        if (m.created_at && m.inicio_montagem) {
            tempos.filaMontagem.push(differenceInMinutes(new Date(m.inicio_montagem), new Date(m.created_at)));
        }
        if (m.fim_montagem && m.updated_at && (m.status !== 'aguardando_montagem' && m.status !== 'em_producao')) {
            tempos.filaQA.push(differenceInMinutes(new Date(m.updated_at), new Date(m.fim_montagem)));
        }
    });
    
    setFunnelLeadTimeData({
        esperaMontagem: tempos.filaMontagem.length ? Math.round(tempos.filaMontagem.reduce((a,b)=>a+b,0) / tempos.filaMontagem.length) : 0,
        esperaQA: tempos.filaQA.length ? Math.round(tempos.filaQA.reduce((a,b)=>a+b,0) / tempos.filaQA.length) : 0
    });
  }

  function processarModelos(motos: any[]) {
    const mapa: Record<string, any> = {};
    motos.forEach(m => {
      const mod = m.modelo || 'Desconhecido';
      if (!mapa[mod]) mapa[mod] = { name: mod, total: 0, aprovadas: 0, avarias: 0, retrabalhos: 0 };
      mapa[mod].total++;
      if (m.status === 'aprovado') mapa[mod].aprovadas++;
      if (m.status?.startsWith('avaria_')) mapa[mod].avarias++;
      if (m.rework_count > 0) mapa[mod].retrabalhos++;
    });
    setModelosData(Object.values(mapa).sort((a: any, b: any) => b.total - a.total));
  }

  function processarHorasPico(motos: any[]) {
    const horas = Array.from({ length: 24 }, (_, i) => ({ hora: `${String(i).padStart(2, '0')}h`, total: 0 }));
    motos.forEach(m => {
      if (m.inicio_montagem) {
        const h = new Date(m.inicio_montagem).getHours();
        horas[h].total++;
      }
    });
    setHorasData(horas.filter(h => h.total > 0));
  }

  function processarPausas(pausas: any[], solPausa: any[], motos: any[]) {
    const motivos: Record<string, number> = {};
    pausas.forEach(p => {
      const mot = p.motivo || 'Não informado';
      motivos[mot] = (motivos[mot] || 0) + 1;
    });
    const resumo = Object.entries(motivos).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    setPausasResumo(resumo);
  }

  function gerarAlertas(motos: any[], histAv: any[]) {
    const al: any[] = [];
    const taxa = motos.length > 0 ? (motos.filter(m => m.rework_count > 0).length / motos.length) * 100 : 0;
    if (taxa > 15) al.push({ tipo: 'warn', msg: `Taxa de retrabalho em ${taxa.toFixed(1)}% — acima do limite de 15%` });

    const modAvaria: Record<string, number> = {};
    motos.filter(m => m.status?.startsWith('avaria_')).forEach(m => { modAvaria[m.modelo] = (modAvaria[m.modelo] || 0) + 1; });
    Object.entries(modAvaria).forEach(([mod, count]) => {
      const totalMod = motos.filter(m => m.modelo === mod).length;
      if (totalMod > 3 && (count / totalMod) > 0.3) al.push({ tipo: 'crit', msg: `Modelo ${mod} com ${Math.round((count/totalMod)*100)}% de avarias — investigar` });
    });

    const fpy = motos.length > 0 ? (motos.filter(m => m.status === 'aprovado' && (!m.rework_count || m.rework_count === 0)).length / motos.length) * 100 : 100;
    if (fpy >= 95) al.push({ tipo: 'ok', msg: `FPY em ${fpy.toFixed(1)}% — excelente qualidade!` });

    setAlertas(al);
  }

  const handleExportExcel = async () => {
    if (rawData.length === 0) return toast.warning("Sem dados.");
    const workbook = new ExcelJS.Workbook();

    // Aba 1: Dados Brutos
    const sheet1 = workbook.addWorksheet('Dados');
    sheet1.columns = [
      { header: 'Data', key: 'data', width: 14 }, { header: 'Chassi', key: 'sku', width: 22 },
      { header: 'Modelo', key: 'modelo', width: 20 }, { header: 'Montador', key: 'montador', width: 18 },
      { header: 'Cor', key: 'cor', width: 12 }, { header: 'Status', key: 'status', width: 18 },
      { header: 'Retrabalhos', key: 'rework', width: 12 }, { header: 'Tempo (min)', key: 'tempo', width: 12 },
      { header: 'Obs', key: 'obs', width: 35 },
    ];
    sheet1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    rawData.forEach(m => {
      const tempo = m.inicio_montagem && m.fim_montagem ? differenceInMinutes(new Date(m.fim_montagem), new Date(m.inicio_montagem)) : '-';
      sheet1.addRow({ data: format(new Date(m.created_at), 'dd/MM/yyyy HH:mm'), sku: m.sku, modelo: m.modelo, montador: m.montador?.nome || '-', cor: m.cor || '-', status: m.status, rework: m.rework_count || 0, tempo, obs: m.detalhes_avaria || m.observacoes || '' });
    });

    // Aba 2: KPIs
    const sheet2 = workbook.addWorksheet('KPIs');
    sheet2.columns = [{ header: 'Indicador', key: 'ind', width: 30 }, { header: 'Valor', key: 'val', width: 20 }];
    sheet2.getRow(1).font = { bold: true };
    [['Total Entrada', kpis.totalEntrada], ['Aprovadas 1ª Tentativa', kpis.aprovadasDireto], ['Total Aprovadas', kpis.aprovadasTotal],
     ['Taxa Retrabalho', `${kpis.taxaRetrabalho}%`], ['FPY', `${kpis.fpy}%`], ['Tempo Médio Montagem', `${kpis.tempoMedioMontagem} min`],
     ['Tempo Médio Resolução Avaria', `${kpis.tempoMedioAvaria}h`], ['Status Fluxo', kpis.gargalo]
    ].forEach(([ind, val]) => sheet2.addRow({ ind, val }));

    // Aba 3: Por Modelo
    const sheet3 = workbook.addWorksheet('Por Modelo');
    sheet3.columns = [{ header: 'Modelo', key: 'name', width: 25 }, { header: 'Total', key: 'total', width: 10 }, { header: 'Aprovadas', key: 'aprovadas', width: 12 }, { header: 'Avarias', key: 'avarias', width: 10 }, { header: 'Retrabalhos', key: 'retrabalhos', width: 12 }];
    sheet3.getRow(1).font = { bold: true };
    modelosData.forEach(m => sheet3.addRow(m));

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `SGM_Relatorio_${format(new Date(), 'dd-MM-yyyy')}.xlsx`; a.click();
    toast.success("Relatório exportado!");
  };

  const handlePrint = () => window.print();

  const gargaloColor = kpis.gargaloNivel === 'ok' ? 'green' : kpis.gargaloNivel === 'warn' ? 'amber' : 'red';

  return (
    <RoleGuard allowedRoles={['master', 'gestor']}>
      <div className="space-y-6 animate-in fade-in duration-500 pb-20 print:p-0 print:bg-white">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 print:hidden">
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
               <TrendingUp className="w-8 h-8 text-blue-600" /> Relatórios de Produção
            </h1>
            <p className="text-slate-500">Análise detalhada de volume, qualidade e eficiência.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger className="w-[160px] bg-white dark:bg-slate-900">
                <Calendar className="w-4 h-4 mr-2 text-slate-500" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="semana">Últimos 7 Dias</SelectItem>
                <SelectItem value="mes">Este Mês</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            {periodo === 'custom' && (
              <div className="flex gap-2">
                <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-[150px] bg-white dark:bg-slate-900" />
                <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-[150px] bg-white dark:bg-slate-900" />
              </div>
            )}
            <Button onClick={handleExportExcel} className="bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20">
              <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel
            </Button>
            <Button onClick={handlePrint} variant="outline"><Printer className="w-4 h-4 mr-2" /> Imprimir</Button>
          </div>
        </div>

        {/* Alertas Inteligentes */}
        {alertas.length > 0 && (
          <div className="space-y-2 print:hidden">
            {alertas.map((a, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border text-sm font-medium ${
                a.tipo === 'crit' ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400' :
                a.tipo === 'warn' ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400' :
                'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900 text-green-700 dark:text-green-400'
              }`}>
                {a.tipo === 'crit' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : a.tipo === 'warn' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                {a.msg}
              </div>
            ))}
          </div>
        )}

        {/* KPIs - Linha 1 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500 bg-white dark:bg-slate-950 shadow-sm">
            <CardContent className="p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Entrada (CD)</p>
                  <p className="text-3xl font-black text-slate-900 dark:text-white mt-1">{kpis.totalEntrada}</p>
                  {kpis.deltaProdSinal !== 'same' && (
                    <p className={`text-xs mt-1 flex items-center gap-1 font-bold ${kpis.deltaProdSinal === 'up' ? 'text-green-600' : 'text-red-500'}`}>
                      {kpis.deltaProdSinal === 'up' ? <ArrowUpRight className="w-3 h-3"/> : <ArrowDownRight className="w-3 h-3"/>}
                      {Math.abs(kpis.deltaProducao)}% vs período anterior
                    </p>
                  )}
                </div>
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600"><Activity className="w-5 h-5"/></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500 bg-white dark:bg-slate-950 shadow-sm">
            <CardContent className="p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">FPY (1ª Tentativa)</p>
                  <p className="text-3xl font-black text-green-600 mt-1">{kpis.fpy}%</p>
                  <p className="text-xs text-slate-400 mt-1">{kpis.aprovadasDireto} de {kpis.totalEntrada} perfeitas</p>
                </div>
                <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-600"><Target className="w-5 h-5"/></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500 bg-white dark:bg-slate-950 shadow-sm">
            <CardContent className="p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Taxa de Retrabalho</p>
                  <p className="text-3xl font-black text-amber-600 mt-1">{kpis.taxaRetrabalho}%</p>
                </div>
                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-amber-600"><AlertTriangle className="w-5 h-5"/></div>
              </div>
            </CardContent>
          </Card>

          <Card className={`border-l-4 border-l-${gargaloColor}-500 bg-white dark:bg-slate-950 shadow-sm`}>
            <CardContent className="p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Status do Fluxo</p>
                  <p className={`text-lg font-black mt-2 leading-none ${kpis.gargaloNivel === 'ok' ? 'text-green-600' : kpis.gargaloNivel === 'warn' ? 'text-amber-600' : 'text-red-600'}`}>{kpis.gargalo}</p>
                </div>
                <div className={`p-2 rounded-lg ${kpis.gargaloNivel === 'ok' ? 'bg-green-50 dark:bg-green-900/20 text-green-600' : kpis.gargaloNivel === 'warn' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600' : 'bg-red-50 dark:bg-red-900/20 text-red-600'}`}>
                  {kpis.gargaloNivel === 'ok' ? <CheckCircle2 className="w-5 h-5"/> : <AlertTriangle className="w-5 h-5"/>}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* KPIs - Linha 2 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-cyan-500 bg-white dark:bg-slate-950 shadow-sm">
            <CardContent className="p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Tempo Médio Montagem</p>
                  <p className="text-3xl font-black text-cyan-600 mt-1">{kpis.tempoMedioMontagem}<span className="text-lg">min</span></p>
                </div>
                <div className="p-2 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg text-cyan-600"><Timer className="w-5 h-5"/></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-violet-500 bg-white dark:bg-slate-950 shadow-sm">
            <CardContent className="p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Resolução Avaria</p>
                  <p className="text-3xl font-black text-violet-600 mt-1">{kpis.tempoMedioAvaria}<span className="text-lg">h</span></p>
                </div>
                <div className="p-2 bg-violet-50 dark:bg-violet-900/20 rounded-lg text-violet-600"><Wrench className="w-5 h-5"/></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500 bg-white dark:bg-slate-950 shadow-sm">
            <CardContent className="p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Aprovadas</p>
                  <p className="text-3xl font-black text-emerald-600 mt-1">{kpis.aprovadasTotal}</p>
                </div>
                <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-emerald-600"><CheckCircle2 className="w-5 h-5"/></div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-indigo-500 bg-white dark:bg-slate-950 shadow-sm">
            <CardContent className="p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Tempo de Pátio</p>
                  <p className="text-3xl font-black text-indigo-600 mt-1">{kpis.tempoMedioPatio}<span className="text-lg">h</span></p>
                </div>
                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-indigo-600"><Warehouse className="w-5 h-5"/></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs de Análise */}
        <Tabs defaultValue="evolucao" className="w-full">
          <TabsList className="bg-slate-100 dark:bg-slate-900 w-full justify-start flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="evolucao">Evolução</TabsTrigger>
            <TabsTrigger value="equipe">Equipe</TabsTrigger>
            <TabsTrigger value="modelos">Modelos</TabsTrigger>
            <TabsTrigger value="avarias">Avarias</TabsTrigger>
            <TabsTrigger value="pausas">Pausas</TabsTrigger>
            <TabsTrigger value="funil">Funil</TabsTrigger>
          </TabsList>

          {/* Tab Evolução */}
          <TabsContent value="evolucao" className="mt-6 space-y-6">
            <Card className="bg-white dark:bg-slate-950 shadow-md">
              <CardHeader>
                <CardTitle>Evolução da Qualidade de Produção</CardTitle>
                <CardDescription>Comparativo diário: verde (perfeitas), amarelo (retrabalhos), vermelho (avarias), azul claro (em andamento).</CardDescription>
              </CardHeader>
              <CardContent className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={timelineData} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px' }} itemStyle={{ fontSize: '12px' }} />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Bar dataKey="perfeitas" name="Aprovado Direto" stackId="a" fill={COLORS.ok} radius={[0, 0, 4, 4]} barSize={40} />
                    <Bar dataKey="retrabalhos" name="Com Retrabalho" stackId="a" fill={COLORS.warning} barSize={40} />
                    <Bar dataKey="avarias" name="Com Avaria" stackId="a" fill={COLORS.avaria} barSize={40} />
                    <Bar dataKey="emAndamento" name="Em Andamento" stackId="a" fill={COLORS.em_andamento} radius={[4, 4, 0, 0]} barSize={40} />
                    <Line type="monotone" dataKey="total" name="Total" stroke={COLORS.line} strokeWidth={2} dot={{r: 4}} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* FPY Trend + Horas Pico */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-white dark:bg-slate-950 shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Target className="w-5 h-5 text-green-600"/> Tendência FPY</CardTitle>
                  <CardDescription>First Pass Yield diário vs meta de 90%</CardDescription>
                </CardHeader>
                <CardContent className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={fypTimeline} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11}} />
                      <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11}} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px' }} />
                      <Bar dataKey="fpy" name="FPY %" fill={COLORS.ok} radius={[4, 4, 0, 0]} barSize={30} />
                      <Line type="monotone" dataKey="meta" name="Meta" stroke={COLORS.avaria} strokeWidth={2} strokeDasharray="5 5" dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-slate-950 shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5 text-blue-600"/> Horários de Pico</CardTitle>
                  <CardDescription>Volume de montagens iniciadas por hora do dia</CardDescription>
                </CardHeader>
                <CardContent className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={horasData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                      <XAxis dataKey="hora" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11}} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px' }} />
                      <Bar dataKey="total" name="Montagens" fill={COLORS.prod} radius={[4, 4, 0, 0]} barSize={24}>
                        <LabelList dataKey="total" position="top" fontSize={10} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab Equipe */}
          {/* Tab Equipe (com Ranking QA) */}
          <TabsContent value="equipe" className="mt-6 space-y-6">
            <Card className="bg-white dark:bg-slate-950">
              <CardHeader><CardTitle>Produtividade de Montagem</CardTitle><CardDescription>Ranking com volume, retrabalhos e tempo médio por montador</CardDescription></CardHeader>
              <CardContent className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tecnicosData} layout="vertical" margin={{ left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} opacity={0.1} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="nome" type="category" width={100} tick={{fontSize: 12}} />
                    <Tooltip cursor={{fill: 'transparent'}} content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (<div className="bg-slate-900 text-white text-xs p-3 rounded-lg shadow-xl space-y-1">
                          <p className="font-bold text-sm">{d.nome}</p>
                          <p>Montagens: <strong>{d.total}</strong></p>
                          <p className="text-amber-400">Retrabalhos: {d.retrabalhos}</p>
                          <p className="text-cyan-400">Tempo Médio: {d.tempoMedio} min</p>
                          <p className="text-purple-300">Pausas: {d.pausas}</p>
                        </div>);
                      }
                      return null;
                    }} />
                    <Bar dataKey="total" name="Total Montado" fill={COLORS.prod} radius={[0, 4, 4, 0]} barSize={20}>
                      <LabelList dataKey="total" position="right" fontSize={12} />
                    </Bar>
                    <Bar dataKey="retrabalhos" name="Retrabalhos" fill={COLORS.warning} radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-slate-950">
              <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-600"/> Avaliação de Qualidade (QA)</CardTitle><CardDescription>Desempenho dos supervisores na inspeção final</CardDescription></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-slate-500 text-xs uppercase">
                      <th className="pb-3 font-bold">Inspetor QA</th><th className="pb-3 font-bold text-center">Inspecionadas</th><th className="pb-3 font-bold text-center">Aprovadas</th><th className="pb-3 font-bold text-center">Reprovadas</th><th className="pb-3 font-bold text-center">Tempo Médio</th><th className="pb-3 font-bold text-center">Taxa Reprovação</th>
                    </tr></thead>
                    <tbody>{qaData.map((q: any) => (
                      <tr key={q.nome} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-3 font-bold text-slate-900 dark:text-white">{q.nome}</td>
                        <td className="py-3 text-center">{q.totalInspecionado}</td>
                        <td className="py-3 text-center text-green-600 font-bold">{q.aprovadas}</td>
                        <td className="py-3 text-center text-red-600 font-bold">{q.reprovadas}</td>
                        <td className="py-3 text-center">{q.tempoMedio} min</td>
                        <td className="py-3 text-center">
                          <Badge variant={q.totalInspecionado > 0 && q.taxaReprovacao > 20 ? 'destructive' : 'secondary'}>
                            {q.taxaReprovacao}%
                          </Badge>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Modelos */}
          <TabsContent value="modelos" className="mt-6 space-y-6">
            <Card className="bg-white dark:bg-slate-950">
              <CardHeader><CardTitle className="flex items-center gap-2"><Package className="w-5 h-5 text-blue-600"/> Produção por Modelo</CardTitle></CardHeader>
              <CardContent className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={modelosData} margin={{ top: 20, right: 30, bottom: 60, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11}} angle={-30} textAnchor="end" height={60} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11}} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px' }} />
                    <Legend />
                    <Bar dataKey="aprovadas" name="Aprovadas" fill={COLORS.ok} radius={[0, 0, 4, 4]} barSize={28} stackId="b" />
                    <Bar dataKey="retrabalhos" name="Retrabalhos" fill={COLORS.warning} barSize={28} stackId="b" />
                    <Bar dataKey="avarias" name="Avarias" fill={COLORS.avaria} radius={[4, 4, 0, 0]} barSize={28} stackId="b" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            {/* Tabela resumo modelos */}
            <Card className="bg-white dark:bg-slate-950">
              <CardHeader><CardTitle>Resumo por Modelo</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left text-slate-500 text-xs uppercase">
                        <th className="pb-3 font-bold">Modelo</th><th className="pb-3 font-bold text-center">Total</th><th className="pb-3 font-bold text-center">Aprovadas</th><th className="pb-3 font-bold text-center">Avarias</th><th className="pb-3 font-bold text-center">Taxa Avaria</th>
                      </tr></thead>
                      <tbody>{modelosData.map((m: any) => (
                        <tr key={m.name} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="py-3 font-bold text-slate-900 dark:text-white">{m.name}</td>
                          <td className="py-3 text-center">{m.total}</td>
                          <td className="py-3 text-center text-green-600 font-bold">{m.aprovadas}</td>
                          <td className="py-3 text-center text-red-600 font-bold">{m.avarias}</td>
                          <td className="py-3 text-center">
                            <Badge variant={m.total > 0 && (m.avarias/m.total) > 0.1 ? 'destructive' : 'secondary'}>
                              {m.total > 0 ? `${Math.round((m.avarias/m.total)*100)}%` : '0%'}
                            </Badge>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                     <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-4 text-center">Top 5 Combinações (Cor / Banco)</h3>
                     <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={coresData} innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                                    {coresData.map((_, index) => (<Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />))}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" height={36}/>
                            </PieChart>
                        </ResponsiveContainer>
                     </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Avarias */}
          <TabsContent value="avarias" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-white dark:bg-slate-950">
                <CardHeader><CardTitle>Distribuição de Problemas</CardTitle></CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={avariasData} innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
                        {avariasData.map((_, index) => (<Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />))}
                      </Pie>
                      <Tooltip /><Legend verticalAlign="middle" align="right" layout="vertical" />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="bg-white dark:bg-slate-950">
                <CardHeader><CardTitle>Ranking de Defeitos por Tipo</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {avariasData.length === 0 && <p className="text-center text-slate-400 py-10">Nenhuma avaria no período.</p>}
                    {avariasData.map((a, i) => (
                      <div key={a.name} className="flex justify-between items-center p-3 border rounded-lg bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-black text-red-600 w-8">{i+1}º</span>
                          <div>
                            <p className="font-bold text-red-700 dark:text-red-400 uppercase">{a.name}</p>
                            <p className="text-xs text-slate-500">{rawData.length > 0 ? `${((a.value/rawData.length)*100).toFixed(1)}% do total` : ''}</p>
                          </div>
                        </div>
                        <Badge variant="destructive" className="text-lg px-3">{a.value}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab Pausas */}
          <TabsContent value="pausas" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-l-4 border-l-purple-500 bg-white dark:bg-slate-950">
                <CardContent className="p-5">
                  <p className="text-slate-500 text-xs font-bold uppercase">Total de Pausas</p>
                  <p className="text-3xl font-black text-purple-600 mt-1">{pausasResumo.reduce((a, b) => a + b.value, 0)}</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-orange-500 bg-white dark:bg-slate-950">
                <CardContent className="p-5">
                  <p className="text-slate-500 text-xs font-bold uppercase">Solicitações Rejeitadas</p>
                  <p className="text-3xl font-black text-orange-600 mt-1">{solicitacoesPausa.filter((s: any) => s.status === 'rejeitada').length}</p>
                  <p className="text-xs text-slate-400 mt-1">de {solicitacoesPausa.length} solicitações</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-indigo-500 bg-white dark:bg-slate-950">
                <CardContent className="p-5">
                  <p className="text-slate-500 text-xs font-bold uppercase">Motivos Diferentes</p>
                  <p className="text-3xl font-black text-indigo-600 mt-1">{pausasResumo.length}</p>
                </CardContent>
              </Card>
            </div>
            <Card className="bg-white dark:bg-slate-950">
              <CardHeader><CardTitle className="flex items-center gap-2"><PauseCircle className="w-5 h-5 text-purple-600"/> Pausas por Motivo</CardTitle></CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pausasResumo} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} opacity={0.1} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={150} tick={{fontSize: 11}} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px' }} />
                    <Bar dataKey="value" name="Ocorrências" fill={COLORS.pause} radius={[0, 4, 4, 0]} barSize={20}>
                      <LabelList dataKey="value" position="right" fontSize={12} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Funil */}
          <TabsContent value="funil" className="mt-6">
            <Card className="bg-white dark:bg-slate-950">
              <CardHeader><CardTitle>Conversão de Processo</CardTitle><CardDescription>Funil com taxas de conversão entre etapas</CardDescription></CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row gap-8 items-center justify-center py-6">
                  {funnelData.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-4 relative">
                      <div className="text-center relative z-10">
                        <div className="rounded-xl p-6 min-w-[140px]" style={{ backgroundColor: item.fill + '20', borderLeft: `4px solid ${item.fill}` }}>
                          <p className="text-3xl font-black" style={{ color: item.fill }}>{item.value}</p>
                          <p className="text-sm font-bold text-slate-600 dark:text-slate-300 mt-1">{item.name}</p>
                          <Badge variant="secondary" className="mt-2">{item.pct}</Badge>
                        </div>
                      </div>
                      {/* Lead Time Labels */}
                      {i < funnelData.length - 1 && (
                        <div className="text-slate-300 dark:text-slate-600 hidden md:flex flex-col items-center justify-center w-24">
                           {i === 0 && funnelLeadTimeData?.esperaMontagem > 0 && (
                               <div className="absolute -top-6 text-[10px] font-bold text-indigo-500 whitespace-nowrap bg-indigo-50 dark:bg-indigo-950 px-2 py-1 rounded-full border border-indigo-100">+{funnelLeadTimeData.esperaMontagem}m espera</div>
                           )}
                           {i === 1 && funnelLeadTimeData?.esperaQA > 0 && (
                               <div className="absolute -top-6 text-[10px] font-bold text-amber-500 whitespace-nowrap bg-amber-50 dark:bg-amber-950 px-2 py-1 rounded-full border border-amber-100">+{funnelLeadTimeData.esperaQA}m fila QA</div>
                           )}
                           <ArrowRight className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

      </div>
    </RoleGuard>
  );
}