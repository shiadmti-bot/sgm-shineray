"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  Activity, Clock, Users, Wrench, ArrowRight, Zap, CheckCircle2, AlertOctagon 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { motion } from "framer-motion";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  
  // Dados "Flash" (Apenas o essencial do momento)
  const [hojeTotal, setHojeTotal] = useState(0);
  const [hojeOk, setHojeOk] = useState(0);
  const [ativosAgora, setAtivosAgora] = useState(0);
  const [ultimasAtividades, setUltimasAtividades] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardLite();
    
    // Opcional: Auto-refresh a cada 30 segundos para manter "Vivo"
    const interval = setInterval(fetchDashboardLite, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchDashboardLite() {
    // 1. Define o início do dia de hoje (00:00:00)
    const inicioDia = new Date();
    inicioDia.setHours(0,0,0,0);

    // 2. Busca Motos produzidas HOJE
    const { data: motosHoje } = await supabase
      .from('motos')
      .select('status, created_at')
      .gte('created_at', inicioDia.toISOString());

    // 3. Busca Funcionários trabalhando AGORA (status 'em_montagem')
    // Nota: Precisamos garantir que sua tabela de funcionarios tenha uma coluna de status ou inferir isso
    // Aqui vamos inferir baseando-se em quem tem motos com 'status' = 'montagem' se houver essa lógica,
    // ou simplesmente contar o total de funcionários ativos no sistema.
    // Vamos contar funcionários com 'ativo' = true para simplificar o KPI de equipe disponível.
    const { count: equipeCount } = await supabase
      .from('funcionarios')
      .select('*', { count: 'exact', head: true })
      .eq('ativo', true);

    // 4. Busca as 5 últimas motos para o Feed
    const { data: feed } = await supabase
        .from('motos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (motosHoje) {
        setHojeTotal(motosHoje.length);
        setHojeOk(motosHoje.filter(m => m.status === 'estoque' || m.status === 'enviado').length);
    }
    if (equipeCount) setAtivosAgora(equipeCount);
    if (feed) setUltimasAtividades(feed);
    
    setLoading(false);
  }

  return (
    <RoleGuard allowedRoles={['gestor', 'master']}>
      <div className="space-y-6 animate-in fade-in duration-500 pb-10">
        
        {/* Header Compacto */}
        <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Visão Geral</h1>
              <p className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                 <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                 </span>
                 Operação em Tempo Real
              </p>
            </div>
            {/* Atalho Rápido para Relatórios */}
            <Link href="/relatorios">
                <Button variant="outline" className="gap-2 hidden md:flex">
                    Ver Relatórios Completos <ArrowRight className="w-4 h-4" />
                </Button>
            </Link>
        </div>

        {/* Cards de Status Imediato (KPIs do Dia) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Card 1: Produção Hoje */}
            <Card className="bg-blue-600 border-0 text-white shadow-lg shadow-blue-900/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-20"><Zap className="w-20 h-20" /></div>
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-medium opacity-90">Produção Hoje</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? <Skeleton className="h-10 w-20 bg-white/20" /> : (
                        <div className="flex items-end gap-2">
                            <span className="text-5xl font-black">{hojeTotal}</span>
                            <span className="text-lg font-medium opacity-80 mb-1">motos</span>
                        </div>
                    )}
                    <p className="text-sm mt-2 opacity-80">Meta diária: 50 (Exemplo)</p>
                </CardContent>
            </Card>

            {/* Card 2: Qualidade Hoje */}
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-bold uppercase text-slate-500">Aprovadas (1º Turno)</CardTitle>
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                </CardHeader>
                <CardContent>
                     {loading ? <Skeleton className="h-8 w-20" /> : (
                        <div className="flex flex-col">
                            <span className="text-3xl font-black text-slate-900 dark:text-white">{hojeOk}</span>
                            <span className="text-xs text-slate-500 mt-1">
                                {hojeTotal > 0 ? Math.round((hojeOk/hojeTotal)*100) : 0}% de eficiência hoje
                            </span>
                        </div>
                     )}
                </CardContent>
            </Card>

            {/* Card 3: Equipe Ativa */}
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-bold uppercase text-slate-500">Equipe Disponível</CardTitle>
                    <Users className="w-5 h-5 text-purple-500" />
                </CardHeader>
                <CardContent>
                     {loading ? <Skeleton className="h-8 w-20" /> : (
                        <div className="flex flex-col">
                            <span className="text-3xl font-black text-slate-900 dark:text-white">{ativosAgora}</span>
                            <span className="text-xs text-slate-500 mt-1">Técnicos cadastrados ativos</span>
                        </div>
                     )}
                </CardContent>
            </Card>
        </div>

        {/* Atalhos Operacionais */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/scanner" className="col-span-1">
                <Card className="hover:border-blue-500 transition-colors cursor-pointer bg-slate-50 dark:bg-slate-900/50 border-dashed">
                    <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-2">
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-full text-blue-600">
                            <Zap className="w-6 h-6" />
                        </div>
                        <span className="font-bold text-slate-700 dark:text-slate-200">Novo Registro</span>
                    </CardContent>
                </Card>
            </Link>
            <Link href="/tecnicos" className="col-span-1">
                <Card className="hover:border-purple-500 transition-colors cursor-pointer bg-slate-50 dark:bg-slate-900/50 border-dashed">
                    <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-2">
                        <div className="p-3 bg-purple-100 dark:bg-purple-900/20 rounded-full text-purple-600">
                            <Users className="w-6 h-6" />
                        </div>
                        <span className="font-bold text-slate-700 dark:text-slate-200">Gerenciar Equipe</span>
                    </CardContent>
                </Card>
            </Link>
            {/* Espaços para futuros atalhos */}
        </div>

        {/* Feed de Atividade Recente (O "Pulso" da fábrica) */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <CardHeader>
                <CardTitle className="text-lg">Feed de Produção</CardTitle>
                <CardDescription>Últimos registros de saída de linha.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {loading ? (
                         <div className="p-4 space-y-3"><Skeleton className="h-12"/><Skeleton className="h-12"/></div>
                    ) : ultimasAtividades.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">Sem atividades hoje.</div>
                    ) : (
                        ultimasAtividades.map((moto) => (
                            <div key={moto.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-full ${
                                        moto.status === 'estoque' ? 'bg-green-100 text-green-600' :
                                        moto.status === 'reprovado' ? 'bg-red-100 text-red-600' :
                                        'bg-slate-100 text-slate-600'
                                    }`}>
                                        <Wrench className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-900 dark:text-white">{moto.modelo}</p>
                                        <p className="text-xs text-slate-500 font-mono">{moto.sku}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <Badge variant={moto.status === 'estoque' ? 'default' : 'destructive'} className={moto.status === 'estoque' ? 'bg-green-600' : ''}>
                                        {moto.status.toUpperCase()}
                                    </Badge>
                                    <p className="text-xs text-slate-400 mt-1 flex items-center justify-end gap-1">
                                        <Clock className="w-3 h-3" />
                                        {new Date(moto.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}