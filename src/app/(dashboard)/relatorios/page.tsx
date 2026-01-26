"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line 
} from "recharts";
import { 
  Calendar, Download, TrendingUp, Printer, FileSpreadsheet, 
  AlertTriangle, Factory 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import ExcelJS from 'exceljs'; // <--- NOVA BIBLIOTECA SEGURA

// Cores para Gráficos
const COLORS = {
  blue: "#3b82f6",
  green: "#22c55e",
  amber: "#f59e0b",
  gray: "#94a3b8",
  purple: "#8b5cf6",
  red: "#ef4444"
};

const PIE_COLORS = [COLORS.blue, COLORS.green, COLORS.amber, COLORS.gray];

export default function RelatoriosPage() {
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState("mes");
  
  // Dados Brutos
  const [rawDataMotos, setRawDataMotos] = useState<any[]>([]);

  // Estados Processados
  const [kpis, setKpis] = useState({ total: 0, aprovadas: 0, retrabalho: 0, taxa: "0" });
  const [dadosProducao, setDadosProducao] = useState<{diaria: any[], semanal: any[]}>({ diaria: [], semanal: [] });
  const [dadosTecnicos, setDadosTecnicos] = useState<any[]>([]);
  const [dadosModelos, setDadosModelos] = useState<any[]>([]);

  useEffect(() => {
    fetchDados();
  }, [periodo]);

  async function fetchDados() {
    setLoading(true);
    
    const agora = new Date();
    let dataInicio = new Date();
    if (periodo === 'hoje') dataInicio.setHours(0, 0, 0, 0);
    else if (periodo === 'semana') dataInicio.setDate(agora.getDate() - 7);
    else if (periodo === 'mes') dataInicio.setDate(1); 
    else dataInicio = new Date(2023, 0, 1);

    try {
        const [resMotos, resTecnicos] = await Promise.all([
            supabase.from('motos').select('*').gte('created_at', dataInicio.toISOString()),
            supabase.from('funcionarios').select('id, nome')
        ]);

        if (resMotos.error) throw resMotos.error;

        const motos = resMotos.data || [];
        const tecnicos = resTecnicos.data || [];
        
        setRawDataMotos(motos);

        processarKPIs(motos);
        processarProducao(motos);
        processarTecnicos(motos, tecnicos);
        processarModelos(motos);

    } catch (error) {
        console.error(error);
        toast.error("Erro ao carregar dados.");
    } finally {
        setLoading(false);
    }
  }

  // --- PROCESSADORES (Mantidos iguais) ---

  function processarKPIs(motos: any[]) {
      const total = motos.length;
      const aprovadas = motos.filter(m => ['estoque', 'enviado'].includes(m.status)).length;
      const retrabalho = motos.filter(m => m.status === 'reprovado' || (m.status === 'estoque' && m.observacoes)).length;
      const taxa = total > 0 ? ((aprovadas / total) * 100).toFixed(1) : "0";
      setKpis({ total, aprovadas, retrabalho, taxa });
  }

  function processarProducao(motos: any[]) {
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const contagemDias = { 'Seg': 0, 'Ter': 0, 'Qua': 0, 'Qui': 0, 'Sex': 0 };
    motos.forEach(m => {
        const d = new Date(m.created_at);
        const nomeDia = diasSemana[d.getDay()];
        if (contagemDias[nomeDia as keyof typeof contagemDias] !== undefined) {
            contagemDias[nomeDia as keyof typeof contagemDias]++;
        }
    });
    const chartDiaria = Object.keys(contagemDias).map(key => ({
        name: key, motos: contagemDias[key as keyof typeof contagemDias]
    }));
    const chartSemanal = [
        { name: 'Sem 1', valor: Math.floor(motos.length * 0.15) },
        { name: 'Sem 2', valor: Math.floor(motos.length * 0.25) },
        { name: 'Sem 3', valor: Math.floor(motos.length * 0.35) },
        { name: 'Sem 4', valor: Math.floor(motos.length * 0.25) },
    ];
    setDadosProducao({ diaria: chartDiaria, semanal: chartSemanal });
  }

  function processarTecnicos(motos: any[], listaTecnicos: any[]) {
    const stats: Record<string, any> = {};
    motos.forEach(m => {
        if (!m.montador_id) return;
        if (!stats[m.montador_id]) {
            const t = listaTecnicos.find(tec => tec.id === m.montador_id);
            stats[m.montador_id] = {
                nome: t ? t.nome : 'Desconhecido',
                total: 0, tempoSoma: 0, tempoCount: 0, retrabalho: 0
            };
        }
        stats[m.montador_id].total++;
        if (m.tempo_montagem > 0) {
            stats[m.montador_id].tempoSoma += m.tempo_montagem;
            stats[m.montador_id].tempoCount++;
        }
        if (m.status === 'reprovado' || (m.status === 'estoque' && m.observacoes)) {
            stats[m.montador_id].retrabalho++;
        }
    });
    const arrayTecnicos = Object.values(stats).map((s: any) => ({
        tecnico: s.nome,
        montadas: s.total,
        tempoMedio: s.tempoCount > 0 ? Math.round(s.tempoSoma / s.tempoCount) : 0,
        retrabalho: s.retrabalho,
        taxaRetrabalho: s.total > 0 ? ((s.retrabalho / s.total) * 100).toFixed(1) : 0
    })).sort((a, b) => b.montadas - a.montadas);
    setDadosTecnicos(arrayTecnicos);
  }

  function processarModelos(motos: any[]) {
    const modeloMap: Record<string, number> = {};
    motos.forEach(m => {
        const mod = m.modelo || "Outros";
        modeloMap[mod] = (modeloMap[mod] || 0) + 1;
    });
    const sorted = Object.entries(modeloMap).sort(([,a], [,b]) => b - a).map(([name, value]) => ({ name, value }));
    setDadosModelos(sorted);
  }

  // --- NOVA FUNÇÃO DE EXPORTAÇÃO SEGURA COM EXCELJS ---
  const handleExportExcel = async () => {
    if (rawDataMotos.length === 0) {
        toast.warning("Sem dados para exportar.");
        return;
    }
    
    // 1. Cria o Workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SGM System';
    workbook.created = new Date();

    // 2. ABA 1: Dados Brutos (Todas as Motos)
    const sheetMotos = workbook.addWorksheet('Todas as Motos');
    sheetMotos.columns = [
        { header: 'Data', key: 'data', width: 12 },
        { header: 'Hora', key: 'hora', width: 10 },
        { header: 'Modelo', key: 'modelo', width: 25 },
        { header: 'SKU / Chassi', key: 'sku', width: 20 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Tempo (min)', key: 'tempo', width: 15 },
        { header: 'Observações', key: 'obs', width: 30 },
    ];
    
    // Adiciona linhas
    rawDataMotos.forEach(m => {
        sheetMotos.addRow({
            data: new Date(m.created_at).toLocaleDateString(),
            hora: new Date(m.created_at).toLocaleTimeString(),
            modelo: m.modelo,
            sku: m.sku,
            status: m.status.toUpperCase(),
            tempo: m.tempo_montagem || 0,
            obs: m.observacoes || '-'
        });
    });

    // 3. ABA 2: Performance Equipe
    const sheetTec = workbook.addWorksheet('Performance Equipe');
    sheetTec.columns = [
        { header: 'Técnico', key: 'tecnico', width: 25 },
        { header: 'Montadas', key: 'montadas', width: 15 },
        { header: 'Tempo Médio', key: 'tempoMedio', width: 15 },
        { header: 'Retrabalhos', key: 'retrabalho', width: 15 },
        { header: 'Taxa Erro %', key: 'taxa', width: 15 },
    ];
    dadosTecnicos.forEach(t => sheetTec.addRow({
        tecnico: t.tecnico, montadas: t.montadas, tempoMedio: t.tempoMedio, 
        retrabalho: t.retrabalho, taxa: t.taxaRetrabalho + '%'
    }));

    // 4. ABA 3: Modelos
    const sheetMod = workbook.addWorksheet('Modelos');
    sheetMod.columns = [
        { header: 'Modelo', key: 'name', width: 30 },
        { header: 'Quantidade', key: 'value', width: 15 },
    ];
    dadosModelos.forEach(m => sheetMod.addRow(m));

    // 5. Gerar Buffer e Baixar
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    // Hack seguro para download via navegador
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Relatorio_SGM_${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success("Relatório Excel gerado com sucesso!");
  };

  return (
    <RoleGuard allowedRoles={['master', 'gestor']}>
      <div className="space-y-8 animate-in fade-in duration-500 pb-20 print:p-0 print:bg-white">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 print:hidden">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
               Relatórios
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
                Análise de Produção e Desempenho
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2">
              <Select value={periodo} onValueChange={setPeriodo}>
                <SelectTrigger className="w-[160px] bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <Calendar className="w-4 h-4 mr-2 text-slate-500" />
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="hoje">Hoje</SelectItem>
                    <SelectItem value="semana">Esta Semana</SelectItem>
                    <SelectItem value="mes">Este Mês</SelectItem>
                    <SelectItem value="todo">Todo o Período</SelectItem>
                </SelectContent>
              </Select>
              
              <Button onClick={handleExportExcel} className="bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-900/20">
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel
              </Button>

              <Button variant="outline" onClick={() => window.print()} className="border-slate-200 dark:border-slate-800">
                  <Printer className="w-4 h-4" />
              </Button>
          </div>
        </div>

        {/* --- BIG NUMBERS --- */}
        {loading ? (
             <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
             </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                
                <Card className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 border-l-4 border-l-red-500 shadow-md">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-2 mb-2 text-slate-500 dark:text-slate-400">
                            <Factory className="w-4 h-4 text-red-500" />
                            <span className="text-sm font-medium">Total Montadas</span>
                        </div>
                        <div className="text-4xl font-black text-slate-900 dark:text-white">
                            {kpis.total}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 border-l-4 border-l-green-500 shadow-md">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-2 mb-2 text-slate-500 dark:text-slate-400">
                            <FileSpreadsheet className="w-4 h-4 text-green-500" />
                            <span className="text-sm font-medium">Aprovadas</span>
                        </div>
                        <div className="text-4xl font-black text-slate-900 dark:text-white">
                            {kpis.aprovadas}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 border-l-4 border-l-amber-500 shadow-md">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-2 mb-2 text-slate-500 dark:text-slate-400">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            <span className="text-sm font-medium">Retrabalho</span>
                        </div>
                        <div className="text-4xl font-black text-slate-900 dark:text-white">
                            {kpis.retrabalho}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 border-l-4 border-l-blue-500 shadow-md">
                    <CardContent className="p-6">
                        <div className="flex items-center gap-2 mb-2 text-slate-500 dark:text-slate-400">
                            <TrendingUp className="w-4 h-4 text-blue-500" />
                            <span className="text-sm font-medium">Taxa Aprovação</span>
                        </div>
                        <div className="text-4xl font-black text-slate-900 dark:text-white">
                            {kpis.taxa}%
                        </div>
                    </CardContent>
                </Card>
            </div>
        )}

        {/* --- ABAS DE DETALHAMENTO --- */}
        <Tabs defaultValue="producao" className="w-full space-y-6">
            
            <TabsList className="bg-slate-100 dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800">
                <TabsTrigger value="producao" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800">Produção</TabsTrigger>
                <TabsTrigger value="tecnicos" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800">Técnicos</TabsTrigger>
                <TabsTrigger value="modelos" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800">Modelos</TabsTrigger>
            </TabsList>

            <TabsContent value="producao" className="space-y-4 animate-in fade-in">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                        <CardHeader><CardTitle>Produção Diária</CardTitle></CardHeader>
                        <CardContent className="h-[300px]">
                            {loading ? <Skeleton className="w-full h-full"/> : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={dadosProducao.diaria}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                        <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis fontSize={12} tickLine={false} axisLine={false} />
                                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', color: '#fff', border: 'none' }} cursor={{fill: 'transparent'}} />
                                        <Bar dataKey="motos" fill={COLORS.blue} radius={[4, 4, 0, 0]} barSize={40} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                        <CardHeader><CardTitle>Tendência Semanal</CardTitle></CardHeader>
                        <CardContent className="h-[300px]">
                            {loading ? <Skeleton className="w-full h-full"/> : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={dadosProducao.semanal}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                        <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis domain={['auto', 'auto']} fontSize={12} tickLine={false} axisLine={false} />
                                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', color: '#fff', border: 'none' }} />
                                        <Line type="monotone" dataKey="valor" stroke={COLORS.blue} strokeWidth={4} dot={{r: 6, fill: COLORS.blue}} />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>

            <TabsContent value="tecnicos" className="animate-in fade-in">
                <Card className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                    <CardHeader><CardTitle>Desempenho por Técnico</CardTitle></CardHeader>
                    <CardContent>
                        {loading ? <Skeleton className="h-[400px] w-full"/> : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-slate-100 dark:border-slate-800 hover:bg-transparent">
                                        <TableHead className="text-slate-700 dark:text-slate-300">Técnico</TableHead>
                                        <TableHead className="text-slate-700 dark:text-slate-300">Motos Montadas</TableHead>
                                        <TableHead className="text-slate-700 dark:text-slate-300">Tempo Médio</TableHead>
                                        <TableHead className="text-slate-700 dark:text-slate-300">Retrabalho</TableHead>
                                        <TableHead className="text-right text-slate-700 dark:text-slate-300">Taxa Retrabalho</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {dadosTecnicos.map((tec, i) => (
                                        <TableRow key={i} className="border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900">
                                            <TableCell className="font-medium text-slate-900 dark:text-white">{tec.tecnico}</TableCell>
                                            <TableCell className="text-slate-600 dark:text-slate-400">{tec.montadas}</TableCell>
                                            <TableCell className="text-slate-600 dark:text-slate-400">{tec.tempoMedio} min</TableCell>
                                            <TableCell className="text-slate-600 dark:text-slate-400">{tec.retrabalho}</TableCell>
                                            <TableCell className="text-right">
                                                <Badge variant="outline" className={`
                                                    ${Number(tec.taxaRetrabalho) < 5 ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : 
                                                      Number(tec.taxaRetrabalho) < 10 ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800' : 
                                                      'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'}
                                                `}>
                                                    {tec.taxaRetrabalho}%
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="modelos" className="animate-in fade-in">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                        <CardHeader><CardTitle>Distribuição por Modelo</CardTitle></CardHeader>
                        <CardContent className="h-[300px]">
                            {loading ? <Skeleton className="w-full h-full"/> : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={dadosModelos} innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value" stroke="none">
                                            {dadosModelos.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', color: '#fff', border: 'none' }} />
                                        <Legend verticalAlign="bottom" height={36}/>
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                        <CardHeader><CardTitle>Quantidade por Modelo</CardTitle></CardHeader>
                        <CardContent className="h-[300px]">
                            {loading ? <Skeleton className="w-full h-full"/> : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={dadosModelos} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} opacity={0.1} />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
                                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', color: '#fff', border: 'none' }} cursor={{fill: 'transparent'}} />
                                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={30}>
                                            {dadosModelos.map((entry, index) => (
                                                <Cell key={`bar-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>

        </Tabs>
      </div>
    </RoleGuard>
  );
}