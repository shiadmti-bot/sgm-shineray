"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  Activity, Clock, Users, Wrench, ArrowRight, Zap, CheckCircle2, 
  Package, ClipboardCheck, AlertTriangle 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  
  // KPIs Operacionais
  const [filaEspera, setFilaEspera] = useState(0);
  const [emProducao, setEmProducao] = useState(0);
  const [emAnalise, setEmAnalise] = useState(0);
  const [aprovadasHoje, setAprovadasHoje] = useState(0);
  
  // Feed
  const [ultimasAtividades, setUltimasAtividades] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
    // Auto-refresh a cada 30s
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchDashboardData() {
    // 1. Definição de "Hoje" para contagem de produção
    const inicioDia = new Date();
    inicioDia.setHours(0,0,0,0);

    // 2. Buscas Paralelas (Muito mais rápido)
    const [resFila, resProd, resAnalise, resHoje, resFeed] = await Promise.all([
        // Fila: Caixas que chegaram e ninguém pegou
        supabase.from('motos').select('*', { count: 'exact', head: true }).eq('status', 'aguardando_montagem'),
        
        // Produção: Sendo montadas AGORA (inclui retrabalho)
        supabase.from('motos').select('*', { count: 'exact', head: true }).in('status', ['em_producao', 'retrabalho_montagem']),
        
        // Análise: Montadas esperando Supervisor
        supabase.from('motos').select('*', { count: 'exact', head: true }).eq('status', 'em_analise'),
        
        // Aprovadas: Finalizadas HOJE
        supabase.from('motos').select('*', { count: 'exact', head: true }).eq('status', 'aprovado').gte('updated_at', inicioDia.toISOString()),

        // Feed: Últimas 5 movimentações quaisquer
        supabase.from('motos').select('*').order('updated_at', { ascending: false }).limit(5)
    ]);

    setFilaEspera(resFila.count || 0);
    setEmProducao(resProd.count || 0);
    setEmAnalise(resAnalise.count || 0);
    setAprovadasHoje(resHoje.count || 0);
    
    if (resFeed.data) setUltimasAtividades(resFeed.data);
    
    setLoading(false);
  }

  // Helper para cor do status no Feed
  const getStatusColor = (status: string) => {
      if (status === 'aprovado') return 'bg-green-600 hover:bg-green-700';
      if (status === 'em_analise') return 'bg-purple-600 hover:bg-purple-700';
      if (status.includes('avaria')) return 'bg-red-600 hover:bg-red-700';
      if (status === 'retrabalho_montagem') return 'bg-amber-600 hover:bg-amber-700';
      return 'bg-slate-500';
  };

  return (
    <RoleGuard allowedRoles={['gestor', 'master', 'supervisor']}>
      <div className="space-y-6 animate-in fade-in duration-500 pb-10">
        
        {/* Header Compacto */}
        <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Centro de Controle</h1>
              <p className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                 <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                 </span>
                 Monitoramento em Tempo Real
              </p>
            </div>
            <Link href="/relatorios">
                <Button variant="outline" className="gap-2 hidden md:flex">
                    Relatórios Detalhados <ArrowRight className="w-4 h-4" />
                </Button>
            </Link>
        </div>

        {/* PIPELINE DE PRODUÇÃO (4 Estágios) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* 1. Entrada/Fila */}
            <Card className="bg-white dark:bg-slate-950 border-l-4 border-l-slate-400 shadow-sm relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Package className="w-16 h-16" /></div>
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold uppercase text-slate-500 tracking-wider">1. Aguardando Montagem</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? <Skeleton className="h-10 w-20" /> : (
                        <div className="flex items-end gap-2">
                            <span className="text-4xl font-black text-slate-700 dark:text-slate-200">{filaEspera}</span>
                            <span className="text-sm font-medium text-slate-400 mb-1">caixas</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* 2. Em Produção */}
            <Card className="bg-white dark:bg-slate-900 border-l-4 border-l-blue-500 shadow-sm relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Wrench className="w-16 h-16 text-blue-500" /></div>
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold uppercase text-blue-600 tracking-wider">2. Em Montagem</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? <Skeleton className="h-10 w-20" /> : (
                        <div className="flex items-end gap-2">
                            <span className="text-4xl font-black text-slate-900 dark:text-white">{emProducao}</span>
                            <span className="text-sm font-medium text-slate-400 mb-1">motos ativas</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* 3. Controle de Qualidade */}
            <Card className="bg-white dark:bg-slate-900 border-l-4 border-l-purple-500 shadow-sm relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><ClipboardCheck className="w-16 h-16 text-purple-500" /></div>
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold uppercase text-purple-600 tracking-wider">3. Em Análise (QA)</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? <Skeleton className="h-10 w-20" /> : (
                        <div className="flex items-end gap-2">
                            <span className="text-4xl font-black text-slate-900 dark:text-white">{emAnalise}</span>
                            <span className="text-sm font-medium text-slate-400 mb-1">para inspeção</span>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* 4. Aprovadas Hoje */}
            <Card className="bg-green-600 border-0 text-white shadow-lg shadow-green-900/20 relative overflow-hidden">
                <div className="absolute right-0 top-0 p-4 opacity-20"><CheckCircle2 className="w-20 h-20" /></div>
                <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold uppercase text-green-100 tracking-wider">4. Produção (Hoje)</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? <Skeleton className="h-10 w-20 bg-white/20" /> : (
                        <div className="flex items-end gap-2">
                            <span className="text-5xl font-black">{aprovadasHoje}</span>
                            <span className="text-lg font-medium opacity-90 mb-1">OK</span>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>

        {/* Atalhos Operacionais (Acesso Rápido às Filas) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/scanner" className="col-span-1">
                <Card className="hover:border-slate-400 transition-colors cursor-pointer bg-slate-50 dark:bg-slate-900/50 border-dashed group">
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-2">
                        <div className="p-3 bg-white dark:bg-slate-800 rounded-full text-slate-600 group-hover:scale-110 transition-transform shadow-sm">
                            <Zap className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-sm text-slate-600 dark:text-slate-300">Scanner Entrada</span>
                    </CardContent>
                </Card>
            </Link>
            <Link href="/montagem" className="col-span-1">
                <Card className="hover:border-blue-500 transition-colors cursor-pointer bg-blue-50/50 dark:bg-blue-900/10 border-dashed group border-blue-200 dark:border-blue-900/50">
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-2">
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600 group-hover:scale-110 transition-transform shadow-sm">
                            <Wrench className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-sm text-blue-700 dark:text-blue-300">Linha de Montagem</span>
                    </CardContent>
                </Card>
            </Link>
            <Link href="/qualidade" className="col-span-1">
                <Card className="hover:border-purple-500 transition-colors cursor-pointer bg-purple-50/50 dark:bg-purple-900/10 border-dashed group border-purple-200 dark:border-purple-900/50">
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-2">
                        <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full text-purple-600 group-hover:scale-110 transition-transform shadow-sm">
                            <ClipboardCheck className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-sm text-purple-700 dark:text-purple-300">Controle Qualidade</span>
                    </CardContent>
                </Card>
            </Link>
            <Link href="/tecnicos" className="col-span-1">
                <Card className="hover:border-slate-400 transition-colors cursor-pointer bg-slate-50 dark:bg-slate-900/50 border-dashed group">
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-2">
                        <div className="p-3 bg-white dark:bg-slate-800 rounded-full text-slate-600 group-hover:scale-110 transition-transform shadow-sm">
                            <Users className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-sm text-slate-600 dark:text-slate-300">Gestão Equipe</span>
                    </CardContent>
                </Card>
            </Link>
        </div>

        {/* Feed de Atividade Recente */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-4">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">Últimas Movimentações</CardTitle>
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
                                    <div className={`p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500`}>
                                        {moto.status.includes('avaria') ? <AlertTriangle className="w-4 h-4 text-red-500" /> :
                                         moto.status === 'aprovado' ? <CheckCircle2 className="w-4 h-4 text-green-500" /> :
                                         <Activity className="w-4 h-4" />}
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-900 dark:text-white text-sm">{moto.modelo}</p>
                                        <p className="text-xs text-slate-500 font-mono">{moto.sku}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <Badge className={`${getStatusColor(moto.status)} text-white border-0`}>
                                        {moto.status.replace('_', ' ').toUpperCase()}
                                    </Badge>
                                    <p className="text-xs text-slate-400 mt-1 flex items-center justify-end gap-1">
                                        <Clock className="w-3 h-3" />
                                        {new Date(moto.updated_at || moto.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
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