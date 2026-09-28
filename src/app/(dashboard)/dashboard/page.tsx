"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import {
  Activity, Wrench, ClipboardCheck, Warehouse, AlertOctagon, TrendingUp, Clock, ArrowRight, Target,
  PackagePlus, Tag, PauseCircle, AlertTriangle, CheckCircle2, ScanBarcode, Truck, History, BellRing
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { CARGOS_ADMIN, temCargo, useUsuarioLogado } from "@/lib/auth";
import { useConfigGeral } from "@/lib/config-sistema";
import { formatarDuracaoMin, inicioDoDiaISO, minutosDesde } from "@/lib/datas";
import { EVENTO_ABRIR_SOLICITACOES } from "@/components/CentralSolicitacoes";
import { cn } from "@/lib/utils";

interface MotoLinha {
  id: string;
  modelo: string;
  sku: string;
  inicio_montagem?: string | null;
  updated_at?: string | null;
  fim_montagem?: string | null;
  montador?: { nome: string } | null;
}

interface EventoLog {
  id: string;
  acao: string;
  usuario: string;
  referencia: string;
  created_at: string;
}

const INICIAIS = (nome?: string) => (nome || "??").substring(0, 2).toUpperCase();

const consultaContagem = () => supabase.from('motos').select('*', { count: 'exact', head: true });
type ConsultaContagem = ReturnType<typeof consultaContagem>;
const contar = (filtro: (q: ConsultaContagem) => ConsultaContagem) => filtro(consultaContagem());

async function buscarPainel() {
  // "Hoje" no fuso local (antes usava a data UTC: após 21h o painel zerava)
  const hoje = inicioDoDiaISO();

  const [
    { count: cFila },
    { count: cMontagem },
    { count: cPausadas },
    { count: cQualidade },
    { count: cAvarias },
    { count: cEtiqueta },
    { count: cEstoque },
    { count: cEntradas },
    { count: cMontadas },
    { count: cExpedidas },
    { count: cSolicitacoes },
    { data: ativos },
    { data: emPausa },
    { data: aguardandoQA },
  ] = await Promise.all([
    contar(q => q.eq('status', 'aguardando_montagem')),
    contar(q => q.eq('status', 'em_producao')),
    contar(q => q.eq('status', 'pausado')),
    contar(q => q.eq('status', 'em_analise')),
    contar(q => q.like('status', 'avaria_%')),
    contar(q => q.eq('status', 'aguardando_etiqueta')),
    contar(q => q.eq('status', 'estoque')),
    contar(q => q.gte('created_at', hoje)),
    contar(q => q.gte('fim_montagem', hoje)),
    contar(q => q.eq('status', 'expedido').gte('updated_at', hoje)),
    supabase.from('solicitacoes_pausa').select('*', { count: 'exact', head: true }).eq('status', 'pendente'),
    // Quem está trabalhando agora
    supabase.from('motos')
      .select(`id, modelo, sku, inicio_montagem, montador:funcionarios!motos_montador_id_fkey(nome)`)
      .eq('status', 'em_producao')
      .order('inicio_montagem', { ascending: true }),
    supabase.from('motos')
      .select(`id, modelo, sku, updated_at, montador:funcionarios!motos_montador_id_fkey(nome)`)
      .eq('status', 'pausado')
      .order('updated_at', { ascending: true }),
    supabase.from('motos')
      .select(`id, modelo, sku, fim_montagem`)
      .eq('status', 'em_analise')
      .order('fim_montagem', { ascending: true }),
  ]);

  return {
    stats: {
      fila: cFila || 0,
      montagem: cMontagem || 0,
      pausadas: cPausadas || 0,
      qualidade: cQualidade || 0,
      avarias: cAvarias || 0,
      etiqueta: cEtiqueta || 0,
      estoque: cEstoque || 0,
      entradasHoje: cEntradas || 0,
      montadasHoje: cMontadas || 0,
      expedidasHoje: cExpedidas || 0,
      solicitacoes: cSolicitacoes || 0,
    },
    linhaAtiva: (ativos || []) as unknown as MotoLinha[],
    pausadas: (emPausa || []) as unknown as MotoLinha[],
    filaQA: (aguardandoQA || []) as unknown as MotoLinha[],
  };
}

async function buscarEventos(): Promise<EventoLog[]> {
  const { data } = await supabase
    .from('logs_sistema')
    .select('id, acao, usuario, referencia, created_at')
    .neq('acao', 'LOGIN_FALHA')
    .order('created_at', { ascending: false })
    .limit(8);
  return (data || []) as EventoLog[];
}

