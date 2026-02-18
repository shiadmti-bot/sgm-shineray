"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, FunnelChart, Funnel, LabelList, AreaChart, Area, ComposedChart, Line
} from "recharts";
import { 
  Calendar, FileSpreadsheet, CheckCircle2, TrendingUp, AlertTriangle, Activity
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import ExcelJS from 'exceljs';
import { format, subDays, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

// Cores Semânticas V2.0
const COLORS = {
  queue: "#94a3b8",   // Cinza (Fila)
  prod: "#3b82f6",    // Azul (Produção)
  analise: "#8b5cf6", // Roxo (Qualidade)
  ok: "#22c55e",      // Verde (Aprovado)
  avaria: "#ef4444",  // Vermelho (Defeito)
  warning: "#f59e0b", // Amarelo (Retrabalho)
  pause: "#8b5cf6",   // Roxo (Pausas)
  line: "#64748b"     // Linha de tendência
};

const PIE_COLORS = ["#ef4444", "#f97316", "#eab308", "#84cc16"];

export default function RelatoriosPage() {
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState("semana"); // Default para ver gráfico diário
  
  // Dados
  const [rawData, setRawData] = useState<any[]>([]);
  const [timelineData, setTimelineData] = useState<any[]>([]); // Novo Gráfico
  const [funnelData, setFunnelData] = useState<any[]>([]);
  const [avariasData, setAvariasData] = useState<any[]>([]);
  const [tecnicosData, setTecnicosData] = useState<any[]>([]);
  
  // KPIs
  const [kpis, setKpis] = useState({ 
    totalEntrada: 0, 
    aprovadasDireto: 0, // Sem retrabalho
    aprovadasTotal: 0,
    taxaRetrabalho: "0", 
    gargalo: "Fluxo Normal" 
  });

  useEffect(() => {
    fetchDados();
  }, [periodo]);

  async function fetchDados() {
    setLoading(true);
    
    // 1. Filtro de Data Inteligente
    const agora = new Date();
    let dataInicio = new Date();
    
    if (periodo === 'hoje') dataInicio.setHours(0, 0, 0, 0);
    else if (periodo === 'semana') dataInicio = subDays(agora, 7);
    else if (periodo === 'mes') dataInicio.setDate(1); 
    else dataInicio = new Date(2023, 0, 1);

    try {
        // 2. Busca Otimizada
        const { data, error } = await supabase
            .from('motos')
            .select(`
                *,
                montador:funcionarios!motos_montador_id_fkey(nome),
                supervisor:funcionarios!motos_supervisor_id_fkey(nome)
            `)
            .gte('created_at', dataInicio.toISOString())
            .order('created_at', { ascending: true }); // Importante para o gráfico temporal

        if (error) throw error;
        const motos = data || [];
        setRawData(motos);

        // Busca Pausas
        const { data: pausasData } = await supabase
            .from('pausas_producao')
            .select('*')
            .gte('inicio', dataInicio.toISOString());

        // 3. Processamento em Cadeia
        processarTimeline(motos, dataInicio, periodo); // O Gráfico Novo
        processarFunil(motos);
        processarAvarias(motos);
        processarTecnicos(motos, pausasData || []);
        calcularKPIs(motos);

    } catch (error) {
        console.error(error);
        toast.error("Erro ao carregar dados.");
    } finally {
        setLoading(false);
    }
  }

  // --- NOVO PROCESSAMENTO: TIMELINE DIÁRIA ---
  function processarTimeline(motos: any[], inicio: Date, tipoPeriodo: string) {
      const mapa: Record<string, any> = {};
      
      // Inicializa o mapa com datas vazias (para o gráfico não ficar com buracos)
      if (tipoPeriodo === 'semana' || tipoPeriodo === 'mes') {
          let curr = new Date(inicio);
          const end = new Date();
          while (curr <= end) {
              const key = format(curr, 'dd/MM');
              mapa[key] = { name: key, perfeitas: 0, retrabalhos: 0, avarias: 0, total: 0 };
              curr.setDate(curr.getDate() + 1);
          }
      }

      motos.forEach(m => {
          const dataKey = format(new Date(m.created_at), 'dd/MM');
          
          if (!mapa[dataKey]) mapa[dataKey] = { name: dataKey, perfeitas: 0, retrabalhos: 0, avarias: 0, total: 0 };
          
          mapa[dataKey].total++;

          if (m.status.includes('avaria')) {
              mapa[dataKey].avarias++;
          } else if (m.rework_count > 0 || m.status === 'retrabalho_montagem') {
              mapa[dataKey].retrabalhos++;
          } else if (m.status === 'aprovado') {
              mapa[dataKey].perfeitas++;
          } else {
              // Em produção ou aguardando conta apenas no total ou cria categoria 'processando'
              // Aqui vamos ignorar visualmente ou somar em perfeitas provisoriamente
          }
      });

      setTimelineData(Object.values(mapa));
  }

  function calcularKPIs(motos: any[]) {
      const total = motos.length;
      const aprovadasTotal = motos.filter(m => m.status === 'aprovado').length;
      
      // Perfeitas de Primeira: Aprovadas E sem contador de rework
      const perfeitas = motos.filter(m => m.status === 'aprovado' && (!m.rework_count || m.rework_count === 0)).length;
      
      const comRetrabalho = motos.filter(m => m.rework_count > 0 || m.status === 'retrabalho_montagem').length;
      
      const taxaRetrabalho = total > 0 ? ((comRetrabalho / total) * 100).toFixed(1) : "0";
      
      // Lógica de Gargalo
      const counts = {
          fila: motos.filter(m => m.status === 'aguardando_montagem').length,
          qa: motos.filter(m => m.status === 'em_analise').length,
          reparo: motos.filter(m => m.status.startsWith('avaria_')).length
      };
      
      let gargalo = "Fluxo Estável";
      if (counts.fila > 20) gargalo = "Acúmulo na Entrada";
      if (counts.qa > 10) gargalo = "Fila na Inspeção";
      if (counts.reparo > 5) gargalo = "Alto Índice Avarias";

      setKpis({ 
          totalEntrada: total, 
          aprovadasDireto: perfeitas,
          aprovadasTotal, 
          taxaRetrabalho, 
          gargalo 
      });
  }

  function processarFunil(motos: any[]) {
      setFunnelData([
          { name: "Entrada", value: motos.length, fill: COLORS.queue },
          { name: "Montagem", value: motos.filter(m => m.status !== 'aguardando_montagem').length, fill: COLORS.prod },
          { name: "Inspeção", value: motos.filter(m => ['em_analise', 'aprovado'].includes(m.status)).length, fill: COLORS.analise },
          { name: "Aprovadas", value: motos.filter(m => m.status === 'aprovado').length, fill: COLORS.ok }
      ]);
  }

  function processarAvarias(motos: any[]) {
      const mapa = { 'Mecânica': 0, 'Pintura': 0, 'Estrutura': 0, 'Peças': 0 };
      motos.forEach(m => {
          if (m.status === 'avaria_mecanica') mapa['Mecânica']++;
          if (m.status === 'avaria_pintura') mapa['Pintura']++;
          if (m.status === 'avaria_estrutura') mapa['Estrutura']++;
          if (m.status === 'avaria_pecas') mapa['Peças']++;
      });
      setAvariasData(Object.entries(mapa).map(([name, value]) => ({ name, value })).filter(d => d.value > 0)); 
  }

  function processarTecnicos(motos: any[], pausas: any[]) {
      const stats: Record<string, any> = {};
      
      // Contagem de Motos
      motos.forEach(m => {
          if (!m.montador?.nome) return;
          const nome = m.montador.nome.split(' ')[0]; // Só o primeiro nome
          const id = m.montador_id || nome; // Fallback se não tiver ID (improvável)
          
          if (!stats[nome]) stats[nome] = { nome, total: 0, retrabalhos: 0, pausas: 0, mediaPausas: "0.0" };
          stats[nome].total++;
          if (m.rework_count > 0) stats[nome].retrabalhos++;
      });

      // Contagem de Pausas
      pausas.forEach(p => {
          // Precisamos associar a pausa ao montador. 
          // O objeto 'p' tem montador_id. Precisamos achar o nome correspondente nos stats ou buscar.
          // Como `stats` é indexado por NOME (para o gráfico), vamos tentar achar pelo ID no array de motos 
          // ou simplificar assumindo que temos o nome no objeto p se fizéssemos join, mas não fizemos.
          // Estratégia: Varrer motos para mapear ID -> Nome.
          const montador = motos.find(m => m.montador_id === p.montador_id)?.montador;
          if (montador) {
             const nome = montador.nome.split(' ')[0];
             if (stats[nome]) {
                 stats[nome].pausas++;
             }
          }
      });

      // Calcular Médias
      Object.values(stats).forEach((s: any) => {
          if (s.total > 0) {
              s.mediaPausas = (s.pausas / s.total).toFixed(2);
          }
      });

      setTecnicosData(Object.values(stats).sort((a,b) => b.total - a.total).slice(0, 10));
  }

  const handleExportExcel = async () => {
    if (rawData.length === 0) return toast.warning("Sem dados.");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Relatório SGM');
    
    sheet.columns = [
        { header: 'Data', key: 'data', width: 12 },
        { header: 'Chassi', key: 'sku', width: 20 },
        { header: 'Modelo', key: 'modelo', width: 20 },
        { header: 'Montador', key: 'montador', width: 15 },
        { header: 'Cor', key: 'cor', width: 10 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Retrabalhos', key: 'rework', width: 10 },
        { header: 'Obs', key: 'obs', width: 30 },
    ];

    rawData.forEach(m => {
        sheet.addRow({
            data: format(new Date(m.created_at), 'dd/MM HH:mm'),
            sku: m.sku,
            modelo: m.modelo,
            montador: m.montador?.nome || '-',
            cor: m.cor || '-',
            status: m.status,
            rework: m.rework_count || 0,
            obs: m.detalhes_avaria || m.observacoes || ''
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SGM_Export_${format(new Date(), 'dd-MM')}.xlsx`;
    a.click();
  };

  return (
    <RoleGuard allowedRoles={['master', 'gestor']}>
      <div className="space-y-8 animate-in fade-in duration-500 pb-20 print:p-0 print:bg-white">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 print:hidden">
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
               <TrendingUp className="w-8 h-8 text-blue-600" /> Relatórios de Produção
            </h1>
            <p className="text-slate-500">Análise detalhada de volume e qualidade.</p>
          </div>
          
          <div className="flex gap-2">
              <Select value={periodo} onValueChange={setPeriodo}>
                <SelectTrigger className="w-[160px] bg-white dark:bg-slate-900">
                    <Calendar className="w-4 h-4 mr-2 text-slate-500" />
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="hoje">Hoje</SelectItem>
                    <SelectItem value="semana">Últimos 7 Dias</SelectItem>
                    <SelectItem value="mes">Este Mês</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleExportExcel} className="bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20">
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel
              </Button>
          </div>
        </div>

        {/* KPIs V2.0 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-blue-500 bg-white dark:bg-slate-950 shadow-sm">
                <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Entrada (CD)</p>
                            <p className="text-3xl font-black text-slate-900 dark:text-white mt-1">{kpis.totalEntrada}</p>
                        </div>
                        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600"><Activity className="w-5 h-5"/></div>
                    </div>
                </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500 bg-white dark:bg-slate-950 shadow-sm">
                <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Perfeitas (1ª Tentativa)</p>
                            <p className="text-3xl font-black text-green-600 mt-1">{kpis.aprovadasDireto}</p>
                            <p className="text-xs text-slate-400 mt-1">Total Aprovadas: {kpis.aprovadasTotal}</p>
                        </div>
                        <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-600"><CheckCircle2 className="w-5 h-5"/></div>
                    </div>
                </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500 bg-white dark:bg-slate-950 shadow-sm">
                <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Taxa de Retrabalho</p>
                            <p className="text-3xl font-black text-amber-600 mt-1">{kpis.taxaRetrabalho}%</p>
                        </div>
                        <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-amber-600"><AlertTriangle className="w-5 h-5"/></div>
                    </div>
                </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500 bg-white dark:bg-slate-950 shadow-sm">
                <CardContent className="p-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Status do Fluxo</p>
                            <p className="text-lg font-black text-red-600 mt-2 leading-none">{kpis.gargalo}</p>
                        </div>
                        <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600"><AlertTriangle className="w-5 h-5"/></div>
                    </div>
                </CardContent>
            </Card>
        </div>

        {/* GRÁFICO PRINCIPAL: EVOLUÇÃO DIÁRIA (Adaptação do Gráfico de Faturamento) */}
        <Card className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-md">
            <CardHeader>
                <CardTitle>Evolução da Qualidade de Produção</CardTitle>
                <CardDescription>
                    Comparativo diário entre montagens perfeitas (Verde), retrabalhos (Amarelo) e avarias (Vermelho).
                </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={timelineData} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px' }}
                            itemStyle={{ fontSize: '12px' }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        
                        {/* Barras Empilhadas */}
                        <Bar dataKey="perfeitas" name="Aprovado Direto" stackId="a" fill={COLORS.ok} radius={[0, 0, 4, 4]} barSize={40} />
                        <Bar dataKey="retrabalhos" name="Com Retrabalho" stackId="a" fill={COLORS.warning} barSize={40} />
                        <Bar dataKey="avarias" name="Com Avaria" stackId="a" fill={COLORS.avaria} radius={[4, 4, 0, 0]} barSize={40} />
                        
                        {/* Linha de Total para Referência */}
                        <Line type="monotone" dataKey="total" name="Total Produzido" stroke={COLORS.line} strokeWidth={2} dot={{r: 4}} />
                    </ComposedChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>

        {/* ÁREA SECUNDÁRIA: ANÁLISE DETALHADA */}
        <Tabs defaultValue="equipe" className="w-full">
            <TabsList className="bg-slate-100 dark:bg-slate-900 w-full justify-start">
                <TabsTrigger value="equipe">Ranking de Equipe</TabsTrigger>
                <TabsTrigger value="avarias">Tipos de Avaria</TabsTrigger>
                <TabsTrigger value="funil">Funil de Processo</TabsTrigger>
            </TabsList>

            <TabsContent value="equipe" className="mt-6">
                <Card className="bg-white dark:bg-slate-950">
                    <CardHeader><CardTitle>Produtividade Individual</CardTitle></CardHeader>
                    <CardContent className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={tecnicosData} layout="vertical" margin={{ left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} opacity={0.1} />
                                <XAxis type="number" hide />
                                <YAxis dataKey="nome" type="category" width={100} tick={{fontSize: 12}} />
                                <Tooltip 
                                    cursor={{fill: 'transparent'}} 
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-slate-900 text-white text-xs p-2 rounded shadow-xl">
                                                    <p className="font-bold mb-1">{data.nome}</p>
                                                    <p>Montagens: {data.total}</p>
                                                    <p className="text-amber-400">Retrabalhos: {data.retrabalhos}</p>
                                                    <hr className="my-1 border-slate-700"/>
                                                    <p className="text-purple-300">Total Pausas: {data.pausas}</p>
                                                    <p className="font-bold text-purple-400">Média: {data.mediaPausas} / moto</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar dataKey="total" name="Total Montado" fill={COLORS.prod} radius={[0, 4, 4, 0]} barSize={20}>
                                    <LabelList dataKey="total" position="right" fontSize={12} />
                                </Bar>
                                <Bar dataKey="retrabalhos" name="Retrabalhos" fill={COLORS.warning} radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="avarias" className="mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="bg-white dark:bg-slate-950">
                        <CardHeader><CardTitle>Distribuição de Problemas</CardTitle></CardHeader>
                        <CardContent className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={avariasData} innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
                                        {avariasData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend verticalAlign="middle" align="right" layout="vertical" />
                                </PieChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                    <Card className="bg-white dark:bg-slate-950">
                        <CardHeader><CardTitle>Top Defeitos</CardTitle></CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {rawData.filter(m => m.status.startsWith('avaria_')).slice(0, 5).map(m => (
                                    <div key={m.id} className="flex justify-between items-center p-3 border rounded-lg bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30">
                                        <div>
                                            <p className="font-bold text-red-700 dark:text-red-400 text-sm uppercase">{m.status.replace('avaria_', '')}</p>
                                            <p className="text-xs text-slate-500">{m.modelo}</p>
                                        </div>
                                        <p className="text-xs font-mono bg-white dark:bg-black/20 px-2 py-1 rounded">{format(new Date(m.updated_at), 'dd/MM')}</p>
                                    </div>
                                ))}
                                {rawData.filter(m => m.status.startsWith('avaria_')).length === 0 && (
                                    <p className="text-center text-slate-400 py-10">Nenhuma avaria no período.</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>

            <TabsContent value="funil" className="mt-6">
                <Card className="bg-white dark:bg-slate-950">
                    <CardHeader><CardTitle>Conversão de Processo</CardTitle></CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <FunnelChart>
                                <Tooltip />
                                <Funnel data={funnelData} dataKey="value" isAnimationActive>
                                    <LabelList position="right" fill="#888" stroke="none" dataKey="name" />
                                </Funnel>
                            </FunnelChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>

      </div>
    </RoleGuard>
  );
}