"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePode } from "@/lib/auth";
import { PageHeader } from "@/components/sgm/PageHeader";
import { EmptyState } from "@/components/sgm/EmptyState";
import { FotosMoto } from "@/components/sgm/FotosMoto";
import { Dica } from "@/components/sgm/Guia";
import { Led } from "@/components/sgm/Led";
import { Painel } from "@/components/sgm/Painel";
import { PlacaChassi } from "@/components/sgm/PlacaChassi";
import { StatCard } from "@/components/sgm/StatCard";
import { Wrench, AlertOctagon, CheckCircle2, History, Clock, Loader2, OctagonAlert, RefreshCw, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { registrarLog } from "@/lib/logger";
import { TIPOS_AVARIA, rotuloAvaria } from "@/lib/constantes";
import { formatarDuracaoMin, minutosDesde } from "@/lib/datas";

interface MotoAvaria {
  id: string;
  sku: string;
  modelo: string;
  status: string;
  detalhes_avaria?: string | null;
  updated_at?: string | null;
  montador?: { nome: string } | null;
}

interface ReparoHistorico {
  id: string;
  sku: string;
  modelo: string;
  tipo_avaria: string;
  descricao_problema: string;
  descricao_solucao?: string | null;
  tecnico_nome?: string | null;
  created_at: string;
  data_resolucao?: string | null;
}

export default function AvariasPage() {
  const podeReparar = usePode("avarias.reparar");
  const [motos, setMotos] = useState<MotoAvaria[]>([]);
  const [historico, setHistorico] = useState<ReparoHistorico[]>([]);
  const [tecnicosSugeridos, setTecnicosSugeridos] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [motoAtiva, setMotoAtiva] = useState<MotoAvaria | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [, setRelogio] = useState(0);

  const [tecnico, setTecnico] = useState("");
  const [solucao, setSolucao] = useState("");

  const fetchAvarias = useCallback(async () => {
    const trintaDias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data, error }, { data: resolvidos }] = await Promise.all([
      supabase
        .from('motos')
        .select(`*, montador:funcionarios!motos_montador_id_fkey(nome)`)
        .like('status', 'avaria_%') // Pega tudo que começa com avaria_
        .order('updated_at', { ascending: true }), // mais antigas primeiro
      supabase
        .from('historico_avarias')
        .select('id, sku, modelo, tipo_avaria, descricao_problema, descricao_solucao, tecnico_nome, created_at, data_resolucao')
        .eq('status_ticket', 'resolvido')
        .gte('data_resolucao', trintaDias)
        .order('data_resolucao', { ascending: false })
        .limit(20),
    ]);

    if (error) toast.error("Erro ao carregar o pátio de avarias.");
    else if (data) setMotos(data as MotoAvaria[]);
    if (resolvidos) setHistorico(resolvidos as ReparoHistorico[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    fetchAvarias();
    const interval = setInterval(fetchAvarias, 30000);
    const relogio = setInterval(() => setRelogio(r => r + 1), 60000);
    return () => { clearInterval(interval); clearInterval(relogio); };
  }, [fetchAvarias]);

  // Sugestões para o campo "técnico" (equipe ativa)
  useEffect(() => {
    supabase.from('funcionarios').select('nome').eq('ativo', true).order('nome').then(({ data }) => {
      if (data) setTecnicosSugeridos(data.map((f: { nome: string }) => f.nome));
    });
  }, []);

  const abrirReparo = (moto: MotoAvaria) => {
    setMotoAtiva(moto);
    setTecnico("");
    setSolucao("");
    setModalOpen(true);
  };

  const handleReparo = async () => {
    if (!motoAtiva) return;
    const nomeTecnico = tecnico.trim();
    const descricaoSolucao = solucao.trim();
    if (!nomeTecnico || !descricaoSolucao) return toast.warning("Preencha Técnico e Solução");
    setSalvando(true);

    try {
        // 1. Devolve para Qualidade (somente se continuar no pátio de avarias)
        const { data, error } = await supabase.from('motos').update({
            status: 'em_analise',
            localizacao: 'Pátio Qualidade (Retorno Avaria)',
            tecnico_reparo: nomeTecnico,
            detalhes_avaria: null,
            observacoes: `REPARO (${nomeTecnico}): ${descricaoSolucao}`,
            updated_at: new Date().toISOString()
        })
        .eq('id', motoAtiva.id)
        .eq('status', motoAtiva.status)
        .select('id');

        if (error) throw error;
        if (!data || data.length === 0) {
            toast.warning("Esta moto já saiu do pátio de avarias.");
            setModalOpen(false);
            fetchAvarias();
            return;
        }

        // 2. Fecha o histórico
        const { error: erroHistorico } = await supabase.from('historico_avarias').update({
            tecnico_nome: nomeTecnico,
            descricao_solucao: descricaoSolucao,
            data_resolucao: new Date().toISOString(),
            status_ticket: 'resolvido'
        }).eq('moto_id', motoAtiva.id).eq('status_ticket', 'pendente');
        if (erroHistorico) console.error("Erro ao fechar histórico:", erroHistorico);

        await registrarLog('REPARO_OFICINA', motoAtiva.sku, {
            tecnico: nomeTecnico,
            solucao: descricaoSolucao,
            tipo: motoAtiva.status,
            tempo_patio_min: minutosDesde(motoAtiva.updated_at)
        });
        toast.success("Reparo realizado! Enviada para reinspeção.");
        setModalOpen(false);
        fetchAvarias();
    } catch (err) {
        console.error(err);
        toast.error("Erro ao registrar o reparo. Tente novamente.");
    } finally {
        setSalvando(false);
    }
  };

  const porTipo = motos.reduce<Record<string, number>>((acc, m) => {
    acc[m.status] = (acc[m.status] || 0) + 1;
    return acc;
  }, {});

  return (
      <div className="space-y-6 pb-20">
        <PageHeader
          titulo="Avarias"
          descricao="Pátio de segregação: motos reprovadas pela qualidade aguardando reparo. Depois do conserto registrado, a moto volta para a inspeção (E3)."
          acoes={
            <Button variant="outline" size="sm" onClick={fetchAvarias} className="gap-1.5">
              <RefreshCw className="size-3.5" /> Atualizar
            </Button>
          }
        />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard
            rotulo="No pátio"
            valor={motos.length}
            icone={AlertOctagon}
            tom={motos.length > 0 ? "perigo" : "sucesso"}
            destacar={motos.length > 0}
            carregando={carregando}
            className="col-span-2 md:col-span-1"
          />
          {TIPOS_AVARIA.map((t) => (
            <StatCard key={t.valor} rotulo={t.rotulo} valor={porTipo[t.valor] ?? 0} tom="neutro" carregando={carregando} />
          ))}
        </div>

        <Dica titulo="Como registrar um reparo">
          Toque em REALIZAR REPARO, anexe fotos do conserto, informe o técnico e o que foi feito. A moto sai do pátio e entra de novo na fila de
          inspeção; o problema e a solução ficam no prontuário do chassi.
        </Dica>

        <div className="space-y-4">
            {carregando ? (
                [1, 2].map(i => <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />)
            ) : motos.length === 0 ? (
                <EmptyState icone={CheckCircle2} titulo="Pátio vazio" descricao="Nenhuma moto aguardando reparo. Motos reprovadas na Qualidade (E3) aparecem aqui." />
            ) : motos.map(moto => {
                const tempo = minutosDesde(moto.updated_at);
                const maisDeUmDia = tempo >= 24 * 60;
                return (
                <article key={moto.id} className="overflow-hidden rounded-lg border border-l-[3px] border-l-destructive bg-card" data-chassi={moto.sku}>
                    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-painel-cabecalho px-4 py-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-3">
                            <p className="text-lg font-semibold leading-tight">{moto.modelo}</p>
                            <span className="flex items-center gap-1.5 rounded-sm border border-destructive/40 bg-card px-2 py-0.5 text-xs font-medium">
                                <Led estado="critico" className="size-2" /> {rotuloAvaria(moto.status)}
                            </span>
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Clock className="size-3.5" />
                                <span className={maisDeUmDia ? "font-semibold text-foreground" : undefined}>No pátio há {formatarDuracaoMin(tempo)}</span>
                                {maisDeUmDia && <Led estado="atencao" className="size-2" />}
                            </span>
                        </div>
                        <PlacaChassi chassi={moto.sku} tamanho="md" />
                    </header>
                    <div className="flex flex-col gap-5 p-4 md:flex-row md:items-start md:justify-between lg:p-5">
                        <div className="min-w-0 flex-1 space-y-3">
                            <div className="rounded-sm border border-l-[3px] border-l-destructive px-3 py-2">
                                <p className="rotulo text-sutil">Problema relatado</p>
                                <p className="mt-1 text-sm font-medium">{moto.detalhes_avaria || '—'}</p>
                            </div>
                            <p className="text-xs text-sutil">Montada por: <span className="text-foreground">{moto.montador?.nome || '—'}</span></p>
                            <FotosMoto motoId={moto.id} sku={moto.sku} etapas={['avaria', 'qualidade']} titulo="Fotos do defeito" />
                        </div>
                        {podeReparar && (
                          <Button onClick={() => abrirReparo(moto)} variant="grafite" className="h-12 shrink-0 px-6 font-semibold">
                              <Wrench /> REALIZAR REPARO
                          </Button>
                        )}
                    </div>
                </article>
                );
            })}
        </div>

        <Painel titulo="Reparos concluídos" icone={History} meta="Últimos 30 dias" semRecuo>
            {historico.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhum reparo concluído no período.</p>
            ) : (
              <ul className="divide-y">
                {historico.map(h => {
                  const duracao = h.data_resolucao ? Math.max(0, Math.round((new Date(h.data_resolucao).getTime() - new Date(h.created_at).getTime()) / 60000)) : null;
                  return (
                    <li key={h.id} className="flex flex-col gap-2 px-4 py-3 text-sm md:flex-row md:items-center md:gap-6">
                      <div className="shrink-0 md:w-60">
                        <p className="truncate font-semibold text-foreground">{h.modelo}</p>
                        <p className="font-mono text-xs text-sutil">{h.sku}</p>
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="flex items-start gap-1.5 text-xs"><OctagonAlert className="mt-px size-3.5 shrink-0 text-destructive" /> <span><span className="font-semibold">{rotuloAvaria(h.tipo_avaria)}</span> · {h.descricao_problema}</span></p>
                        <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="mt-px size-3.5 shrink-0 text-success" /> <span>Solução: {h.descricao_solucao || '—'}</span></p>
                      </div>
                      <div className="shrink-0 text-xs text-sutil md:text-right">
                        <p className="flex items-center gap-1 md:justify-end"><User className="size-3" /> {h.tecnico_nome || '—'}</p>
                        <p>{h.data_resolucao ? new Date(h.data_resolucao).toLocaleDateString('pt-BR') : ''}{duracao !== null ? ` · resolvido em ${formatarDuracaoMin(duracao)}` : ''}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
        </Painel>

        <Dialog open={modalOpen} onOpenChange={(o) => !salvando && setModalOpen(o)}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Wrench className="size-5" /> Registro de reparo</DialogTitle>
                  <DialogDescription>Depois do reparo, a moto volta para a fila de inspeção de qualidade (E3).</DialogDescription>
                </DialogHeader>
                {motoAtiva && (
                  <div className="space-y-2 rounded-md border bg-background/60 p-3">
                    <p className="font-semibold">{motoAtiva.modelo}</p>
                    <PlacaChassi chassi={motoAtiva.sku} tamanho="sm" />
                    {motoAtiva.detalhes_avaria && (
                      <p className="text-sm"><span className="font-semibold">Problema relatado:</span> {motoAtiva.detalhes_avaria}</p>
                    )}
                  </div>
                )}
                <div className="space-y-4 py-1">
                    {motoAtiva && (
                      <FotosMoto motoId={motoAtiva.id} sku={motoAtiva.sku} etapas={['reparo']} etapaEnvio="reparo" titulo="Fotos do reparo (recomendado)" />
                    )}
                    <div className="space-y-2">
                      <label className="rotulo text-sutil">Técnico responsável</label>
                      <Input placeholder="Nome do Técnico" value={tecnico} onChange={e => setTecnico(e.target.value)} list="lista-tecnicos" maxLength={80} />
                      <datalist id="lista-tecnicos">
                        {tecnicosSugeridos.map(n => <option key={n} value={n} />)}
                      </datalist>
                    </div>
                    <div className="space-y-2">
                      <label className="rotulo text-sutil">Serviço realizado</label>
                      <Textarea placeholder="O que foi feito? (Peça trocada, ajuste...)" value={solucao} onChange={e => setSolucao(e.target.value)} rows={3} maxLength={500} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={salvando}>Cancelar</Button>
                    <Button variant="grafite" onClick={handleReparo} disabled={salvando || !tecnico.trim() || !solucao.trim()} className="font-semibold">
                      {salvando ? <><Loader2 className="animate-spin" /> Salvando...</> : "CONCLUIR SERVIÇO"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      </div>
  );
}
