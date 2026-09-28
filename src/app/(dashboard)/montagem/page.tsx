"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Wrench, Play, Pause, CheckCircle2, AlertTriangle, ArrowRight, RotateCcw, Loader2, Clock, PaintBucket, ScanBarcode, Timer, Trash2, XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { registrarLog } from "@/lib/logger";
import { getUsuarioLogado, podeAgora, usePode } from "@/lib/auth";
import { PageHeader } from "@/components/sgm/PageHeader";
import { EmptyState } from "@/components/sgm/EmptyState";
import { useConfigGeral } from "@/lib/config-sistema";
import { MOTIVOS_PAUSA } from "@/lib/constantes";
import { formatarCronometro, formatarDuracaoMin, minutosDesde } from "@/lib/datas";
import { tocarSom } from "@/lib/sons";
import { cn } from "@/lib/utils";

interface Moto {
  id: string;
  sku: string;
  modelo: string;
  status: string;
  cor?: string | null;
  cor_banco?: string | null;
  localizacao?: string | null;
  observacoes?: string | null;
  inicio_montagem?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  rework_count?: number | null;
  montador_id?: string | null;
  supervisor?: { nome: string } | null;
  montador?: { nome: string; ativo: boolean | null } | null;
}

const MOTIVOS_EXCLUSAO = ["Chassi bipado por engano", "Moto duplicada na fila", "Caixa devolvida ao fornecedor"];

