"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  ShieldAlert, Search, FileJson, User, 
  Filter, Download, AlertTriangle, CheckCircle2, Info, PlusCircle, Trash2, Edit,
  Wrench, ScanBarcode, LogIn, LogOut, Printer
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

// Tipo alinhado com o banco atual
type LogSistema = {
  id: string;
  acao: string;
  usuario: string; // Nome direto (snapshot)
  referencia: string; // SKU ou ID
  detalhes: any; // JSONB
  created_at: string;
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
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100); 

    if (filtroAcao !== 'todos') {
        // Filtro parcial para agrupar tipos (Ex: PAUSA pega SOLICITADA e APROVADA)
        if (filtroAcao === 'PAUSA') query = query.ilike('acao', '%PAUSA%');
        else if (filtroAcao === 'QA') query = query.ilike('acao', '%QA%');
        else query = query.eq('acao', filtroAcao);
    }

    const { data, error } = await query;

    if (error) {
      toast.error("Erro ao carregar auditoria.");
    } else {
      setLogs(data as LogSistema[]);
    }
    setLoading(false);
  }

  const logsFiltrados = logs.filter(log => 
    log.usuario?.toLowerCase().includes(busca.toLowerCase()) ||
    log.referencia?.toLowerCase().includes(busca.toLowerCase()) ||
    log.acao.toLowerCase().includes(busca.toLowerCase()) ||
    JSON.stringify(log.detalhes).toLowerCase().includes(busca.toLowerCase())
  );

  // Helper Visual Expandido (V2.0)
  const getActionStyle = (acao: string) => {
      if (acao.includes('LOGIN')) return { icon: LogIn, color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30' };
      if (acao.includes('LOGOUT')) return { icon: LogOut, color: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-800' };
      
      if (acao.includes('CADASTRO') || acao.includes('ENTRADA')) return { icon: PlusCircle, color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30' };
      if (acao.includes('EDICAO')) return { icon: Edit, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' };
      if (acao.includes('EXCLUSAO')) return { icon: Trash2, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' };
      
      if (acao.includes('PAUSA')) return { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/30' };
      
      // Novos Fluxos V2.0
      if (acao === 'APROVACAO_QA') return { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30' };
      if (acao.includes('REPROVACAO') || acao.includes('RETRABALHO')) return { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' };
      if (acao.includes('REPARO')) return { icon: Wrench, color: 'text-indigo-600', bg: 'bg-indigo-100 dark:bg-indigo-900/30' };
      if (acao === 'IMPRESSAO_ETIQUETA') return { icon: Printer, color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30' };

      return { icon: Info, color: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-800' };
  };

  const handleExportCSV = () => {
    if (logsFiltrados.length === 0) return toast.warning("Nada para exportar");
    
    const headers = ["Data", "Hora", "Usuário", "Ação", "Referência (SKU)", "Detalhes"];
    const rows = logsFiltrados.map(log => [
        new Date(log.created_at).toLocaleDateString(),
        new Date(log.created_at).toLocaleTimeString(),
        log.usuario,
        log.acao,
        log.referencia || '-',
        JSON.stringify(log.detalhes).replace(/"/g, '""')
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
               <ShieldAlert className="w-8 h-8 text-red-600" /> Auditoria de Eventos
            </h1>
            <p className="text-slate-500">Registro imutável de todas as ações críticas do sistema.</p>
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
                placeholder="Buscar por usuário, SKU ou tipo de erro..." 
                className="pl-10 h-11"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
           </div>
           
           <Select value={filtroAcao} onValueChange={setFiltroAcao}>
              <SelectTrigger className="w-full md:w-[220px] h-11">
                 <div className="flex items-center">
                    <Filter className="w-4 h-4 mr-2 text-slate-500" />
                    <SelectValue placeholder="Tipo de Ação" />
                 </div>
              </SelectTrigger>
              <SelectContent>
                 <SelectItem value="todos">Todos Eventos</SelectItem>
                 <SelectItem value="LOGIN">Acessos (Login)</SelectItem>
                 <SelectItem value="PAUSA">Pausas de Linha</SelectItem>
                 <SelectItem value="QA">Qualidade e Reparo</SelectItem>
                 <SelectItem value="EXCLUSAO">Segurança (Exclusões)</SelectItem>
              </SelectContent>
           </Select>
        </div>

        {/* Tabela de Logs */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
           <CardHeader>
               <CardTitle>Histórico Recente</CardTitle>
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
                                   <TableHead>Evento</TableHead>
                                   <TableHead>Usuário</TableHead>
                                   <TableHead>Referência (SKU)</TableHead>
                                   <TableHead>Data/Hora</TableHead>
                                   <TableHead className="text-right">Metadados</TableHead>
                               </TableRow>
                           </TableHeader>
                           <TableBody>
                               {logsFiltrados.length === 0 ? (
                                   <TableRow>
                                       <TableCell colSpan={5} className="text-center py-10 text-slate-400">
                                           Nenhum registro encontrado com os filtros atuais.
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
                                                           {log.acao.replace('_', ' ')}
                                                       </span>
                                                   </div>
                                               </TableCell>
                                               <TableCell>
                                                   <div className="flex flex-col">
                                                       <span className="font-medium text-slate-900 dark:text-white">
                                                           {log.usuario}
                                                       </span>
                                                   </div>
                                               </TableCell>
                                               <TableCell>
                                                   {log.referencia ? (
                                                       <Badge variant="outline" className="font-mono text-xs text-slate-600 dark:text-slate-400 flex w-fit items-center gap-1">
                                                           <ScanBarcode className="w-3 h-3"/> {log.referencia}
                                                       </Badge>
                                                   ) : <span className="text-slate-400">-</span>}
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
                                                       <DialogContent className="max-w-xl bg-white dark:bg-slate-900 border-slate-200">
                                                           <DialogHeader>
                                                               <DialogTitle className="flex items-center gap-2">
                                                                   <ShieldAlert className="w-5 h-5 text-red-500" /> Detalhes da Auditoria
                                                               </DialogTitle>
                                                           </DialogHeader>
                                                           
                                                           <div className="space-y-4">
                                                               <div className="grid grid-cols-2 gap-4 text-sm">
                                                                   <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded border">
                                                                       <p className="text-xs font-bold uppercase text-slate-500">ID do Evento</p>
                                                                       <p className="font-mono">{log.id}</p>
                                                                   </div>
                                                                   <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded border">
                                                                       <p className="text-xs font-bold uppercase text-slate-500">Dispositivo</p>
                                                                       <p className="truncate" title={log.detalhes?._meta?.userAgent}>
                                                                           {log.detalhes?._meta?.userAgent || 'Não identificado'}
                                                                       </p>
                                                                   </div>
                                                               </div>

                                                               <div>
                                                                   <p className="text-xs font-bold uppercase text-slate-500 mb-2">Payload Completo (JSON)</p>
                                                                   <div className="bg-slate-950 text-slate-50 p-4 rounded-lg font-mono text-xs overflow-auto max-h-[300px] border border-slate-800">
                                                                       <pre>{JSON.stringify(log.detalhes, null, 2)}</pre>
                                                                   </div>
                                                               </div>
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