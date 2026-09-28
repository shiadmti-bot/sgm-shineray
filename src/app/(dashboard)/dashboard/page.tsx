"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity, AlertOctagon, AlertTriangle, ArrowRight, BellRing, CheckCircle2, ClipboardCheck, Clock, History, LayoutDashboard,
  PackagePlus, PauseCircle, Tag, Target, Truck, Warehouse, Wrench,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/sgm/PageHeader";
import { StatCard } from "@/components/sgm/StatCard";
import { EmptyState } from "@/components/sgm/EmptyState";
import { Iniciais } from "@/components/sgm/Iniciais";
import { EVENTO_ABRIR_SOLICITACOES } from "@/components/layout/CentralSolicitacoes";
import { iconeDaRota } from "@/components/layout/icones";
import { supabase } from "@/lib/supabase";
import { useUsuarioLogado } from "@/lib/auth";
import { pode } from "@/lib/rbac/permissoes";
import { podeAcessarCaminho, rotasPermitidas } from "@/lib/rbac/rotas";
import { useConfigGeral } from "@/lib/config-sistema";
import { formatarDuracaoMin, inicioDoDiaISO, minutosDesde } from "@/lib/datas";
import { primeiroNome } from "@/lib/constantes";
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

const contagem = () => supabase.from("motos").select("*", { count: "exact", head: true });
type Contagem = ReturnType<typeof contagem>;
const contar = (filtro: (q: Contagem) => Contagem) => filtro(contagem());

async function buscarPainel() {
  const hoje = inicioDoDiaISO();
  const [
    { count: fila }, { count: montagem }, { count: pausadasTotal }, { count: qualidade }, { count: avarias },
    { count: etiqueta }, { count: estoque }, { count: entradasHoje }, { count: montadasHoje }, { count: expedidasHoje },
    { count: solicitacoes }, { data: ativos }, { data: emPausa }, { data: aguardandoQA },
  ] = await Promise.all([
    contar((q) => q.eq("status", "aguardando_montagem")),
    contar((q) => q.eq("status", "em_producao")),
    contar((q) => q.eq("status", "pausado")),
    contar((q) => q.eq("status", "em_analise")),
    contar((q) => q.like("status", "avaria_%")),
    contar((q) => q.eq("status", "aguardando_etiqueta")),
    contar((q) => q.eq("status", "estoque")),
    contar((q) => q.gte("created_at", hoje)),
    contar((q) => q.gte("fim_montagem", hoje)),
    contar((q) => q.eq("status", "expedido").gte("updated_at", hoje)),
    supabase.from("solicitacoes_pausa").select("*", { count: "exact", head: true }).eq("status", "pendente"),
    supabase.from("motos").select(`id, modelo, sku, inicio_montagem, montador:funcionarios!motos_montador_id_fkey(nome)`)
      .eq("status", "em_producao").order("inicio_montagem", { ascending: true }),
    supabase.from("motos").select(`id, modelo, sku, updated_at, montador:funcionarios!motos_montador_id_fkey(nome)`)
      .eq("status", "pausado").order("updated_at", { ascending: true }),
    supabase.from("motos").select("id, modelo, sku, fim_montagem").eq("status", "em_analise").order("fim_montagem", { ascending: true }),
  ]);
  return {
    stats: {
      fila: fila || 0, montagem: montagem || 0, pausadas: pausadasTotal || 0, qualidade: qualidade || 0, avarias: avarias || 0,
      etiqueta: etiqueta || 0, estoque: estoque || 0, entradasHoje: entradasHoje || 0, montadasHoje: montadasHoje || 0,
      expedidasHoje: expedidasHoje || 0, solicitacoes: solicitacoes || 0,
    },
    linhaAtiva: (ativos || []) as unknown as MotoLinha[],
    pausadas: (emPausa || []) as unknown as MotoLinha[],
    filaQA: (aguardandoQA || []) as unknown as MotoLinha[],
  };
}

