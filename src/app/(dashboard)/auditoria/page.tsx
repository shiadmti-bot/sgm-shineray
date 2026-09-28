"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/sgm/PageHeader";
import {
  ShieldAlert, Search, FileJson, Filter, Download, AlertTriangle, CheckCircle2, Info, PlusCircle, Trash2, Edit,
  Wrench, ScanBarcode, LogIn, LogOut, Printer, Calendar, Loader2, Settings, Archive, KeyRound, ShieldX, Truck, Undo2, Play
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format, subDays } from "date-fns";
import { lerDetalhesLog } from "@/lib/logger";
import { rotuloAcao } from "@/lib/eventos";
import { dataInputParaISO } from "@/lib/datas";

// Tipo alinhado com o banco atual
type LogSistema = {
  id: string;
  acao: string;
  usuario: string; // Nome direto (snapshot)
  referencia: string; // SKU ou ID
  detalhes: unknown; // JSONB ou texto JSON
  created_at: string;
};

type LogProcessado = LogSistema & { dados: Record<string, unknown> };

const TAMANHO_PAGINA = 200;

// Filtros disponíveis (valor: filtro aplicado no banco)
const GRUPOS_FILTRO: { grupo: string; itens: { valor: string; rotulo: string }[] }[] = [
  { grupo: "Acesso", itens: [
    { valor: "LOGIN", rotulo: "Logins" },
    { valor: "LOGIN_FALHA", rotulo: "Tentativas de login falhas" },
    { valor: "LOGOUT", rotulo: "Saídas do sistema" },
  ]},
  { grupo: "Produção", itens: [
    { valor: "ENTRADA_ESTOQUE", rotulo: "Entradas (scanner)" },
    { valor: "INICIO_MONTAGEM", rotulo: "Início de montagem" },
    { valor: "PRODUCAO_FIM", rotulo: "Fim de montagem" },
    { valor: "PAUSA", rotulo: "Pausas de linha" },
  ]},
  { grupo: "Qualidade", itens: [
    { valor: "QA", rotulo: "Qualidade e reparos" },
    { valor: "FOTO", rotulo: "Fotos adicionadas/removidas" },
  ]},
  { grupo: "Logística", itens: [
    { valor: "ETIQUETA", rotulo: "Impressões de etiqueta" },
    { valor: "REVERSAO_ESTOQUE", rotulo: "Reversões de estoque" },
    { valor: "SAIDA_ESTOQUE", rotulo: "Saídas de estoque" },
    { valor: "INVENTARIO", rotulo: "Inventários" },
  ]},
  { grupo: "Administração", itens: [
    { valor: "CADASTRO", rotulo: "Cadastros" },
    { valor: "EDICAO", rotulo: "Edições" },
    { valor: "EXCLUSAO", rotulo: "Exclusões" },
    { valor: "EQUIPE", rotulo: "Arquivamento / restauração" },
    { valor: "SENHA_ALTERADA", rotulo: "Troca de senha" },
    { valor: "CONFIGURACAO", rotulo: "Configurações do sistema" },
    { valor: "PERFIL", rotulo: "Perfis de acesso" },
  ]},
];

const CHAVES_OCULTAS = new Set(["_meta", "autor_id_ref", "autor_cargo", "autor_perfil"]);

