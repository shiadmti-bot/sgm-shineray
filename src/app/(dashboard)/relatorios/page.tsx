"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, FunnelChart, Funnel, LabelList
} from "recharts";
import { 
  Calendar, Download, TrendingUp, Printer, FileSpreadsheet, 
  AlertTriangle, Factory, ClipboardCheck, Ban, 
  CheckCircle2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import ExcelJS from 'exceljs';

// Cores Semânticas V2.0
const COLORS = {
  queue: "#94a3b8",   // Cinza (Fila)
  prod: "#3b82f6",    // Azul (Produção)
  analise: "#8b5cf6", // Roxo (Qualidade)
  ok: "#22c55e",      // Verde (Aprovado)
  avaria: "#ef4444",  // Vermelho (Defeito)
  warning: "#f59e0b"  // Amarelo (Retrabalho)
};

const PIE_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16"];

export default function RelatoriosPage() {
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState("mes");
  
  // Dados Brutos com Joins
  const [rawData, setRawData] = useState<any[]>([]);

  // Dados para Gráficos
  const [funnelData, setFunnelData] = useState<any[]>([]);
  const [avariasData, setAvariasData] = useState<any[]>([]);
  const [tecnicosData, setTecnicosData] = useState<any[]>([]);
  
  // KPIs
  const [kpis, setKpis] = useState({ 
    totalEntrada: 0, 
    aprovadas: 0, 
    taxaAprovacao: "0", 
    gargalo: "Nenhum" 
  });

  useEffect(() => {
    fetchDados();
  }, [periodo]);

  async function fetchDados() {
    setLoading(true);
    
    // 1. Filtro de Data
    const agora = new Date();
    let dataInicio = new Date();
    if (periodo === 'hoje') dataInicio.setHours(0, 0, 0, 0);
    else if (periodo === 'semana') dataInicio.setDate(agora.getDate() - 7);
    else if (periodo === 'mes') dataInicio.setDate(1); 
    else dataInicio = new Date(2023, 0, 1);

    try {
        // 2. Busca Completa com Relations
        // Precisamos saber quem montou E quem supervisionou
        const { data, error } = await supabase
            .from('motos')
            .select(`
                *,
                montador:funcionarios!montador_id(nome),
                supervisor:funcionarios!supervisor_id(nome)
            `)
            .gte('created_at', dataInicio.toISOString());

        if (error) throw error;
        const motos = data || [];
        setRawData(motos);

        // 3. Processamento
        processarFunil(motos);
        processarAvarias(motos);
        processarTecnicos(motos);
        calcularKPIs(motos);

    } catch (error) {
        console.error(error);
        toast.error("Erro ao carregar dados.");
    } finally {
        setLoading(false);
    }
  }

  // --- LÓGICA DE PROCESSAMENTO V2.0 ---

  function calcularKPIs(motos: any[]) {
      const total = motos.length;
      const aprovadas = motos.filter(m => m.status === 'aprovado').length;
      const taxa = total > 0 ? ((aprovadas / total) * 100).toFixed(1) : "0";
      
      // Identificar onde tem mais motos paradas
      const counts = {
          fila: motos.filter(m => m.status === 'aguardando_montagem').length,
          prod: motos.filter(m => m.status === 'em_producao').length,
          qa: motos.filter(m => m.status === 'em_analise').length,
          reparo: motos.filter(m => m.status.startsWith('avaria_')).length
      };
      
      // Lógica simples de gargalo
      let gargalo = "Fluxo Normal";
      if (counts.fila > 20) gargalo = "Fila Acumulada";
      if (counts.qa > 10) gargalo = "Gargalo na Inspeção";
      if (counts.reparo > 5) gargalo = "Alto índice de Avarias";

      setKpis({ totalEntrada: total, aprovadas, taxaAprovacao: taxa, gargalo });
  }

  function processarFunil(motos: any[]) {
      setFunnelData([
          { name: "Entrada/Fila", value: motos.length, fill: COLORS.queue },
          { name: "Em Produção", value: motos.filter(m => m.status !== 'aguardando_montagem').length, fill: COLORS.prod },
          { name: "Inspeção", value: motos.filter(m => ['em_analise', 'aprovado', 'avaria_mecanica', 'avaria_pintura', 'avaria_estrutura', 'avaria_pecas'].includes(m.status)).length, fill: COLORS.analise },
          { name: "Aprovadas", value: motos.filter(m => m.status === 'aprovado').length, fill: COLORS.ok }
      ]);
  }

  function processarAvarias(motos: any[]) {
      const mapa = {
          'avaria_mecanica': 0,
          'avaria_pintura': 0,
          'avaria_estrutura': 0,
          'avaria_pecas': 0
      };

      motos.forEach(m => {
          if (m.status in mapa) {
              mapa[m.status as keyof typeof mapa]++;
          }
      });

      setAvariasData([
          { name: "Mecânica", value: mapa.avaria_mecanica },
          { name: "Pintura/Estética", value: mapa.avaria_pintura },
          { name: "Estrutura", value: mapa.avaria_estrutura },
          { name: "Peças", value: mapa.avaria_pecas },
      ].filter(d => d.value > 0)); // Só mostra o que tem erro
  }

  function processarTecnicos(motos: any[]) {
      const stats: Record<string, any> = {};
      
      motos.forEach(m => {
          if (!m.montador?.nome) return;
          const nome = m.montador.nome;
          
          if (!stats[nome]) stats[nome] = { nome, total: 0, retrabalhos: 0 };
          
          stats[nome].total++;
          // Conta quantas vezes essa moto voltou (simplificação: se status atual é retrabalho ou se tem observação de retrabalho)
          if (m.status === 'retrabalho_montagem' || m.observacoes?.includes('RETRABALHO')) {
              stats[nome].retrabalhos++;
          }
      });

      setTecnicosData(Object.values(stats).sort((a,b) => b.total - a.total).slice(0, 10));
  }

  // --- EXPORTAÇÃO EXCEL 2.0 (Item 7.2) ---
  const handleExportExcel = async () => {
    if (rawData.length === 0) return toast.warning("Sem dados.");
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Relatório Produção V2');

    sheet.columns = [
        { header: 'Data Entrada', key: 'data', width: 12 },
        { header: 'Chassi (SKU)', key: 'sku', width: 20 },
        { header: 'Modelo', key: 'modelo', width: 20 },
        { header: 'Status Atual', key: 'status', width: 18 },
        { header: 'Montador', key: 'montador', width: 20 },
        { header: 'Supervisor (QA)', key: 'supervisor', width: 20 },
        { header: 'Tempo (min)', key: 'tempo', width: 12 },
        { header: 'Detalhes Avaria/Obs', key: 'obs', width: 40 },
    ];

    rawData.forEach(m => {
        sheet.addRow({
            data: new Date(m.created_at).toLocaleDateString(),
            sku: m.sku,
            modelo: m.modelo,
            status: m.status.toUpperCase().replace('_', ' '),
            montador: m.montador?.nome || 'N/A',
            supervisor: m.supervisor?.nome || 'N/A', // Assinatura Digital do QA
            tempo: m.tempo_montagem || 0,
            obs: m.detalhes_avaria || m.observacoes || '-'
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SGM_Relatorio_V2_${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click();
  };

  return (
    <RoleGuard allowedRoles={['master', 'gestor']}>
      <div className="space-y-8 animate-in fade-in duration-500 pb-20 print:p-0 print:bg-white">
        
        {/* HEADER V2 */}
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 print:hidden">
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
               Relatórios de Produção
            </h1>
            <p className="text-slate-500">Controle de fluxo, qualidade e gargalos.</p>
          </div>
          
          <div className="flex gap-2">
              <Select value={periodo} onValueChange={setPeriodo}>
                <SelectTrigger className="w-[160px] bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <Calendar className="w-4 h-4 mr-2 text-slate-500" />
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="hoje">Hoje</SelectItem>
                    <SelectItem value="semana">Esta Semana</SelectItem>
                    <SelectItem value="mes">Este Mês</SelectItem>
                </SelectContent>
              </Select>
              
              <Button onClick={handleExportExcel} className="bg-green-600 hover:bg-green-700 text-white">
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel 2.0
              </Button>
          </div>
        </div>

        {/* KPIs BIG NUMBERS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-blue-500 bg-white dark:bg-slate-950">
                <CardContent className="p-6">
                    <p className="text-slate-500 text-xs font-bold uppercase">Entrada (CD)</p>
                    <p className="text-4xl font-black text-slate-900 dark:text-white">{kpis.totalEntrada}</p>
                </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500 bg-white dark:bg-slate-950">
                <CardContent className="p-6">
                    <p className="text-slate-500 text-xs font-bold uppercase">Aprovadas (OK)</p>
                    <p className="text-4xl font-black text-green-600">{kpis.aprovadas}</p>
                </CardContent>
            </Card>
            <Card className="border-l-4 border-l-purple-500 bg-white dark:bg-slate-950">
                <CardContent className="p-6">
                    <p className="text-slate-500 text-xs font-bold uppercase">Eficiência</p>
                    <p className="text-4xl font-black text-purple-600">{kpis.taxaAprovacao}%</p>
                </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500 bg-white dark:bg-slate-950">
                <CardContent className="p-6">
                    <p className="text-slate-500 text-xs font-bold uppercase">Alerta de Fluxo</p>
                    <p className="text-xl font-bold text-red-600 mt-2">{kpis.gargalo}</p>
                </CardContent>
            </Card>
        </div>

        <Tabs defaultValue="fluxo" className="w-full">
            <TabsList className="bg-slate-100 dark:bg-slate-900">
                <TabsTrigger value="fluxo">Fluxo de Produção</TabsTrigger>
                <TabsTrigger value="avarias">Análise de Avarias</TabsTrigger>
                <TabsTrigger value="equipe">Equipe</TabsTrigger>
            </TabsList>

            {/* ABA 1: FUNIL DE PRODUÇÃO */}
            <TabsContent value="fluxo" className="mt-6">
                <Card className="bg-white dark:bg-slate-950">
                    <CardHeader>
                        <CardTitle>Funil de Eficiência</CardTitle>
                        <CardDescription>Conversão de caixas bipadas em motos aprovadas.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <FunnelChart>
                                <Tooltip contentStyle={{ backgroundColor: '#0f172a', color: '#fff', border: 'none' }} />
                                <Funnel data={funnelData} dataKey="value">
                                    <LabelList position="right" fill="#888" stroke="none" dataKey="name" />
                                </Funnel>
                            </FunnelChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </TabsContent>

            {/* ABA 2: TIPOS DE AVARIA */}
            <TabsContent value="avarias" className="mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="bg-white dark:bg-slate-950">
                        <CardHeader>
                            <CardTitle>Tipos de Defeito (Fábrica)</CardTitle>
                            <CardDescription>Distribuição de problemas identificados.</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px]">
                            {avariasData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={avariasData} innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
                                            {avariasData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-400">
                                    <CheckCircle2 className="w-10 h-10 mr-2" /> Sem avarias no período.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                    
                    {/* Lista detalhada das últimas avarias */}
                    <Card className="bg-white dark:bg-slate-950 overflow-auto h-[380px]">
                        <CardHeader>
                            <CardTitle>Últimos Defeitos Registrados</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {rawData.filter(m => m.status.startsWith('avaria_')).slice(0, 5).map(m => (
                                    <div key={m.id} className="p-3 border rounded-lg bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30">
                                        <div className="flex justify-between">
                                            <span className="font-bold text-red-700 dark:text-red-400 text-sm uppercase">
                                                {m.status.replace('avaria_', '')}
                                            </span>
                                            <span className="text-xs text-slate-500">{new Date(m.updated_at).toLocaleDateString()}</span>
                                        </div>
                                        <p className="text-sm mt-1">"{m.detalhes_avaria}"</p>
                                        <p className="text-xs text-slate-400 mt-2">Modelo: {m.modelo}</p>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>

            {/* ABA 3: EQUIPE (Com Retrabalhos) */}
            <TabsContent value="equipe" className="mt-6">
                <Card className="bg-white dark:bg-slate-950">
                    <CardHeader>
                        <CardTitle>Performance Operacional</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={tecnicosData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                <XAxis dataKey="nome" />
                                <Tooltip />
                                <Bar dataKey="total" name="Total Montado" fill={COLORS.prod} radius={[4, 4, 0, 0]} />
                                <Bar dataKey="retrabalhos" name="Retrabalhos" fill={COLORS.warning} radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>

      </div>
    </RoleGuard>
  );
}