"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { ShieldAlert, Search, Clock, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

type Log = {
  id: string;
  created_at: string;
  acao: string;
  alvo: string;
  autor: { nome: string; cargo: string } | null;
  detalhes: any;
};

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    setLoading(true);
    const { data } = await supabase
      .from('logs_sistema')
      .select(`*, autor:funcionarios(nome, cargo)`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) setLogs(data as any);
    setLoading(false);
  }

  const logsFiltrados = logs.filter(log => 
    log.acao.toLowerCase().includes(busca.toLowerCase()) ||
    (log.alvo && log.alvo.toLowerCase().includes(busca.toLowerCase())) ||
    (log.autor && log.autor.nome.toLowerCase().includes(busca.toLowerCase()))
  );

  return (
    <RoleGuard allowedRoles={['master']}>
      <div className="space-y-6 animate-in fade-in duration-500 pb-10">
        
        {/* CABEÇALHO */}
        <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
               <ShieldAlert className="w-8 h-8 text-purple-600" /> Auditoria & Logs
            </h1>
            <p className="text-slate-500 dark:text-slate-400">Rastreabilidade completa de ações administrativas.</p>
          </div>
          <Badge variant="outline" className="text-xs font-mono text-slate-500 dark:text-slate-400 hidden md:flex">
            {logs.length} eventos recentes
          </Badge>
        </div>

        {/* BARRA DE BUSCA (Adaptativa) */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input 
                placeholder="Buscar por ação (ex: ARQUIVAMENTO), autor ou alvo..." 
                className="pl-10 h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:border-purple-500 transition-colors"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
           </div>
        </div>

        {/* LISTA DE LOGS */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
           <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 py-4">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">Linha do Tempo</CardTitle>
           </CardHeader>
           <CardContent className="p-0">
              {loading ? (
                 <div className="p-6 space-y-4">
                    {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl bg-slate-100 dark:bg-slate-800" />)}
                 </div>
              ) : (
                 <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {logsFiltrados.length === 0 ? (
                       <div className="p-12 text-center text-slate-400 flex flex-col items-center">
                          <FileText className="w-12 h-12 mb-2 opacity-20" />
                          <p>Nenhum registro encontrado.</p>
                       </div>
                    ) : (
                       logsFiltrados.map((log) => (
                          <div key={log.id} className="p-4 flex flex-col md:flex-row md:items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                             
                             {/* DATA E HORA */}
                             <div className="flex flex-row md:flex-col items-center md:items-start gap-2 md:gap-0 min-w-[100px]">
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                   {new Date(log.created_at).toLocaleDateString('pt-BR')}
                                </span>
                                <span className="text-xs text-slate-400 font-mono hidden md:block">
                                   {new Date(log.created_at).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}
                                </span>
                             </div>

                             {/* ÍCONE DA AÇÃO (Colorido e Adaptativo) */}
                             <div className={`p-3 rounded-xl shrink-0 transition-colors ${
                                log.acao === 'ARQUIVAMENTO' ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400' :
                                log.acao === 'EDICAO' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' :
                                'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                             }`}>
                                {log.acao === 'ARQUIVAMENTO' ? <ShieldAlert className="w-5 h-5"/> : <Clock className="w-5 h-5"/>}
                             </div>

                             {/* DETALHES */}
                             <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* BADGE DE AÇÃO HARMONIZADO */}
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase tracking-wide ${
                                        log.acao === 'ARQUIVAMENTO' ? 'border-red-200 text-red-700 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400' :
                                        log.acao === 'EDICAO' ? 'border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400' :
                                        'border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-400'
                                    }`}>
                                        {log.acao}
                                    </span>
                                    <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                       {log.alvo}
                                    </span>
                                </div>
                                
                                <div className="flex items-center gap-2 mt-1.5">
                                   <Avatar className="w-4 h-4">
                                      <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${log.autor?.nome || 'S'}`} />
                                      <AvatarFallback className="text-[9px]">U</AvatarFallback>
                                   </Avatar>
                                   <p className="text-xs text-slate-500">
                                      Feito por: <span className="font-bold text-slate-700 dark:text-slate-300">{log.autor?.nome || 'Sistema'}</span>
                                   </p>
                                </div>
                             </div>
                             
                             {/* ID DO LOG */}
                             <Badge variant="outline" className="font-mono text-[10px] text-slate-400 border-slate-200 dark:border-slate-800 hidden md:flex">
                                LOG-{log.id.slice(0,8)}
                             </Badge>
                          </div>
                       ))
                    )}
                 </div>
              )}
           </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}