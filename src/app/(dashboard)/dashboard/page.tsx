"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  Activity, Users, Wrench, ClipboardCheck, 
  Warehouse, AlertOctagon, TrendingUp, Clock, ArrowRight, Target
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    montagem: 0,
    qualidade: 0,
    avarias: 0,
    estoque: 0,
    produzidoHoje: 0
  });
  const [linhaAtiva, setLinhaAtiva] = useState<any[]>([]);
  const [metaDiaria] = useState(50); // Exemplo de meta fixa ou vinda do banco

  useEffect(() => {
    fetchDados();
    const interval = setInterval(fetchDados, 10000); // Atualiza a cada 10s
    return () => clearInterval(interval);
  }, []);

  async function fetchDados() {
    // 1. Buscas Paralelas para Performance
    const hoje = new Date().toISOString().split('T')[0];
    
    const [
      { count: cMontagem },
      { count: cQualidade },
      { count: cAvarias },
      { count: cEstoque },
      { count: cHoje },
      { data: ativos }
    ] = await Promise.all([
      supabase.from('motos').select('*', { count: 'exact', head: true }).eq('status', 'em_producao'),
      supabase.from('motos').select('*', { count: 'exact', head: true }).eq('status', 'em_analise'),
      supabase.from('motos').select('*', { count: 'exact', head: true }).like('status', 'avaria_%'),
      supabase.from('motos').select('*', { count: 'exact', head: true }).eq('status', 'estoque'),
      supabase.from('motos').select('*', { count: 'exact', head: true }).gte('created_at', `${hoje}T00:00:00`),
      // Busca quem está trabalhando agora
      supabase.from('motos')
        .select(`modelo, sku, inicio_montagem, montador:funcionarios!motos_montador_id_fkey(nome)`)
        .eq('status', 'em_producao')
        .order('inicio_montagem', { ascending: true })
    ]);

    setStats({
      montagem: cMontagem || 0,
      qualidade: cQualidade || 0,
      avarias: cAvarias || 0,
      estoque: cEstoque || 0,
      produzidoHoje: cHoje || 0
    });

    if (ativos) setLinhaAtiva(ativos);
    setLoading(false);
  }

  // Calculo de progresso da meta
  const progresso = Math.min((stats.produzidoHoje / metaDiaria) * 100, 100);

  return (
    <RoleGuard allowedRoles={['gestor', 'master', 'supervisor']}>
      <div className="space-y-8 animate-in fade-in pb-20">
        
        {/* Header com Saudação e Meta */}
        <div className="flex flex-col md:flex-row justify-between items-end gap-6">
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Torre de Controle <span className="text-blue-600">SGM</span>
            </h1>
            <p className="text-slate-500 mt-1">Visão geral da operação em tempo real.</p>
          </div>
          
          <Card className="w-full md:w-96 border-blue-100 bg-blue-50/50 dark:bg-slate-900 dark:border-slate-800">
            <CardContent className="p-4 py-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold uppercase text-blue-600 flex items-center gap-1">
                  <Target className="w-3 h-3"/> Meta Diária
                </span>
                <span className="text-sm font-bold">{stats.produzidoHoje} / {metaDiaria} motos</span>
              </div>
              <Progress value={progresso} className="h-2 bg-blue-200" />
            </CardContent>
          </Card>
        </div>

        {/* KPIs Principais (Cards Coloridos) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-all">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-medium text-slate-500 uppercase">Em Montagem</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-black text-slate-900 dark:text-white">{stats.montagem}</span>
                <Wrench className="w-8 h-8 text-blue-100 dark:text-blue-900/30" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-all">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-medium text-slate-500 uppercase">Inspeção QA</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-black text-slate-900 dark:text-white">{stats.qualidade}</span>
                <ClipboardCheck className="w-8 h-8 text-purple-100 dark:text-purple-900/30" />
              </div>
            </CardContent>
          </Card>

          <Card className={`border-l-4 ${stats.avarias > 0 ? 'border-l-red-500 bg-red-50/30' : 'border-l-green-500'} shadow-sm hover:shadow-md transition-all`}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-medium text-slate-500 uppercase">Pátio Avarias</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex items-center justify-between">
                <span className={`text-3xl font-black ${stats.avarias > 0 ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>
                  {stats.avarias}
                </span>
                <AlertOctagon className={`w-8 h-8 ${stats.avarias > 0 ? 'text-red-200' : 'text-green-100 dark:text-green-900/30'}`} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-all">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-medium text-slate-500 uppercase">Estoque Final</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-black text-slate-900 dark:text-white">{stats.estoque}</span>
                <Warehouse className="w-8 h-8 text-emerald-100 dark:text-emerald-900/30" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* PAINEL DA LINHA AO VIVO */}
          <Card className="lg:col-span-2 border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-500" /> Linha de Montagem Ao Vivo
              </CardTitle>
              <CardDescription>Monitoramento em tempo real dos boxes ativos.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full"/>)}</div>
              ) : linhaAtiva.length === 0 ? (
                <div className="text-center py-10 text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed">
                  <Wrench className="w-10 h-10 mx-auto mb-2 opacity-20"/>
                  <p>Nenhuma montagem ativa no momento.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {linhaAtiva.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-4 bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm relative overflow-hidden">
                      {/* Efeito de Pulso */}
                      <div className="absolute top-0 right-0 p-2">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                        </span>
                      </div>
                      
                      <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600">
                        {item.montador?.nome.substring(0,2).toUpperCase()}
                      </div>
                      
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white leading-none">{item.modelo}</p>
                        <p className="text-xs text-slate-500 font-mono mt-1">{item.sku}</p>
                        <div className="flex items-center gap-1 mt-2 text-[10px] text-blue-600 font-bold bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded w-fit">
                           <Clock className="w-3 h-3"/> Iniciado {new Date(item.inicio_montagem).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* AÇÕES RÁPIDAS E STATUS DO SISTEMA */}
          <div className="space-y-6">
            
            {/* Atalhos */}
            <Card>
              <CardHeader><CardTitle className="text-base">Acesso Rápido</CardTitle></CardHeader>
              <CardContent className="grid gap-3">
                <Link href="/montagem">
                  <Button variant="outline" className="w-full justify-between h-12">
                    <span className="flex items-center gap-2"><Wrench className="w-4 h-4"/> Nova Montagem</span>
                    <ArrowRight className="w-4 h-4 opacity-50"/>
                  </Button>
                </Link>
                <Link href="/avarias">
                  <Button variant="outline" className="w-full justify-between h-12 text-red-600 hover:text-red-700 hover:bg-red-50">
                    <span className="flex items-center gap-2"><AlertOctagon className="w-4 h-4"/> Gestão de Avarias</span>
                    <ArrowRight className="w-4 h-4 opacity-50"/>
                  </Button>
                </Link>
                <Link href="/relatorios">
                  <Button variant="outline" className="w-full justify-between h-12">
                    <span className="flex items-center gap-2"><TrendingUp className="w-4 h-4"/> Relatórios BI</span>
                    <ArrowRight className="w-4 h-4 opacity-50"/>
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Status Avarias */}
            {stats.avarias > 0 && (
              <Card className="bg-red-600 text-white border-none shadow-lg animate-pulse">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <AlertOctagon className="w-8 h-8 text-white/80" />
                    <div>
                      <h3 className="font-bold text-lg">Atenção Necessária</h3>
                      <p className="text-white/90 text-sm mt-1">
                        Existem <strong>{stats.avarias} motos</strong> paradas no pátio de avarias aguardando reparo urgente.
                      </p>
                      <Link href="/avarias">
                        <Button size="sm" className="mt-4 bg-white text-red-600 hover:bg-red-50 font-bold border-0">
                          Resolver Agora
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

          </div>
        </div>

      </div>
    </RoleGuard>
  );
}