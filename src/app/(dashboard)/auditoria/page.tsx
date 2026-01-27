"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  ShieldAlert, Search, FileJson, Calendar, User, 
  Filter, Download, AlertTriangle, CheckCircle2, Info, PlusCircle, Trash2, Edit
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type LogSistema = {
  id: string;
  acao: string;
  alvo: string;
  detalhes: any; // JSONB
  created_at: string;
  autor: {
    nome: string;
    cargo: string;
    email: string;
  } | null;
};

export default function AuditoriaPage() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogSistema[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroAcao, setFiltroAcao] = useState("todos");

  useEffect(() => {
    fetchLogs();
  }, [filtroAcao]);

  async function fetchLogs() {
    setLoading(true);
    
    let query = supabase
      .from('logs_sistema')
      .select(`
        *,
        autor:funcionarios(nome, cargo, email)
      `)
      .order('created_at', { ascending: false })
      .limit(100); // Traz os últimos 100 para performance

    if (filtroAcao !== 'todos') {
        query = query.eq('acao', filtroAcao);
    }

    const { data, error } = await query;

    if (error) {
      toast.error("Erro ao carregar auditoria.");
    } else {
      setLogs(data as LogSistema[]);
    }
    setLoading(false);
  }

  // Filtragem local por texto (Nome ou Alvo)
  const logsFiltrados = logs.filter(log => 
    log.autor?.nome.toLowerCase().includes(busca.toLowerCase()) ||
    log.alvo.toLowerCase().includes(busca.toLowerCase()) ||
    JSON.stringify(log.detalhes).toLowerCase().includes(busca.toLowerCase())
  );

  // Helper de UI para Tipos de Ação
  const getActionStyle = (acao: string) => {
      switch(acao) {
          case 'LOGIN': return { icon: User, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' };
          case 'CADASTRO': return { icon: PlusCircle, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' };
          case 'EDICAO': return { icon: Edit, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' };
          case 'EXCLUSAO': return { icon: Trash2, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' };
          case 'ARQUIVAMENTO': return { icon: Trash2, color: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-800' };
          case 'PAUSA': return { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20' };
          default: return { icon: Info, color: 'text-slate-500', bg: 'bg-slate-50 dark:bg-slate-800' };
      }
  };

  const handleExportCSV = () => {
    if (logsFiltrados.length === 0) return toast.warning("Nada para exportar");
    
    const headers = ["Data", "Hora", "Autor", "Cargo", "Ação", "Alvo", "Detalhes"];
    const rows = logsFiltrados.map(log => [
        new Date(log.created_at).toLocaleDateString(),
        new Date(log.created_at).toLocaleTimeString(),
        log.autor?.nome || 'Sistema',
        log.autor?.cargo || '-',
        log.acao,
        log.alvo,
        JSON.stringify(log.detalhes).replace(/"/g, '""') // Escape quotes
    ]);

    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `auditoria_shineray_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
  };

  return (
    <RoleGuard allowedRoles={['master', 'gestor']}>
      <div className="space-y-6 animate-in fade-in pb-20">
        
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-2">
               <ShieldAlert className="w-8 h-8 text-red-600" /> Auditoria
            </h1>
            <p className="text-slate-500">Rastreabilidade de segurança e ações sensíveis.</p>
          </div>
          <Button variant="outline" onClick={handleExportCSV} className="border-slate-200 dark:border-slate-800">
             <Download className="w-4 h-4 mr-2" /> Exportar CSV
          </Button>
        </div>

        {/* Filtros */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-4 shadow-sm">
           <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Buscar por nome, alvo ou detalhe..." 
                className="pl-10 h-11"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
           </div>
           
           <Select value={filtroAcao} onValueChange={setFiltroAcao}>
              <SelectTrigger className="w-full md:w-[200px] h-11">
                 <div className="flex items-center">
                    <Filter className="w-4 h-4 mr-2 text-slate-500" />
                    <SelectValue placeholder="Tipo de Ação" />
                 </div>
              </SelectTrigger>
              <SelectContent>
                 <SelectItem value="todos">Todas Ações</SelectItem>
                 <SelectItem value="LOGIN">Acesso (Login)</SelectItem>
                 <SelectItem value="CADASTRO">Novos Registros</SelectItem>
                 <SelectItem value="EDICAO">Alterações</SelectItem>
                 <SelectItem value="PAUSA">Pausas de Produção</SelectItem>
                 <SelectItem value="EXCLUSAO">Exclusões</SelectItem>
              </SelectContent>
           </Select>
        </div>

        {/* Tabela de Logs */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
           <CardHeader>
               <CardTitle>Histórico de Eventos</CardTitle>
           </CardHeader>
           <CardContent className="p-0">
               {loading ? (
                   <div className="p-8 space-y-4">
                       {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                   </div>
               ) : (
                   <div className="rounded-md border-t border-slate-100 dark:border-slate-800">
                       <Table>
                           <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                               <TableRow>
                                   <TableHead>Ação</TableHead>
                                   <TableHead>Responsável</TableHead>
                                   <TableHead>Alvo / Contexto</TableHead>
                                   <TableHead>Data</TableHead>
                                   <TableHead className="text-right">Detalhes</TableHead>
                               </TableRow>
                           </TableHeader>
                           <TableBody>
                               {logsFiltrados.length === 0 ? (
                                   <TableRow>
                                       <TableCell colSpan={5} className="text-center py-10 text-slate-400">
                                           Nenhum registro encontrado.
                                       </TableCell>
                                   </TableRow>
                               ) : (
                                   logsFiltrados.map((log) => {
                                       const style = getActionStyle(log.acao);
                                       const Icon = style.icon;
                                       
                                       return (
                                           <TableRow key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                               <TableCell>
                                                   <div className="flex items-center gap-3">
                                                       <div className={`p-2 rounded-lg ${style.bg} ${style.color}`}>
                                                           <Icon className="w-4 h-4" />
                                                       </div>
                                                       <span className="font-bold text-xs uppercase tracking-wide text-slate-700 dark:text-slate-300">
                                                           {log.acao}
                                                       </span>
                                                   </div>
                                               </TableCell>
                                               <TableCell>
                                                   <div className="flex flex-col">
                                                       <span className="font-medium text-slate-900 dark:text-white">
                                                           {log.autor?.nome || 'Sistema'}
                                                       </span>
                                                       <span className="text-[10px] text-slate-500 uppercase font-bold">
                                                           {log.autor?.cargo || 'Automático'}
                                                       </span>
                                                   </div>
                                               </TableCell>
                                               <TableCell>
                                                   <Badge variant="outline" className="font-mono text-xs text-slate-600 dark:text-slate-400">
                                                       {log.alvo}
                                                   </Badge>
                                               </TableCell>
                                               <TableCell>
                                                   <div className="flex flex-col text-sm text-slate-500">
                                                       <span>{format(new Date(log.created_at), "dd/MM/yyyy")}</span>
                                                       <span className="text-xs opacity-70">
                                                           {format(new Date(log.created_at), "HH:mm:ss")}
                                                       </span>
                                                   </div>
                                               </TableCell>
                                               <TableCell className="text-right">
                                                   <Dialog>
                                                       <DialogTrigger asChild>
                                                           <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                               <FileJson className="w-4 h-4 text-slate-400 hover:text-blue-500" />
                                                           </Button>
                                                       </DialogTrigger>
                                                       <DialogContent className="max-w-xl">
                                                           <DialogHeader>
                                                               <DialogTitle className="flex items-center gap-2">
                                                                   <FileJson className="w-5 h-5" /> Payload do Evento
                                                               </DialogTitle>
                                                           </DialogHeader>
                                                           <div className="bg-slate-950 text-slate-50 p-4 rounded-lg font-mono text-xs overflow-auto max-h-[400px]">
                                                               <pre>{JSON.stringify(log.detalhes, null, 2)}</pre>
                                                           </div>
                                                           <div className="text-xs text-slate-500 mt-2">
                                                               ID do Log: {log.id}
                                                           </div>
                                                       </DialogContent>
                                                   </Dialog>
                                               </TableCell>
                                           </TableRow>
                                       );
                                   })
                               )}
                           </TableBody>
                       </Table>
                   </div>
               )}
           </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}