export default function MontagemPage() {
  const { config } = useConfigGeral();
  const CHECKLIST_ITENS = config.checklist;
  const podeRemover = usePode("montagem.remover");

  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useState<'fila' | 'producao'>('fila');

  const [fila, setFila] = useState<Moto[]>([]);
  const [filaRetrabalho, setFilaRetrabalho] = useState<Moto[]>([]);
  const [motoAtiva, setMotoAtiva] = useState<Moto | null>(null);
  const [processando, setProcessando] = useState(false);

  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  // Inputs Controlados
  const [corMotoInput, setCorMotoInput] = useState("");
  const [corBancoInput, setCorBancoInput] = useState("");

  // Timer Visual
  const [agora, setAgora] = useState(() => Date.now());

  const [aguardandoAutorizacao, setAguardandoAutorizacao] = useState(false);

  // Diálogos
  const [dialogoPausa, setDialogoPausa] = useState(false);
  const [motivoPausa, setMotivoPausa] = useState("");
  const [motivoPausaOutro, setMotivoPausaOutro] = useState("");
  const [dialogoFinalizar, setDialogoFinalizar] = useState(false);
  const [motoExcluindo, setMotoExcluindo] = useState<Moto | null>(null);
  const [motivoExclusao, setMotivoExclusao] = useState(MOTIVOS_EXCLUSAO[0]);

  const carregarListas = useCallback(async (userId: string) => {
    const [{ data: retrabalho }, { data: caixas }] = await Promise.all([
      supabase
        .from('motos')
        .select(`*, supervisor:funcionarios!motos_supervisor_id_fkey(nome), montador:funcionarios!motos_montador_id_fkey(nome, ativo)`)
        .eq('status', 'retrabalho_montagem')
        .order('updated_at', { ascending: true }),
      supabase
        .from('motos')
        .select('*')
        .eq('status', 'aguardando_montagem')
        .order('created_at', { ascending: true }),
    ]);

    // Retrabalho volta para quem montou; supervisores (e montadores, se quem montou saiu da empresa) também podem assumir
    if (retrabalho) {
      const aprovaPausas = podeAgora('pausas.aprovar');
      setFilaRetrabalho((retrabalho as Moto[]).filter((m) => m.montador_id === userId || aprovaPausas || m.montador?.ativo === false));
    }
    if(caixas) setFila(caixas as Moto[]);
  }, []);

  const verificarEstadoAtual = useCallback(async () => {
    const user = getUsuarioLogado();
    if (!user) { setLoading(false); return; }

    try {
        const { data: ativas } = await supabase
          .from('motos')
          .select('*')
          .eq('montador_id', user.id)
          .in('status', ['em_producao', 'pausado'])
          .order('updated_at', { ascending: false });

        const ativa = ativas && ativas.length > 0 ? (ativas[0] as Moto) : null;

        if (ativa) {
          setMotoAtiva(ativa);
          setCorMotoInput(ativa.cor || "");
          setCorBancoInput(ativa.cor_banco || "");

          if (ativa.status !== 'pausado') {
             const { data: pendente } = await supabase.from('solicitacoes_pausa').select('id').eq('moto_id', ativa.id).eq('status', 'pendente').limit(1);
             setAguardandoAutorizacao(!!pendente && pendente.length > 0);
          } else {
             setAguardandoAutorizacao(false);
          }

          setModo(ativa.status === 'pausado' ? 'fila' : 'producao');

          let salvo: Record<string, boolean> | null = null;
          try { salvo = JSON.parse(localStorage.getItem(`checklist_${ativa.id}`) || 'null'); } catch { salvo = null; }
          setChecklist(salvo && typeof salvo === 'object' ? salvo : {});
          if (ativa.status === 'pausado') await carregarListas(user.id);
        } else {
          setMotoAtiva(null);
          setAguardandoAutorizacao(false);
          setModo('fila');
          await carregarListas(user.id);
        }
    } catch (err) {
        console.error(err);
        toast.error("Falha ao sincronizar com a linha.");
    } finally {
        setLoading(false);
    }
  }, [carregarListas]);

  // Carga inicial
  useEffect(() => {
    verificarEstadoAtual();
  }, [verificarEstadoAtual]);

  // Atualização da fila (sem piscar a tela)
  useEffect(() => {
    if (modo !== 'fila') return;
    const interval = setInterval(() => {
        const user = getUsuarioLogado();
        if (user) carregarListas(user.id);
    }, 5000);
    return () => clearInterval(interval);
  }, [modo, carregarListas]);

  // Timer (1s) — o tempo é sempre calculado a partir do início registrado no banco
  useEffect(() => {
      if (!motoAtiva || modo !== 'producao' || !motoAtiva.inicio_montagem || aguardandoAutorizacao) return;
      const timer = setInterval(() => setAgora(Date.now()), 1000);
      return () => clearInterval(timer);
  }, [motoAtiva, modo, aguardandoAutorizacao]);

  // Salva o checklist localmente
  useEffect(() => {
      if (motoAtiva && Object.keys(checklist).length > 0) {
          localStorage.setItem(`checklist_${motoAtiva.id}`, JSON.stringify(checklist));
      }
  }, [checklist, motoAtiva]);

  // Resposta do supervisor à solicitação de pausa (Realtime + verificação periódica de segurança)
  useEffect(() => {
    if (!aguardandoAutorizacao || !motoAtiva) return;
    const user = getUsuarioLogado();
    const motoId = motoAtiva.id;

    const tratar = (status?: string) => {
        if (status === 'aprovado') {
           toast.success("Pausa Autorizada!");
           tocarSom('sucesso');
           setAguardandoAutorizacao(false);
           verificarEstadoAtual();
        } else if (status === 'rejeitado') {
           toast.error("Solicitação negada. Continue a montagem.");
           tocarSom('erro');
           setAguardandoAutorizacao(false);
        }
    };

    const channel = supabase.channel('minhas-solicitacoes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'solicitacoes_pausa', filter: `montador_id=eq.${user?.id}` }, (payload) => {
          tratar((payload.new as { status?: string }).status);
      }).subscribe();

    const verificar = setInterval(async () => {
        const { data } = await supabase.from('solicitacoes_pausa').select('status').eq('moto_id', motoId).order('created_at', { ascending: false }).limit(1);
        if (data && data[0] && data[0].status !== 'pendente') tratar(data[0].status);
    }, 10000);

    return () => { supabase.removeChannel(channel); clearInterval(verificar); };
  }, [aguardandoAutorizacao, motoAtiva, verificarEstadoAtual]);

  async function iniciarTrabalho(moto: Moto, ehRetrabalho: boolean) {
    const user = getUsuarioLogado();
    if (!user) return;
    if (motoAtiva) return toast.warning("Finalize ou retome a moto atual antes de iniciar outra.");

    const updateData: Record<string, unknown> = {
        status: 'em_producao',
        montador_id: user.id,
        localizacao: `Box ${user.nome.split(' ')[0]}`,
        updated_at: new Date().toISOString()
    };

    if (!ehRetrabalho) {
        updateData.inicio_montagem = new Date().toISOString();
    }

    setProcessando(true);

    // Só assume a moto se ela continuar no status esperado (dois montadores não pegam a mesma caixa)
    const { data, error } = await supabase
      .from('motos')
      .update(updateData)
      .eq('id', moto.id)
      .eq('status', ehRetrabalho ? 'retrabalho_montagem' : 'aguardando_montagem')
      .select('*');

    setProcessando(false);

    if (error) {
      toast.error("Erro ao iniciar.");
      return;
    }
    if (!data || data.length === 0) {
      toast.warning("Esta moto já foi assumida por outro montador.");
      carregarListas(user.id);
      return;
    }

    toast.success(ehRetrabalho ? "Corrigindo Erro..." : "Montagem Iniciada!");
    await registrarLog('INICIO_MONTAGEM', moto.sku, { retrabalho: ehRetrabalho, modelo: moto.modelo });

    const motoAtualizada = data[0] as Moto;
    setMotoAtiva(motoAtualizada);
    setChecklist({});
    setAgora(Date.now());
    setModo('producao');
    setCorMotoInput(motoAtualizada.cor || "");
    setCorBancoInput(motoAtualizada.cor_banco || "");
  }

  const handleMarcarTudo = () => {
    const novoCheck: Record<string, boolean> = {};
    CHECKLIST_ITENS.forEach(i => novoCheck[i] = true);
    setChecklist(novoCheck);
    toast.success("Checklist preenchido!");
  };

  const salvarCores = (cor: string, banco: string) => {
    if (!motoAtiva || motoAtiva.status !== 'em_producao') return;
    supabase.from('motos').update({ cor: cor || null, cor_banco: banco || null })
      .eq('id', motoAtiva.id).eq('status', 'em_producao')
      .then(({ error }) => { if (error) console.error("Cores não salvas:", error.message); });
  };
  const escolherCorMoto = (cor: string) => { setCorMotoInput(cor); salvarCores(cor, corBancoInput); };
  const escolherCorBanco = (cor: string) => { setCorBancoInput(cor); salvarCores(corMotoInput, cor); };

  const toggleCheck = (item: string) => {
    setChecklist(prev => ({ ...prev, [item]: !prev[item] }));
  };

  const pendentesChecklist = CHECKLIST_ITENS.filter(i => !checklist[i]);

  const abrirFinalizacao = () => {
    if (!motoAtiva) return;
    if (pendentesChecklist.length > 0) return toast.error(`Checklist incompleto! Faltam ${pendentesChecklist.length} item(ns).`);
    if (!corMotoInput || !corBancoInput) return toast.warning("Selecione as cores.");
    setDialogoFinalizar(true);
  };

  const finalizarMontagem = async () => {
    if (!motoAtiva) return;
    setProcessando(true);

    const updatePayload: Record<string, unknown> = {
        status: 'em_analise',
        fim_montagem: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        localizacao: 'Pátio de Qualidade',
        cor: corMotoInput,
        cor_banco: corBancoInput
    };

    if (motoAtiva.observacoes?.includes('RETRABALHO')) updatePayload.observacoes = null;

    const { data, error } = await supabase
      .from('motos')
      .update(updatePayload)
      .eq('id', motoAtiva.id)
      .eq('status', 'em_producao')
      .select('id');

    setProcessando(false);
    setDialogoFinalizar(false);

    if (error) {
      toast.error("Erro ao finalizar.");
      return;
    }
    if (!data || data.length === 0) {
      toast.warning("A moto não está mais em produção (pode ter sido pausada). Atualizando...");
      verificarEstadoAtual();
      return;
    }

    toast.success("Enviado para Qualidade.");
    tocarSom('sucesso');
    const minutos = motoAtiva.inicio_montagem ? minutosDesde(motoAtiva.inicio_montagem) : null;
    await registrarLog('PRODUCAO_FIM', motoAtiva.sku, { cor: corMotoInput, banco: corBancoInput, tempo_min: minutos });
    localStorage.removeItem(`checklist_${motoAtiva.id}`);

    setMotoAtiva(null);
    setCorMotoInput(""); setCorBancoInput("");
    setModo('fila');
    verificarEstadoAtual();
  };

  const abrirSolicitacaoPausa = () => {
    setMotivoPausa("");
    setMotivoPausaOutro("");
    setDialogoPausa(true);
  };

  const enviarSolicitacaoPausa = async () => {
      if (!motoAtiva) return;
      const motivo = motivoPausa === 'Outro' ? motivoPausaOutro.trim() : motivoPausa;
      if (!motivo) return toast.warning("Informe o motivo da pausa.");

      const user = getUsuarioLogado();
      setProcessando(true);
      const { error } = await supabase.from('solicitacoes_pausa').insert({ montador_id: user?.id, moto_id: motoAtiva.id, motivo, status: 'pendente' });
      setProcessando(false);

      if (error) {
          console.error(error);
          toast.error("Não foi possível enviar a solicitação. Tente novamente.");
          return;
      }
      setDialogoPausa(false);
      setAguardandoAutorizacao(true);
      await registrarLog('PAUSA_SOLICITADA', motoAtiva.sku, { motivo });
      toast.info("Solicitação enviada! Aguarde...");
  };

  const cancelarSolicitacaoPausa = async () => {
      if (!motoAtiva) return;
      setProcessando(true);
      const { error } = await supabase.from('solicitacoes_pausa').delete().eq('moto_id', motoAtiva.id).eq('status', 'pendente');
      setProcessando(false);
      if (error) {
          toast.error("Não foi possível cancelar. Aguarde a resposta do supervisor.");
          return;
      }
      setAguardandoAutorizacao(false);
      await registrarLog('PAUSA_CANCELADA', motoAtiva.sku, { cancelada_por: 'montador' });
      toast.success("Solicitação cancelada.");
  };

  // Retomar: o banco desconta o tempo parado do cronômetro e encerra o registro da pausa
  const handleRetomar = async () => {
      if (!motoAtiva) return;
      setProcessando(true);
      try {
        const { data, error } = await supabase.from('motos')
          .update({ status: 'em_producao' })
          .eq('id', motoAtiva.id).eq('status', 'pausado').select('id');

        if (error) throw error;
        if (!data || data.length === 0) {
          toast.warning("A moto não está mais pausada. Atualizando...");
        } else {
          const { data: pausa } = await supabase.from('pausas_producao')
            .select('inicio, fim').eq('moto_id', motoAtiva.id).not('fim', 'is', null)
            .order('fim', { ascending: false }).limit(1);
          const minutos = pausa?.[0] ? Math.round((new Date(pausa[0].fim).getTime() - new Date(pausa[0].inicio).getTime()) / 60000) : null;
          toast.success("Produção retomada");
          await registrarLog('PAUSA_RETOMADA', motoAtiva.sku, { pausa_min: minutos });
        }
        verificarEstadoAtual();
      } catch (err) {
        toast.error("Erro ao retomar produção.");
        console.error(err);
      } finally {
        setProcessando(false);
      }
  }

  async function handleExcluirMoto() {
     const moto = motoExcluindo;
     if (!moto) return;

     setProcessando(true);
     const { data, error } = await supabase.from('motos').delete().eq('id', moto.id).eq('status', 'aguardando_montagem').select('id');
     setProcessando(false);

     if (error) {
         toast.error("Erro ao excluir.");
     } else if (!data || data.length === 0) {
         toast.warning("A moto não está mais aguardando montagem e não foi removida.");
     } else {
         toast.success("Moto removida da linha.");
         await registrarLog('EXCLUSAO', moto.sku, { modelo: moto.modelo, motivo: motivoExclusao, origem: 'fila_montagem' });
         // Atualiza a lista localmente para feedback instantâneo
         setFila(prev => prev.filter(m => m.id !== moto.id));
     }
     setMotoExcluindo(null);
  }

  if (loading) return (
    <div className="p-8 flex flex-col items-center justify-center h-full space-y-4">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <p className="text-muted-foreground animate-pulse">Sincronizando com a linha...</p>
    </div>
  );

  const decorridoMs = motoAtiva?.inicio_montagem ? Math.max(0, agora - new Date(motoAtiva.inicio_montagem).getTime()) : 0;
  const decorridoMin = decorridoMs / 60000;
  const atrasado = decorridoMin > config.limiteMontagemMin;
  const emRetrabalho = !!motoAtiva?.observacoes?.includes('RETRABALHO');

  return (
      <div className="space-y-6 animate-in fade-in pb-20">

        {modo === 'fila' && (
          <>
            <PageHeader
              icone={Wrench}
              titulo="Linha de montagem"
              descricao="Escolha a próxima caixa da fila ou corrija um retrabalho."
              acoes={<Badge variant="outline" className="h-8 px-3 text-sm">{fila.length} na fila</Badge>}
            />

            {motoAtiva && motoAtiva.status === 'pausado' && (
                <div className="mb-8 animate-in slide-in-from-top-4 duration-500">
                    <Card className="border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-900/20 shadow-xl">
                        <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                             <div className="flex items-center gap-4">
                                <Clock className="w-8 h-8 text-amber-600 shrink-0"/>
                                <div>
                                    <h3 className="text-xl font-bold text-foreground">Produção Pausada</h3>
                                    <p className="text-muted-foreground">{motoAtiva.modelo} - {motoAtiva.sku}</p>
                                    <p className="text-xs text-amber-600 mt-1 font-bold">O timer continuará de onde parou ao retomar.</p>
                                </div>
                             </div>
                             <Button onClick={handleRetomar} disabled={processando} className="h-12 text-lg font-bold bg-amber-600 hover:bg-amber-700 text-white">
                                {processando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Play className="w-5 h-5 mr-2 fill-current" />} RETOMAR
                             </Button>
                        </CardContent>
                    </Card>
                </div>
            )}

            {filaRetrabalho.length > 0 && (
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-red-600 mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" /> PRIORIDADE: RETRABALHO
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filaRetrabalho.map(moto => (
                            <Card key={moto.id} className="border-l-4 border-l-red-600 bg-red-50 dark:bg-red-900/20 shadow-lg">
                                <CardContent className="p-6 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                    <div>
                                        <Badge variant="destructive" className="mb-2 animate-pulse">CORRIGIR ERRO</Badge>
                                        <h3 className="text-xl font-bold">{moto.modelo}</h3>
                                        <p className="text-red-700 dark:text-red-400 font-bold mt-1">&quot;{moto.observacoes?.replace(/RETRABALHO.*?: /, '')}&quot;</p>
                                        <p className="text-xs text-muted-foreground mt-2">Reprovado por: {moto.supervisor?.nome || '—'}{moto.montador_id !== getUsuarioLogado()?.id && moto.montador?.nome ? ` · montada por ${moto.montador.nome}` : ''}</p>
                                    </div>
                                    <Button onClick={() => iniciarTrabalho(moto, true)} disabled={processando || !!motoAtiva} className="bg-red-600 hover:bg-red-700 text-white font-bold h-12">
                                        <RotateCcw className="w-5 h-5 mr-2" /> CORRIGIR
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            <div className={motoAtiva && motoAtiva.status === 'pausado' ? 'opacity-40 pointer-events-none grayscale' : ''}>
                <h3 className="text-lg font-bold text-foreground/90 mb-4 flex items-center gap-2">
                    <Wrench className="w-5 h-5" /> Fila de Produção
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {fila.length === 0 ? (
                    <EmptyState icone={Wrench} titulo="Nenhuma caixa aguardando" descricao="Assim que uma caixa for registrada na entrada, ela aparece aqui." className="col-span-full" />
                ) : (
                    fila.map((moto, idx) => (
                    <Card key={moto.id} className="hover:border-primary/60 transition-all border-l-4 border-l-transparent hover:border-l-primary">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start mb-4 gap-2">
                                <Badge variant="secondary" className="font-mono">{moto.sku}</Badge>
                                <Badge className={cn("border-0", idx === 0 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-info/10 text-info")}>
                                  {idx === 0 ? "PRÓXIMA" : "NOVA"}
                                </Badge>
                            </div>
                            <h3 className="text-xl font-bold mb-1">{moto.modelo}</h3>
                            <p className="text-muted-foreground text-sm">{moto.localizacao || 'Sem local'}</p>
                            <p className="text-xs text-muted-foreground mb-6 flex items-center gap-1 mt-1"><Clock className="w-3 h-3" /> Na fila há {formatarDuracaoMin(minutosDesde(moto.created_at))}</p>
                            <div className="flex gap-2">
                                <Button onClick={() => iniciarTrabalho(moto, false)} disabled={processando} className="flex-1 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white font-bold">
                                    <Play className="w-4 h-4 mr-2" /> INICIAR
                                </Button>
                                {podeRemover && (
                                  <Button variant="outline" size="icon" className="text-destructive" onClick={() => { setMotivoExclusao(MOTIVOS_EXCLUSAO[0]); setMotoExcluindo(moto); }} title="Remover da linha" aria-label="Remover da linha">
                                      <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                    ))
                )}
                </div>
            </div>
          </>
        )}

        {modo === 'producao' && motoAtiva && (
          <div className="max-w-4xl mx-auto">
             <div className={cn(
                emRetrabalho ? 'bg-primary' : atrasado ? 'bg-amber-600' : 'bg-zinc-900 dark:bg-zinc-800',
                "text-white p-6 rounded-t-2xl shadow-lg flex flex-col md:flex-row justify-between items-center gap-4 transition-colors duration-500")}>
                <div>
                   <p className="text-white/80 text-sm font-bold uppercase tracking-widest mb-1 flex items-center gap-2">
                       {emRetrabalho ? <><RotateCcw className="w-4 h-4"/> CORREÇÃO EM ANDAMENTO</> :
                        <><Play className="w-4 h-4 animate-pulse"/> EM PRODUÇÃO</>}
                   </p>
                   <h1 className="text-3xl font-black">{motoAtiva.modelo}</h1>
                   <div className="flex items-center gap-2 mt-1">
                        <ScanBarcode className="w-4 h-4 opacity-70"/>
                        <p className="opacity-90 font-mono tracking-widest">{motoAtiva.sku}</p>
                   </div>
                </div>

                <div className="bg-white/20 backdrop-blur-md px-6 py-3 rounded-xl text-center min-w-[140px] border border-white/30" title={atrasado ? `Acima do tempo de referência (${config.limiteMontagemMin} min)` : undefined}>
                    <span className="text-xs uppercase font-bold opacity-80 mb-1 flex items-center justify-center gap-1"><Timer className="w-3 h-3"/> Tempo</span>
                    <span className="text-3xl font-mono font-black tracking-widest">{formatarCronometro(decorridoMs)}</span>
                    {atrasado && <span className="block text-[10px] font-bold uppercase mt-1">Acima de {config.limiteMontagemMin} min</span>}
                </div>
             </div>

            <Card className="relative rounded-t-none border-t-0 bg-card shadow-xl">
              <CardContent className="p-6 md:p-8 space-y-8">

                {aguardandoAutorizacao && (
                    <div className="absolute inset-0 bg-white/90 dark:bg-black/90 z-20 flex flex-col items-center justify-center rounded-b-xl backdrop-blur-sm animate-in fade-in p-6 text-center">
                        <Loader2 className="w-16 h-16 text-primary animate-spin mb-4" />
                        <h2 className="text-2xl font-bold text-foreground">Solicitação Enviada!</h2>
                        <p className="text-muted-foreground text-lg">Aguarde a liberação do supervisor...</p>
                        <p className="text-xs text-muted-foreground mt-2">O timer será pausado assim que autorizado.</p>
                        <Button variant="outline" className="mt-6" onClick={cancelarSolicitacaoPausa} disabled={processando}>
                            <XCircle className="w-4 h-4 mr-2" /> Cancelar solicitação
                        </Button>
                    </div>
                )}

                {emRetrabalho && (
                    <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-900/50 animate-in slide-in-from-top-2">
                        <p className="font-bold text-red-700 dark:text-red-400 flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> O que precisa ser corrigido:</p>
                        <p className="text-lg mt-1 pl-7 font-medium">{motoAtiva.observacoes?.replace('RETRABALHO:', '')}</p>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row justify-between items-center border-b border-border pb-6 gap-4">
                   <h2 className="text-xl font-bold flex items-center gap-2">
                     <CheckCircle2 className="w-6 h-6 text-green-600"/> Checklist de Segurança
                     <Badge variant="secondary" className="ml-1">{CHECKLIST_ITENS.length - pendentesChecklist.length}/{CHECKLIST_ITENS.length}</Badge>
                   </h2>
                   <div className="flex gap-2 w-full sm:w-auto">
                      <Button variant="outline" onClick={abrirSolicitacaoPausa} className="flex-1 sm:flex-none text-amber-600 border-amber-200 hover:bg-amber-50 dark:border-amber-900/50 dark:hover:bg-amber-950/30">
                         <Pause className="w-4 h-4 mr-2" /> PAUSAR
                      </Button>
                      <Button variant="secondary" onClick={handleMarcarTudo} className="flex-1 sm:flex-none">
                         MARCAR TUDO
                      </Button>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {CHECKLIST_ITENS.map((item) => (
                    <div key={item} role="checkbox" aria-checked={!!checklist[item]} tabIndex={0}
                      onClick={() => toggleCheck(item)}
                      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleCheck(item); } }}
                      className={`flex items-center space-x-3 p-4 rounded-xl border-2 transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring ${checklist[item] ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-border hover:border-slate-300'}`}>
                      <Checkbox checked={!!checklist[item]} tabIndex={-1} className="data-[state=checked]:bg-green-500 w-5 h-5 pointer-events-none" />
                      <span className="text-sm font-medium select-none">{item}</span>
                    </div>
                  ))}
                </div>

                <div className="p-6 bg-muted/50 rounded-xl border border-border">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase mb-4 flex items-center gap-2"><PaintBucket className="w-4 h-4"/> Acabamento Final</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-bold">Cor da Carenagem</label>
                            <Select value={corMotoInput} onValueChange={escolherCorMoto}>
                                <SelectTrigger className="h-12 bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    {config.coresCarenagem.map(c => (
                                      <SelectItem key={c.nome} value={c.nome}>
                                        <span className="flex items-center gap-2">
                                          <span className="w-3 h-3 rounded-full border border-slate-300 shrink-0" style={{ backgroundColor: c.hex }} />
                                          {c.descricao || c.nome}
                                        </span>
                                      </SelectItem>
                                    ))}
                                    {corMotoInput && !config.coresCarenagem.some(c => c.nome === corMotoInput) && (
                                      <SelectItem value={corMotoInput}>{corMotoInput}</SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold">Cor do Banco</label>
                            <Select value={corBancoInput} onValueChange={escolherCorBanco}>
                                <SelectTrigger className="h-12 bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                    {config.coresBanco.map(c => (
                                      <SelectItem key={c.nome} value={c.nome}>
                                        <span className="flex items-center gap-2">
                                          <span className="w-3 h-3 rounded-full border border-slate-300 shrink-0" style={{ backgroundColor: c.hex }} />
                                          {c.descricao || c.nome}
                                        </span>
                                      </SelectItem>
                                    ))}
                                    {corBancoInput && !config.coresBanco.some(c => c.nome === corBancoInput) && (
                                      <SelectItem value={corBancoInput}>{corBancoInput}</SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                <div className="pt-2 border-t border-border">
                   <Button onClick={abrirFinalizacao} disabled={processando} className="w-full h-16 text-lg font-bold bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20 transition-all hover:scale-[1.01]">
                      {emRetrabalho ? 'CORREÇÃO FINALIZADA' : 'FINALIZAR MONTAGEM'} <ArrowRight className="ml-2 w-6 h-6" />
                   </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* SOLICITAÇÃO DE PAUSA */}
        <Dialog open={dialogoPausa} onOpenChange={(o) => !processando && setDialogoPausa(o)}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600"><Pause className="w-5 h-5" /> Solicitar Pausa</DialogTitle>
              <DialogDescription>O supervisor precisa autorizar. O timer para somente após a aprovação.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              {[...MOTIVOS_PAUSA, 'Outro'].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotivoPausa(m)}
                  className={cn("h-14 rounded-xl border-2 text-sm font-bold transition-colors px-2", motivoPausa === m ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" : "border-border hover:border-amber-300")}
                >
                  {m}
                </button>
              ))}
            </div>
            {motivoPausa === 'Outro' && (
              <Input value={motivoPausaOutro} onChange={e => setMotivoPausaOutro(e.target.value)} placeholder="Descreva o motivo..." className="h-12" autoFocus maxLength={120} />
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialogoPausa(false)} disabled={processando}>Cancelar</Button>
              <Button onClick={enviarSolicitacaoPausa} disabled={processando || !motivoPausa || (motivoPausa === 'Outro' && !motivoPausaOutro.trim())} className="bg-amber-600 hover:bg-amber-700 text-white font-bold">
                {processando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pause className="w-4 h-4 mr-2" />} Enviar Solicitação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* CONFIRMAÇÃO DE FINALIZAÇÃO */}
        <Dialog open={dialogoFinalizar} onOpenChange={(o) => !processando && setDialogoFinalizar(o)}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600"><CheckCircle2 className="w-5 h-5" /> Finalizar montagem?</DialogTitle>
              <DialogDescription>A moto seguirá para a Inspeção de Qualidade.</DialogDescription>
            </DialogHeader>
            {motoAtiva && (
              <div className="bg-muted/50 p-4 rounded-xl border border-border text-sm space-y-1">
                <p className="font-black text-lg text-foreground">{motoAtiva.modelo}</p>
                <p className="font-mono text-muted-foreground">{motoAtiva.sku}</p>
                <p>Carenagem: <strong>{corMotoInput}</strong> · Banco: <strong>{corBancoInput}</strong></p>
                <p>Tempo: <strong>{formatarCronometro(decorridoMs)}</strong></p>
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialogoFinalizar(false)} disabled={processando}>Voltar</Button>
              <Button onClick={finalizarMontagem} disabled={processando} className="bg-green-600 hover:bg-green-700 text-white font-bold">
                {processando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />} Enviar para Qualidade
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* REMOÇÃO DA FILA */}
        <Dialog open={!!motoExcluindo} onOpenChange={(o) => !o && !processando && setMotoExcluindo(null)}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600"><Trash2 className="w-5 h-5" /> Remover moto da linha</DialogTitle>
              <DialogDescription>O registro é apagado e a remoção fica registrada na auditoria.</DialogDescription>
            </DialogHeader>
            {motoExcluindo && (
              <div className="space-y-3">
                <div className="bg-muted/50 p-3 rounded-xl border border-border">
                  <p className="font-bold">{motoExcluindo.modelo}</p>
                  <p className="font-mono text-sm text-muted-foreground">{motoExcluindo.sku}</p>
                </div>
                <label className="text-xs font-black text-muted-foreground uppercase tracking-wider">Motivo</label>
                <Select value={motivoExclusao} onValueChange={setMotivoExclusao}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_EXCLUSAO.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMotoExcluindo(null)} disabled={processando}>Cancelar</Button>
              <Button variant="destructive" onClick={handleExcluirMoto} disabled={processando}>
                {processando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} Remover
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
  );
}