async function buscarEventos(): Promise<EventoLog[]> {
  // O banco devolve só o que o perfil pode ver (sem acessos para quem não tem auditoria)
  const { data } = await supabase
    .from("logs_sistema")
    .select("id, acao, usuario, referencia, created_at")
    .neq("acao", "LOGIN_FALHA")
    .order("created_at", { ascending: false })
    .limit(8);
  return (data || []) as EventoLog[];
}

type Painel = Awaited<ReturnType<typeof buscarPainel>>;

export default function DashboardPage() {
  const usuario = useUsuarioLogado();
  const { config } = useConfigGeral();
  const [painel, setPainel] = useState<Painel | null>(null);
  const [eventos, setEventos] = useState<EventoLog[]>([]);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    let ativo = true;
    const atualizar = () =>
      Promise.all([buscarPainel(), buscarEventos()]).then(([p, ev]) => {
        if (!ativo) return;
        setPainel(p);
        setEventos(ev);
        setAtualizadoEm(new Date());
        setAgora(Date.now());
      });
    atualizar();
    const intervalo = setInterval(atualizar, 10_000);
    const relogio = setInterval(() => setAgora(Date.now()), 15_000);
    return () => {
      ativo = false;
      clearInterval(intervalo);
      clearInterval(relogio);
    };
  }, []);

  const carregando = painel === null;
  const stats = painel?.stats;
  const linhaAtiva = painel?.linhaAtiva ?? [];
  const pausadas = painel?.pausadas ?? [];
  const filaQA = painel?.filaQA ?? [];
  const verProntuario = pode(usuario, "prontuario.ver");
  const aprovaPausas = pode(usuario, "pausas.aprovar");
  const link = (href: string) => (podeAcessarCaminho(usuario, href) ? href : undefined);

  const meta = config.metaDiaria;
  const progresso = stats ? Math.min((stats.montadasHoje / Math.max(meta, 1)) * 100, 100) : 0;
  const minutosMontagem = (m: MotoLinha) => minutosDesde(m.inicio_montagem, agora);
  const minutosPausa = (m: MotoLinha) => minutosDesde(m.updated_at, agora);
  const atrasadas = linhaAtiva.filter((m) => minutosMontagem(m) > config.limiteMontagemMin);
  const pausasLongas = pausadas.filter((m) => minutosPausa(m) > config.limitePausaMin);
  const esperaQA = filaQA.length ? minutosDesde(filaQA[0].fim_montagem, agora) : 0;

  const alertas: { nivel: "critico" | "atencao"; texto: string; href?: string }[] = [];
  if (stats) {
    if (stats.avarias > 0) alertas.push({ nivel: "critico", texto: `${stats.avarias} moto(s) paradas no pátio de avarias`, href: link("/avarias") });
    atrasadas.forEach((m) => alertas.push({ nivel: "atencao", texto: `Montagem de ${m.modelo} (${primeiroNome(m.montador?.nome)}) passa de ${config.limiteMontagemMin} min: ${formatarDuracaoMin(minutosMontagem(m))}` }));
    pausasLongas.forEach((m) => alertas.push({ nivel: "atencao", texto: `Pausa de ${primeiroNome(m.montador?.nome)} passa de ${config.limitePausaMin} min: ${formatarDuracaoMin(minutosPausa(m))}` }));
    if (stats.qualidade > config.limiteFilaQA) alertas.push({ nivel: "atencao", texto: `Fila de inspeção com ${stats.qualidade} motos (limite ${config.limiteFilaQA})`, href: link("/qualidade") });
    if (esperaQA > 30) alertas.push({ nivel: "atencao", texto: `Moto aguardando inspeção há ${formatarDuracaoMin(esperaQA)}`, href: link("/qualidade") });
  }

  const atalhos = rotasPermitidas(usuario).filter((r) => !r.oculta && r.href !== "/dashboard").slice(0, 6);

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        icone={LayoutDashboard}
        titulo={`Olá, ${primeiroNome(usuario?.nome, "")}`}
        descricao={
          <>
            Produção em tempo real.
            {atualizadoEm && <span className="ml-1">Atualizado às {atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}.</span>}
          </>
        }
        acoes={
          <Card className="w-full gap-2 py-3 md:w-[26rem]">
            <CardContent className="space-y-2 px-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs font-semibold uppercase text-primary"><Target className="size-3.5" /> Meta diária de montagem</span>
                <span className="text-sm font-bold tabular-nums">{stats?.montadasHoje ?? 0} / {meta}</span>
              </div>
              <Progress value={progresso} className="h-2" />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><PackagePlus className="size-3" /> {stats?.entradasHoje ?? 0} entradas</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="size-3" /> {stats?.montadasHoje ?? 0} montadas</span>
                <span className="flex items-center gap-1"><Truck className="size-3" /> {stats?.expedidasHoje ?? 0} expedidas</span>
              </div>
            </CardContent>
          </Card>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatCard rotulo="Fila de entrada" valor={stats?.fila ?? 0} icone={PackagePlus} carregando={carregando} href={link("/montagem")} />
        <StatCard rotulo="Em montagem" valor={stats?.montagem ?? 0} icone={Wrench} tom="info" destacar={atrasadas.length > 0} carregando={carregando} />
        <StatCard rotulo="Pausadas" valor={stats?.pausadas ?? 0} icone={PauseCircle} tom="alerta" destacar={pausasLongas.length > 0} carregando={carregando} />
        <StatCard rotulo="Inspeção QA" valor={stats?.qualidade ?? 0} icone={ClipboardCheck} tom="primario" destacar={(stats?.qualidade ?? 0) > config.limiteFilaQA} carregando={carregando} href={link("/qualidade")} />
        <StatCard rotulo="Avarias" valor={stats?.avarias ?? 0} icone={AlertOctagon} tom={(stats?.avarias ?? 0) > 0 ? "perigo" : "sucesso"} destacar={(stats?.avarias ?? 0) > 0} carregando={carregando} href={link("/avarias")} />
        <StatCard rotulo="Aguard. etiqueta" valor={stats?.etiqueta ?? 0} icone={Tag} tom="info" carregando={carregando} href={link("/etiquetagem")} />
        <StatCard rotulo="Estoque" valor={stats?.estoque ?? 0} icone={Warehouse} tom="sucesso" carregando={carregando} href={link("/estoque")} />
      </div>

      {!carregando && (
        alertas.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-3 text-sm font-medium text-success">
            <CheckCircle2 className="size-4 shrink-0" /> Fluxo estável: nenhum alerta no momento.
          </div>
        ) : (
          <div className="space-y-2">
            {alertas.map((a, i) => {
              const conteudo = (
                <div className={cn("flex items-center gap-3 rounded-xl border p-3 text-sm font-medium",
                  a.nivel === "critico" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-warning/40 bg-warning/10 text-foreground")}>
                  <AlertTriangle className={cn("size-4 shrink-0", a.nivel === "atencao" && "text-warning")} />
                  <span className="flex-1">{a.texto}</span>
                  {a.href && <ArrowRight className="size-4 opacity-60" />}
                </div>
              );
              return a.href ? <Link key={i} href={a.href} className="block hover:opacity-90">{conteudo}</Link> : <div key={i}>{conteudo}</div>;
            })}
          </div>
        )
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="size-5 text-primary" /> Linha de montagem ao vivo</CardTitle>
            <CardDescription>Montagens em andamento (referência: {config.limiteMontagemMin} min por moto).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {carregando ? (
              <div className="grid gap-3 md:grid-cols-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}</div>
            ) : linhaAtiva.length === 0 ? (
              <EmptyState icone={Wrench} titulo="Nenhuma montagem em andamento" compacto />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {linhaAtiva.map((m) => {
                  const minutos = minutosMontagem(m);
                  const atrasada = minutos > config.limiteMontagemMin;
                  const conteudo = (
                    <div className={cn("relative flex items-center gap-3 rounded-xl border bg-background p-3", atrasada && "border-warning/60")}>
                      <span className={cn("absolute right-3 top-3 size-2.5 rounded-full", atrasada ? "bg-warning" : "bg-success")} />
                      <Iniciais nome={m.montador?.nome} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{m.modelo}</p>
                        <p className="font-mono text-xs text-muted-foreground">{m.sku}</p>
                        <p className={cn("mt-1 flex items-center gap-1 text-xs font-medium", atrasada ? "text-warning" : "text-info")}>
                          <Clock className="size-3" /> {primeiroNome(m.montador?.nome)} · {formatarDuracaoMin(minutos)}
                        </p>
                      </div>
                    </div>
                  );
                  return verProntuario ? (
                    <Link key={m.id} href={`/prontuario/${encodeURIComponent(m.sku)}`} className="block rounded-xl hover:opacity-90">{conteudo}</Link>
                  ) : (
                    <div key={m.id}>{conteudo}</div>
                  );
                })}
              </div>
            )}

            {pausadas.length > 0 && (
              <div className="space-y-3">
                <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <PauseCircle className="size-4 text-warning" /> Pausadas agora
                </h4>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {pausadas.map((p) => {
                    const minutos = minutosPausa(p);
                    const longa = minutos > config.limitePausaMin;
                    return (
                      <div key={p.id} className={cn("flex items-center justify-between gap-3 rounded-xl border p-3 text-sm", longa ? "border-destructive/40 bg-destructive/5" : "border-warning/40 bg-warning/5")}>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{p.montador?.nome || "—"}</p>
                          <p className="truncate text-xs text-muted-foreground">{p.modelo} · <span className="font-mono">{p.sku}</span></p>
                        </div>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-bold text-white", longa ? "bg-destructive" : "bg-warning")}>{formatarDuracaoMin(minutos)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {aprovaPausas && (stats?.solicitacoes ?? 0) > 0 && (
            <Card className="border-warning/50 bg-warning/5 py-4">
              <CardContent className="flex items-center justify-between gap-3 px-4">
                <div className="flex items-center gap-3">
                  <BellRing className="size-6 animate-pulse text-warning" />
                  <div>
                    <p className="text-sm font-semibold">{stats?.solicitacoes} pedido(s) de pausa</p>
                    <p className="text-xs text-muted-foreground">Aguardando decisão</p>
                  </div>
                </div>
                <Button size="sm" onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_SOLICITACOES))}>Ver</Button>
              </CardContent>
            </Card>
          )}

          {atalhos.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Acesso rápido</CardTitle></CardHeader>
              <CardContent className="grid gap-2">
                {atalhos.map((r) => {
                  const Icone = iconeDaRota(r.href);
                  return (
                    <Button key={r.href} asChild variant="outline" className="h-11 justify-between">
                      <Link href={r.href}>
                        <span className="flex items-center gap-2"><Icone /> {r.titulo}</span>
                        <ArrowRight className="opacity-50" />
                      </Link>
                    </Button>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><History className="size-4" /> Atividade recente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {eventos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem eventos registrados.</p>
              ) : (
                eventos.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-3 text-xs">
                    <span className="w-10 shrink-0 font-mono text-muted-foreground">{new Date(ev.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{ev.acao.replace(/_/g, " ")}</p>
                      <p className="truncate text-muted-foreground">{ev.usuario}{ev.referencia && ev.referencia !== "Sistema" ? ` · ${ev.referencia}` : ""}</p>
                    </div>
                  </div>
                ))
              )}
              {pode(usuario, "auditoria.ver") && (
                <Link href="/auditoria" className="flex items-center gap-1 pt-1 text-xs font-semibold text-primary hover:underline">
                  Ver auditoria completa <ArrowRight className="size-3" />
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
