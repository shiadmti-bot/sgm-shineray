"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePode } from "@/lib/auth";
import { PageHeader } from "@/components/sgm/PageHeader";
import { EmptyState } from "@/components/sgm/EmptyState";
import { FotosMoto } from "@/components/sgm/FotosMoto";
import { Wrench, AlertOctagon, CheckCircle2, History, Clock, Loader2, RefreshCw, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { registrarLog } from "@/lib/logger";
import { rotuloAvaria } from "@/lib/constantes";
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
      <div className="space-y-6 animate-in fade-in pb-20">
        <PageHeader
          icone={AlertOctagon}
          titulo="Pátio de avarias"
          descricao="Motos segregadas pela qualidade aguardando reparo. Registre o conserto com fotos."
          acoes={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-red-700 border-red-200 bg-red-50 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900 px-3 py-1">
              {motos.length} no pátio
            </Badge>
            {Object.entries(porTipo).map(([tipo, qtd]) => (
              <Badge key={tipo} variant="secondary" className="px-2 py-1">{rotuloAvaria(tipo)}: {qtd}</Badge>
            ))}
            <Button variant="ghost" size="icon" onClick={fetchAvarias} title="Atualizar" aria-label="Atualizar pátio">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
          }
        />

        <div className="grid grid-cols-1 gap-4">
            {carregando ? (
                [1, 2].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
            ) : motos.length === 0 ? (
                <EmptyState icone={CheckCircle2} titulo="Pátio limpo" descricao="Nenhuma moto aguardando reparo." />
            ) : motos.map(moto => {
                const tempo = minutosDesde(moto.updated_at);
                return (
                <Card key={moto.id} className="border-l-8 border-l-red-600 bg-red-50/20 dark:bg-red-950/10">
                    <CardContent className="p-6 flex flex-col md:flex-row justify-between md:items-center gap-6">
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-3 mb-2">
                                <AlertOctagon className="text-red-600 w-6 h-6 shrink-0"/>
                                <h3 className="text-xl font-bold">{moto.modelo}</h3>
                                <Badge variant="destructive">{rotuloAvaria(moto.status)}</Badge>
                                <span className={`text-xs font-bold flex items-center gap-1 ${tempo >= 24 * 60 ? 'text-red-600' : 'text-muted-foreground'}`}>
                                  <Clock className="w-3 h-3" /> No pátio há {formatarDuracaoMin(tempo)}
                                </span>
                            </div>
                            <div className="space-y-1 text-sm">
                                <p><strong>Chassi:</strong> <span className="font-mono">{moto.sku}</span></p>
                                <p><strong>Problema:</strong> <span className="text-red-600 font-bold uppercase">{moto.detalhes_avaria || '—'}</span></p>
                                <p className="text-muted-foreground">Origem: {moto.montador?.nome || '—'}</p>
                            </div>
                            <FotosMoto motoId={moto.id} sku={moto.sku} etapas={['avaria', 'qualidade']} titulo="Fotos do defeito" className="mt-4" />
                        </div>
                        {podeReparar && (
                          <Button onClick={() => abrirReparo(moto)} className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white h-12 px-6">
                              <Wrench className="mr-2 w-4 h-4"/> REALIZAR REPARO
                          </Button>
                        )}
                    </CardContent>
                </Card>
                );
            })}
        </div>

        {/* Histórico recente para acompanhamento da gestão */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><History className="w-5 h-5 text-muted-foreground" /> Reparos concluídos (últimos 30 dias)</CardTitle>
            <CardDescription>Problema, solução aplicada e tempo até a resolução.</CardDescription>
          </CardHeader>
          <CardContent>
            {historico.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum reparo concluído no período.</p>
            ) : (
              <div className="divide-y divide-border">
                {historico.map(h => {
                  const duracao = h.data_resolucao ? Math.max(0, Math.round((new Date(h.data_resolucao).getTime() - new Date(h.created_at).getTime()) / 60000)) : null;
                  return (
                    <div key={h.id} className="py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-6 text-sm">
                      <div className="md:w-56 shrink-0">
                        <p className="font-bold text-foreground truncate">{h.modelo}</p>
                        <p className="font-mono text-xs text-muted-foreground">{h.sku}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-red-600 dark:text-red-400 text-xs font-bold uppercase">{rotuloAvaria(h.tipo_avaria)} · {h.descricao_problema}</p>
                        <p className="text-emerald-700 dark:text-emerald-400 text-xs mt-0.5">Solução: {h.descricao_solucao || '—'}</p>
                      </div>
                      <div className="md:text-right text-xs text-muted-foreground shrink-0">
                        <p className="flex md:justify-end items-center gap-1"><User className="w-3 h-3" /> {h.tecnico_nome || '—'}</p>
                        <p>{h.data_resolucao ? new Date(h.data_resolucao).toLocaleDateString('pt-BR') : ''}{duracao !== null ? ` · resolvido em ${formatarDuracaoMin(duracao)}` : ''}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={modalOpen} onOpenChange={(o) => !salvando && setModalOpen(o)}>
            <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Wrench className="w-5 h-5" /> Registro de Manutenção</DialogTitle>
                  <DialogDescription>
                    {motoAtiva ? `${motoAtiva.modelo} · ${motoAtiva.sku}` : ''} — após o reparo a moto volta para a inspeção de qualidade.
                  </DialogDescription>
                </DialogHeader>
                {motoAtiva?.detalhes_avaria && (
                  <div className="text-sm bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 rounded-lg p-3">
                    <span className="font-bold text-red-700 dark:text-red-400">Problema relatado:</span> {motoAtiva.detalhes_avaria}
                  </div>
                )}
                <div className="space-y-4 py-2">
                    {motoAtiva && (
                      <FotosMoto motoId={motoAtiva.id} sku={motoAtiva.sku} etapas={['reparo']} etapaEnvio="reparo" titulo="Fotos do reparo (recomendado)" />
                    )}
                    <div className="space-y-2">
                      <label className="text-xs font-black text-muted-foreground uppercase tracking-wider">Técnico responsável</label>
                      <Input placeholder="Nome do Técnico" value={tecnico} onChange={e => setTecnico(e.target.value)} list="lista-tecnicos" maxLength={80} />
                      <datalist id="lista-tecnicos">
                        {tecnicosSugeridos.map(n => <option key={n} value={n} />)}
                      </datalist>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-muted-foreground uppercase tracking-wider">Serviço realizado</label>
                      <Textarea placeholder="O que foi feito? (Peça trocada, ajuste...)" value={solucao} onChange={e => setSolucao(e.target.value)} rows={3} maxLength={500} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={salvando}>Cancelar</Button>
                    <Button onClick={handleReparo} disabled={salvando || !tecnico.trim() || !solucao.trim()} className="bg-green-600 hover:bg-green-700 text-white">
                      {salvando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : "CONCLUIR SERVIÇO"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      </div>
  );
}