export default function DashboardPage() {
  const usuario = useUsuarioLogado();
  const ehAdmin = temCargo(usuario, CARGOS_ADMIN);
  const { config } = useConfigGeral();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    fila: 0,
    montagem: 0,
    pausadas: 0,
    qualidade: 0,
    avarias: 0,
    etiqueta: 0,
    estoque: 0,
    entradasHoje: 0,
    montadasHoje: 0,
    expedidasHoje: 0,
    solicitacoes: 0,
  });
  const [linhaAtiva, setLinhaAtiva] = useState<MotoLinha[]>([]);
  const [pausadas, setPausadas] = useState<MotoLinha[]>([]);
  const [filaQA, setFilaQA] = useState<MotoLinha[]>([]);
  const [eventos, setEventos] = useState<EventoLog[]>([]);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    let ativo = true;
    const atualizar = () => buscarPainel().then((r) => {
      if (!ativo) return;
      setStats(r.stats);
      setLinhaAtiva(r.linhaAtiva);
      setPausadas(r.pausadas);
      setFilaQA(r.filaQA);
      setAtualizadoEm(new Date());
      setAgora(Date.now());
      setLoading(false);
    });
    atualizar();
    const interval = setInterval(atualizar, 10000); // Atualiza a cada 10s
    const relogio = setInterval(() => setAgora(Date.now()), 15000);
    return () => { ativo = false; clearInterval(interval); clearInterval(relogio); };
  }, []);

  useEffect(() => {
    if (!ehAdmin) return;
    let ativo = true;
    const atualizar = () => buscarEventos().then((lista) => { if (ativo) setEventos(lista); });
    atualizar();
    const interval = setInterval(atualizar, 20000);
    return () => { ativo = false; clearInterval(interval); };
  }, [ehAdmin]);

  // Meta: montagens FINALIZADAS hoje (antes contava caixas bipadas na entrada)
  const metaDiaria = config.metaDiaria;
  const progresso = Math.min((stats.montadasHoje / metaDiaria) * 100, 100);

  const minutosMontagem = (m: MotoLinha) => minutosDesde(m.inicio_montagem, agora);
  const minutosPausa = (m: MotoLinha) => minutosDesde(m.updated_at, agora);
  const atrasadas = linhaAtiva.filter(m => minutosMontagem(m) > config.limiteMontagemMin);
  const pausasLongas = pausadas.filter(m => minutosPausa(m) > config.limitePausaMin);
  const esperaQA = filaQA.length ? minutosDesde(filaQA[0].fim_montagem, agora) : 0;

  // Alertas automáticos para a gestão
  const alertas: { nivel: 'crit' | 'warn'; texto: string; href?: string }[] = [];
  if (stats.avarias > 0) alertas.push({ nivel: 'crit', texto: `${stats.avarias} moto(s) paradas no pátio de avarias`, href: '/avarias' });
  atrasadas.forEach(m => alertas.push({ nivel: 'warn', texto: `Montagem de ${m.modelo} (${m.montador?.nome?.split(' ')[0] || '—'}) passa de ${config.limiteMontagemMin} min: ${formatarDuracaoMin(minutosMontagem(m))}` }));
  pausasLongas.forEach(m => alertas.push({ nivel: 'warn', texto: `Pausa de ${m.montador?.nome?.split(' ')[0] || '—'} passa de ${config.limitePausaMin} min: ${formatarDuracaoMin(minutosPausa(m))}` }));
  if (stats.qualidade > config.limiteFilaQA) alertas.push({ nivel: 'warn', texto: `Fila de inspeção com ${stats.qualidade} motos (limite ${config.limiteFilaQA})`, href: '/qualidade' });
  if (esperaQA > 30) alertas.push({ nivel: 'warn', texto: `Moto aguardando inspeção há ${formatarDuracaoMin(esperaQA)}`, href: '/qualidade' });
  if (stats.solicitacoes > 0) alertas.push({ nivel: 'warn', texto: `${stats.solicitacoes} solicitação(ões) de pausa aguardando decisão` });

  const cartoes = [
    { titulo: 'Fila de Entrada', valor: stats.fila, icone: PackagePlus, cor: 'border-l-slate-400', destaque: false },
    { titulo: 'Em Montagem', valor: stats.montagem, icone: Wrench, cor: 'border-l-blue-500', destaque: atrasadas.length > 0 },
    { titulo: 'Pausadas', valor: stats.pausadas, icone: PauseCircle, cor: 'border-l-amber-500', destaque: pausasLongas.length > 0 },
    { titulo: 'Inspeção QA', valor: stats.qualidade, icone: ClipboardCheck, cor: 'border-l-purple-500', destaque: stats.qualidade > config.limiteFilaQA },
    { titulo: 'Pátio Avarias', valor: stats.avarias, icone: AlertOctagon, cor: stats.avarias > 0 ? 'border-l-red-500' : 'border-l-green-500', destaque: stats.avarias > 0 },
    { titulo: 'Aguard. Etiqueta', valor: stats.etiqueta, icone: Tag, cor: 'border-l-sky-500', destaque: false },
    { titulo: 'Estoque Final', valor: stats.estoque, icone: Warehouse, cor: 'border-l-emerald-500', destaque: false },
  ];

  const atalhos = [
    { href: '/montagem', rotulo: 'Linha de Montagem', icone: Wrench, cargos: ['montador', 'supervisor'] },
    { href: '/qualidade', rotulo: 'Inspeção de Qualidade', icone: ClipboardCheck, cargos: ['gestor', 'supervisor'] },
    { href: '/scanner', rotulo: 'Entrada (Scanner)', icone: ScanBarcode, cargos: ['gestor', 'supervisor', 'montador'] },
    { href: '/avarias', rotulo: 'Gestão de Avarias', icone: AlertOctagon, cargos: ['gestor', 'supervisor'] },
    { href: '/relatorios', rotulo: 'Relatórios BI', icone: TrendingUp, cargos: ['gestor'] },
  ].filter(a => temCargo(usuario, a.cargos));

  return (
    <RoleGuard allowedRoles={['gestor', 'master', 'supervisor']}>
      <div className="space-y-8 animate-in fade-in pb-20">

        {/* Header com Saudação e Meta */}
        <div className="flex flex-col md:flex-row justify-between md:items-end gap-6">
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Torre de Controle <span className="text-blue-600">SGM</span>
            </h1>
            <p className="text-slate-500 mt-1">
              Visão geral da operação em tempo real.
              {atualizadoEm && <span className="text-xs text-slate-400 ml-2">Atualizado às {atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
            </p>
          </div>

          <Card className="w-full md:w-[26rem] border-blue-100 bg-blue-50/50 dark:bg-slate-900 dark:border-slate-800">
            <CardContent className="p-4 py-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase text-blue-600 flex items-center gap-1">
                  <Target className="w-3 h-3"/> Meta Diária de Montagem
                </span>
                <span className="text-sm font-bold">{stats.montadasHoje} / {metaDiaria} motos</span>
              </div>
              <Progress value={progresso} className="h-2 bg-blue-200 dark:bg-slate-800" />
              <div className="flex justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><PackagePlus className="w-3 h-3"/> {stats.entradasHoje} entradas</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> {stats.montadasHoje} montadas</span>
                <span className="flex items-center gap-1"><Truck className="w-3 h-3"/> {stats.expedidasHoje} expedidas</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* KPIs Principais (fluxo completo) */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {cartoes.map(({ titulo, valor, icone: Icone, cor, destaque }) => (
            <Card key={titulo} className={cn("gap-2 py-4 border-l-4 shadow-sm hover:shadow-md transition-all", cor, destaque && "ring-2 ring-amber-400/60")}>
              <CardHeader className="px-4 pb-0">
                <CardTitle className="text-[11px] font-bold text-slate-500 uppercase tracking-wide leading-tight min-h-[2.4em]">{titulo}</CardTitle>
              </CardHeader>
              <CardContent className="px-4">
                <div className="flex items-center justify-between">
                  {loading ? <Skeleton className="h-8 w-10" /> : <span className="text-3xl font-black text-slate-900 dark:text-white">{valor}</span>}
                  <Icone className="w-7 h-7 text-slate-200 dark:text-slate-800" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Alertas */}
        {!loading && (
          alertas.length === 0 ? (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 text-sm font-medium text-green-700 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> Fluxo estável: nenhum alerta no momento.
            </div>
          ) : (
            <div className="space-y-2">
              {alertas.map((a, i) => {
                const conteudo = (
                  <div className={cn("flex items-center gap-3 p-3 rounded-xl border text-sm font-medium",
                    a.nivel === 'crit' ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400" : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400")}>
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{a.texto}</span>
                    {a.href && <ArrowRight className="w-4 h-4 opacity-60" />}
                  </div>
                );
                return a.href ? <Link key={i} href={a.href} className="block hover:opacity-90">{conteudo}</Link> : <div key={i}>{conteudo}</div>;
              })}
            </div>
          )
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* PAINEL DA LINHA AO VIVO */}
          <Card className="lg:col-span-2 border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-500" /> Linha de Montagem Ao Vivo
              </CardTitle>
              <CardDescription>Boxes ativos com tempo decorrido (referência: {config.limiteMontagemMin} min por moto).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loading ? (
                <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full"/>)}</div>
              ) : linhaAtiva.length === 0 ? (
                <div className="text-center py-10 text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed">
                  <Wrench className="w-10 h-10 mx-auto mb-2 opacity-20"/>
                  <p>Nenhuma montagem ativa no momento.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {linhaAtiva.map((item) => {
                    const minutos = minutosMontagem(item);
                    const atrasada = minutos > config.limiteMontagemMin;
                    return (
                    <div key={item.id} className={cn("flex items-center gap-4 p-4 bg-white dark:bg-slate-950 border rounded-xl shadow-sm relative overflow-hidden", atrasada ? "border-amber-300 dark:border-amber-800" : "border-slate-100 dark:border-slate-800")}>
                      <div className="absolute top-0 right-0 p-2">
                        <span className="relative flex h-3 w-3">
                          <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", atrasada ? "bg-amber-400" : "bg-green-400")}></span>
                          <span className={cn("relative inline-flex rounded-full h-3 w-3", atrasada ? "bg-amber-500" : "bg-green-500")}></span>
                        </span>
                      </div>

                      <div className="h-10 w-10 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300" title={item.montador?.nome}>
                        {INICIAIS(item.montador?.nome)}
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white leading-none truncate">{item.modelo}</p>
                        <p className="text-xs text-slate-500 font-mono mt-1">{item.sku}</p>
                        <div className={cn("flex items-center gap-1 mt-2 text-[10px] font-bold px-2 py-0.5 rounded w-fit",
                          atrasada ? "text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400" : "text-blue-600 bg-blue-50 dark:bg-blue-900/20")}>
                           <Clock className="w-3 h-3"/> {item.montador?.nome?.split(' ')[0] || '—'} · {formatarDuracaoMin(minutos)}
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}

              {pausadas.length > 0 && (
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2"><PauseCircle className="w-4 h-4 text-amber-500"/> Pausadas agora</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {pausadas.map(p => {
                      const minutos = minutosPausa(p);
                      const longa = minutos > config.limitePausaMin;
                      return (
                        <div key={p.id} className={cn("flex items-center justify-between gap-3 p-3 rounded-xl border text-sm", longa ? "border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900" : "border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900")}>
                          <div className="min-w-0">
                            <p className="font-bold truncate">{p.montador?.nome || '—'}</p>
                            <p className="text-xs text-slate-500 truncate">{p.modelo} · <span className="font-mono">{p.sku}</span></p>
                          </div>
                          <Badge className={cn("border-0 shrink-0", longa ? "bg-red-600 text-white" : "bg-amber-500 text-white")}>{formatarDuracaoMin(minutos)}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AÇÕES RÁPIDAS E STATUS DO SISTEMA */}
          <div className="space-y-6">

            {stats.solicitacoes > 0 && (
              <Card className="border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/20">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <BellRing className="w-6 h-6 text-orange-600 animate-pulse" />
                    <div>
                      <p className="font-bold text-sm">{stats.solicitacoes} pedido(s) de pausa</p>
                      <p className="text-xs text-slate-500">Aguardando sua decisão</p>
                    </div>
                  </div>
                  <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_SOLICITACOES))}>Ver</Button>
                </CardContent>
              </Card>
            )}

            {/* Atalhos */}
            {atalhos.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Acesso Rápido</CardTitle></CardHeader>
                <CardContent className="grid gap-3">
                  {atalhos.map(({ href, rotulo, icone: Icone }) => (
                    <Link key={href} href={href}>
                      <Button variant="outline" className="w-full justify-between h-12">
                        <span className="flex items-center gap-2"><Icone className="w-4 h-4"/> {rotulo}</span>
                        <ArrowRight className="w-4 h-4 opacity-50"/>
                      </Button>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Atividade recente (gestão) */}
            {ehAdmin && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" /> Atividade recente</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {eventos.length === 0 ? (
                    <p className="text-xs text-slate-400">Sem eventos registrados.</p>
                  ) : eventos.map(ev => (
                    <div key={ev.id} className="flex items-start gap-3 text-xs">
                      <span className="font-mono text-slate-400 shrink-0 w-10">{new Date(ev.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-700 dark:text-slate-200 truncate">{ev.acao.replace(/_/g, ' ')}</p>
                        <p className="text-slate-500 truncate">{ev.usuario}{ev.referencia && ev.referencia !== 'Sistema' ? ` · ${ev.referencia}` : ''}</p>
                      </div>
                    </div>
                  ))}
                  <Link href="/auditoria" className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 pt-1">
                    Ver auditoria completa <ArrowRight className="w-3 h-3" />
                  </Link>
                </CardContent>
              </Card>
            )}

          </div>
        </div>

      </div>
    </RoleGuard>
  );
}