function resumoDetalhes(dados: Record<string, unknown>): string {
  return Object.entries(dados)
    .filter(([k, v]) => !CHAVES_OCULTAS.has(k) && v !== null && v !== undefined && v !== "")
    .slice(0, 3)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default function AuditoriaPage() {
  const [loading, setLoading] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [temMais, setTemMais] = useState(false);
  const [logs, setLogs] = useState<LogProcessado[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroAcao, setFiltroAcao] = useState("todos");
  const [filtroUsuario, setFiltroUsuario] = useState("todos");
  const [logDetalhe, setLogDetalhe] = useState<LogProcessado | null>(null);

  // NOVOS FILTROS DE DATA
  const [dataInicio, setDataInicio] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd')); // Padrão: 7 dias atrás
  const [dataFim, setDataFim] = useState(format(new Date(), 'yyyy-MM-dd')); // Padrão: Hoje

  const buscarPagina = useCallback(async (offset: number) => {
    // Início da query base
    let query = supabase
      .from('logs_sistema')
      .select('*')
      .order('created_at', { ascending: false });

    // Filtro de Datas no fuso local (antes o filtro era aplicado em UTC e cortava 3h do dia)
    if (dataInicio) query = query.gte('created_at', dataInputParaISO(dataInicio));
    if (dataFim) query = query.lte('created_at', dataInputParaISO(dataFim, true));

    // Filtro de Tipo de Ação
    if (filtroAcao === 'PAUSA') query = query.ilike('acao', '%PAUSA%');
    else if (filtroAcao === 'QA') query = query.or('acao.ilike.%QA%,acao.ilike.%REPARO%'); // QA ou Reparo
    else if (filtroAcao === 'ETIQUETA') query = query.ilike('acao', '%ETIQUETA%');
    else if (filtroAcao === 'EQUIPE') query = query.in('acao', ['ARQUIVAMENTO', 'RESTAURACAO']);
    else if (filtroAcao === 'FOTO') query = query.ilike('acao', 'FOTO%');
    else if (filtroAcao === 'INVENTARIO') query = query.ilike('acao', 'INVENTARIO%');
    else if (filtroAcao === 'PERFIL') query = query.ilike('acao', 'PERFIL%');
    else if (filtroAcao !== 'todos') query = query.eq('acao', filtroAcao);

    const { data, error } = await query.range(offset, offset + TAMANHO_PAGINA - 1);
    if (error) throw error;
    const lista = (data || []) as LogSistema[];
    return { lista: lista.map((l) => ({ ...l, dados: lerDetalhesLog(l.detalhes) })), temMais: lista.length === TAMANHO_PAGINA };
  }, [filtroAcao, dataInicio, dataFim]);

  useEffect(() => {
    let ativo = true;
    buscarPagina(0)
      .then((r) => {
        if (!ativo) return;
        setLogs(r.lista);
        setTemMais(r.temMais);
      })
      .catch((error) => {
        console.error(error);
        if (ativo) toast.error("Erro ao carregar auditoria.");
      })
      .finally(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
  }, [buscarPagina]); // Reage às datas e ao tipo

  const carregarMais = async () => {
    setCarregandoMais(true);
    try {
      const r = await buscarPagina(logs.length);
      setLogs((prev) => [...prev, ...r.lista]);
      setTemMais(r.temMais);
    } catch {
      toast.error("Erro ao carregar mais registros.");
    } finally {
      setCarregandoMais(false);
    }
  };

  const usuarios = Array.from(new Set(logs.map((l) => l.usuario).filter(Boolean))).sort();
  const termo = busca.toLowerCase();
  const logsFiltrados = logs.filter(log =>
    (filtroUsuario === 'todos' || log.usuario === filtroUsuario) && (
      !termo ||
      log.usuario?.toLowerCase().includes(termo) ||
      log.referencia?.toLowerCase().includes(termo) ||
      log.acao.toLowerCase().includes(termo) ||
      JSON.stringify(log.dados).toLowerCase().includes(termo)
    )
  );

  // Helper Visual Expandido
  const getActionStyle = (acao: string) => {
      if (acao === 'LOGIN_FALHA') return { icon: ShieldX, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' };
      if (acao.includes('LOGIN')) return { icon: LogIn, color: 'text-info', bg: 'bg-info/10' };
      if (acao.includes('LOGOUT')) return { icon: LogOut, color: 'text-muted-foreground', bg: 'bg-muted' };
      if (acao === 'CONFIGURACAO') return { icon: Settings, color: 'text-foreground/90', bg: 'bg-muted' };
      if (acao === 'SENHA_ALTERADA') return { icon: KeyRound, color: 'text-violet-600', bg: 'bg-violet-100 dark:bg-violet-900/30' };
      if (acao === 'ARQUIVAMENTO' || acao === 'RESTAURACAO') return { icon: Archive, color: 'text-amber-700', bg: 'bg-amber-100 dark:bg-amber-900/30' };
      if (acao === 'REVERSAO_ESTOQUE') return { icon: Undo2, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' };
      if (acao === 'SAIDA_ESTOQUE') return { icon: Truck, color: 'text-emerald-700', bg: 'bg-emerald-100 dark:bg-emerald-900/30' };
      if (acao === 'INICIO_MONTAGEM') return { icon: Play, color: 'text-info', bg: 'bg-info/10' };

      if (acao.includes('CADASTRO') || acao.includes('ENTRADA')) return { icon: PlusCircle, color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30' };
      if (acao.includes('EDICAO')) return { icon: Edit, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' };
      if (acao.includes('EXCLUSAO')) return { icon: Trash2, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' };

      if (acao.includes('PAUSA')) return { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/30' };

      if (acao === 'APROVACAO_QA' || acao === 'PRODUCAO_FIM') return { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30' };
      if (acao.includes('REPROVACAO') || acao.includes('RETRABALHO')) return { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' };
      if (acao.includes('REPARO')) return { icon: Wrench, color: 'text-indigo-600', bg: 'bg-indigo-100 dark:bg-indigo-900/30' };
      if (acao.includes('ETIQUETA')) return { icon: Printer, color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30' };

      return { icon: Info, color: 'text-muted-foreground', bg: 'bg-muted' };
  };

  // CSV com ";" e BOM: abre com acentos e colunas corretas no Excel em português
  const handleExportCSV = () => {
    if (logsFiltrados.length === 0) return toast.warning("Nada para exportar");
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = ["Data", "Hora", "Usuário", "Ação", "Referência (SKU)", "Resumo", "Detalhes"];
    const rows = logsFiltrados.map(log => [
        new Date(log.created_at).toLocaleDateString('pt-BR'),
        new Date(log.created_at).toLocaleTimeString('pt-BR'),
        log.usuario,
        log.acao,
        log.referencia || '-',
        resumoDetalhes(log.dados),
        JSON.stringify(log.dados),
    ].map(esc).join(';'));

    const csvContent = '﻿' + [headers.map(esc).join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `auditoria_shineray_${dataInicio}_a_${dataFim}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const meta = (logDetalhe?.dados?._meta || {}) as Record<string, unknown>;

  return (
      <div className="space-y-6 animate-in fade-in pb-20">
        <PageHeader
          icone={ShieldAlert}
          titulo="Auditoria"
          descricao="Registro de todas as ações do sistema. Autor e horário são definidos pelo servidor e não podem ser alterados."
          acoes={
            <Button variant="outline" onClick={handleExportCSV}>
              <Download className="w-4 h-4 mr-2" /> Exportar CSV
            </Button>
          }
        />

        {/* Filtros Completos */}
        <div className="bg-card p-4 rounded-xl border border-border flex flex-col xl:flex-row gap-4 shadow-sm">

           {/* Busca Textual */}
           <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por usuário, SKU ou detalhe..."
                className="pl-10 h-10"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
           </div>

           {/* Filtro de Tipo */}
           <Select value={filtroAcao} onValueChange={(v) => { setLoading(true); setFiltroAcao(v); }}>
              <SelectTrigger className="w-full xl:w-[230px] h-10">
                 <div className="flex items-center">
                    <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Tipo de Ação" />
                 </div>
              </SelectTrigger>
              <SelectContent className="max-h-[360px]">
                 <SelectItem value="todos">Todos Eventos</SelectItem>
                 {GRUPOS_FILTRO.map(g => (
                   <SelectGroup key={g.grupo}>
                     <SelectLabel>{g.grupo}</SelectLabel>
                     {g.itens.map(i => <SelectItem key={i.valor} value={i.valor}>{i.rotulo}</SelectItem>)}
                   </SelectGroup>
                 ))}
              </SelectContent>
           </Select>

           {/* Filtro de Usuário */}
           <Select value={filtroUsuario} onValueChange={setFiltroUsuario}>
              <SelectTrigger className="w-full xl:w-[200px] h-10">
                 <SelectValue placeholder="Usuário" />
              </SelectTrigger>
              <SelectContent className="max-h-[360px]">
                 <SelectItem value="todos">Todos os usuários</SelectItem>
                 {usuarios.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
           </Select>

           {/* Filtro de Datas */}
           <div className="flex items-center gap-2 w-full xl:w-auto">
               <div className="relative flex-1">
                   <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                   <input
                       type="date"
                       className="pl-9 h-10 w-full xl:w-[150px] rounded-md border border-border bg-transparent text-sm"
                       value={dataInicio}
                       max={dataFim}
                       onChange={(e) => { setLoading(true); setDataInicio(e.target.value); }}
                   />
               </div>
               <span className="text-muted-foreground">até</span>
               <div className="relative flex-1">
                   <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                   <input
                       type="date"
                       className="pl-9 h-10 w-full xl:w-[150px] rounded-md border border-border bg-transparent text-sm"
                       value={dataFim}
                       min={dataInicio}
                       onChange={(e) => { setLoading(true); setDataFim(e.target.value); }}
                   />
               </div>
           </div>
        </div>

        {/* Tabela de Logs */}
        <Card className="bg-card border-border">
           <CardHeader className="py-4 border-b border-border">
               <div className="flex justify-between items-center gap-2">
                   <CardTitle className="text-base">Registros Encontrados</CardTitle>
                   <Badge variant="secondary">{logsFiltrados.length} eventos{temMais ? ' (há mais)' : ''}</Badge>
               </div>
           </CardHeader>
           <CardContent className="p-0">
               {loading ? (
                   <div className="p-8 space-y-4">
                       {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                   </div>
               ) : (
                   <div className="rounded-md overflow-x-auto">
                       <Table>
                           <TableHeader className="bg-muted/50">
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
                                       <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                                           Nenhum registro encontrado com os filtros atuais.
                                       </TableCell>
                                   </TableRow>
                               ) : (
                                   logsFiltrados.map((log) => {
                                       const style = getActionStyle(log.acao);
                                       const Icon = style.icon;
                                       const resumo = resumoDetalhes(log.dados);

                                       return (
                                           <TableRow key={log.id} className="hover:bg-accent group transition-colors">
                                               <TableCell className="max-w-[360px]">
                                                   <div className="flex items-center gap-3">
                                                       <div className={`p-2 rounded-lg shrink-0 ${style.bg} ${style.color}`}>
                                                           <Icon className="w-4 h-4" />
                                                       </div>
                                                       <div className="min-w-0">
                                                           <span className="font-bold text-xs uppercase tracking-wide text-foreground/90">
                                                               {rotuloAcao(log.acao)}
                                                           </span>
                                                           {resumo && <p className="text-[11px] text-muted-foreground truncate" title={resumo}>{resumo}</p>}
                                                       </div>
                                                   </div>
                                               </TableCell>
                                               <TableCell>
                                                   <div className="flex flex-col">
                                                       <span className="font-medium text-foreground text-sm">
                                                           {log.usuario}
                                                       </span>
                                                   </div>
                                               </TableCell>
                                               <TableCell>
                                                   {log.referencia ? (
                                                       <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground flex w-fit items-center gap-1 border-slate-200 bg-muted/50">
                                                           <ScanBarcode className="w-3 h-3"/> {log.referencia}
                                                       </Badge>
                                                   ) : <span className="text-muted-foreground text-xs">-</span>}
                                               </TableCell>
                                               <TableCell>
                                                   <div className="flex flex-col text-sm text-muted-foreground">
                                                       <span>{format(new Date(log.created_at), "dd/MM/yyyy")}</span>
                                                       <span className="text-xs opacity-70">
                                                           {format(new Date(log.created_at), "HH:mm:ss")}
                                                       </span>
                                                   </div>
                                               </TableCell>
                                               <TableCell className="text-right">
                                                   <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-60 group-hover:opacity-100 transition-opacity" onClick={() => setLogDetalhe(log)} aria-label="Ver detalhes">
                                                       <FileJson className="w-4 h-4 text-muted-foreground hover:text-blue-500" />
                                                   </Button>
                                               </TableCell>
                                           </TableRow>
                                       );
                                   })
                               )}
                           </TableBody>
                       </Table>
                       {temMais && (
                         <div className="p-4 border-t border-border flex justify-center">
                           <Button variant="outline" onClick={carregarMais} disabled={carregandoMais}>
                             {carregandoMais ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Carregar mais {TAMANHO_PAGINA}
                           </Button>
                         </div>
                       )}
                   </div>
               )}
           </CardContent>
        </Card>

        {/* Detalhe do evento */}
        <Dialog open={!!logDetalhe} onOpenChange={(o) => !o && setLogDetalhe(null)}>
            <DialogContent className="sm:max-w-xl bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-red-500" /> Detalhes da Auditoria
                    </DialogTitle>
                    <DialogDescription>{logDetalhe ? rotuloAcao(logDetalhe.acao) : ''} · {logDetalhe?.usuario}</DialogDescription>
                </DialogHeader>

                {logDetalhe && (
                  <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="p-3 bg-muted/50 rounded border border-slate-100 dark:border-slate-700">
                              <p className="text-xs font-bold uppercase text-muted-foreground">ID do Evento</p>
                              <p className="font-mono text-xs mt-1 break-all">{logDetalhe.id}</p>
                          </div>
                          <div className="p-3 bg-muted/50 rounded border border-slate-100 dark:border-slate-700">
                              <p className="text-xs font-bold uppercase text-muted-foreground">Tela de origem</p>
                              <p className="font-mono text-xs mt-1">{String(meta.url_origem || '—')}</p>
                          </div>
                          <div className="col-span-2 p-3 bg-muted/50 rounded border border-slate-100 dark:border-slate-700">
                              <p className="text-xs font-bold uppercase text-muted-foreground">Dispositivo (User Agent)</p>
                              <p className="text-xs mt-1 break-words">
                                  {String(meta.userAgent || 'Não identificado')}
                              </p>
                          </div>
                      </div>

                      <div>
                          <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Payload Completo (JSON)</p>
                          <div className="bg-slate-950 text-emerald-400 p-4 rounded-lg font-mono text-[10px] overflow-auto max-h-[300px] border border-slate-800 shadow-inner">
                              <pre>{JSON.stringify(logDetalhe.dados, null, 2)}</pre>
                          </div>
                      </div>
                  </div>
                )}
            </DialogContent>
        </Dialog>
      </div>
  );
}
