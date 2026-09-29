"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Wrench, Play, Pause, Check, CheckCircle2, AlertTriangle, ArrowRight, RotateCcw, Loader2, Clock, PaintBucket, Timer, Trash2, XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { registrarLog } from "@/lib/logger";
import { getUsuarioLogado, podeAgora, usePode } from "@/lib/auth";
import { PageHeader } from "@/components/sgm/PageHeader";
import { EmptyState } from "@/components/sgm/EmptyState";
import { Carregando } from "@/components/sgm/Carregando";
import { Dica } from "@/components/sgm/Guia";
import { Led } from "@/components/sgm/Led";
import { MedidorSegmentado } from "@/components/sgm/Medidor";
import { Painel } from "@/components/sgm/Painel";
import { PlacaChassi } from "@/components/sgm/PlacaChassi";
import { SeletorCor } from "@/components/sgm/SeletorCor";
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

  if (loading) return <Carregando texto="Sincronizando com a linha" />;

  const decorridoMs = motoAtiva?.inicio_montagem ? Math.max(0, agora - new Date(motoAtiva.inicio_montagem).getTime()) : 0;
  const decorridoMin = decorridoMs / 60000;
  const atrasado = decorridoMin > config.limiteMontagemMin;
  const emRetrabalho = !!motoAtiva?.observacoes?.includes('RETRABALHO');
  const feitos = CHECKLIST_ITENS.length - pendentesChecklist.length;
  const pausada = !!motoAtiva && motoAtiva.status === 'pausado';

  return (
      <div className="space-y-6 pb-20">

        {modo === 'fila' && (
          <>
            <PageHeader
              titulo="Montagem"
              descricao="Assuma a próxima moto da fila. Retrabalhos devolvidos pela qualidade têm prioridade."
              acoes={
                <div className="flex items-center gap-3 rounded-md border bg-card px-3.5 py-2">
                  <span className="text-2xl font-semibold leading-none">{fila.length}</span>
                  <span className="rotulo text-sutil">na fila</span>
                </div>
              }
            />

            <Dica titulo="Como funciona a montagem">
              <ol className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                <li><strong className="font-semibold text-foreground">1.</strong> Toque em INICIAR — a primeira da fila é a caixa mais antiga.</li>
                <li><strong className="font-semibold text-foreground">2.</strong> Siga o checklist e escolha as cores da carenagem e do banco.</li>
                <li><strong className="font-semibold text-foreground">3.</strong> Precisa parar? Peça a pausa: o supervisor autoriza e o tempo congela.</li>
                <li><strong className="font-semibold text-foreground">4.</strong> FINALIZAR envia a moto para a inspeção de qualidade (E3).</li>
              </ol>
            </Dica>

            {pausada && motoAtiva && (
              <section className="relative overflow-hidden rounded-lg border bg-card">
                <span aria-hidden className="faixa-sinalizacao absolute inset-x-0 top-0 h-2" />
                <div className="flex flex-col gap-4 p-5 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-md border border-white/10 bg-sidebar">
                      <Led estado="atencao" piscando className="size-3.5" />
                    </span>
                    <div className="min-w-0 space-y-1.5">
                      <p className="rotulo text-sutil">Produção pausada</p>
                      <p className="text-xl font-semibold leading-tight">{motoAtiva.modelo}</p>
                      <PlacaChassi chassi={motoAtiva.sku} tamanho="sm" />
                      <p className="text-xs text-muted-foreground">O cronômetro continua de onde parou ao retomar.</p>
                    </div>
                  </div>
                  <Button onClick={handleRetomar} disabled={processando} variant="grafite" className="h-12 px-6 text-base font-semibold">
                    {processando ? <Loader2 className="animate-spin" /> : <Play className="fill-current" />} RETOMAR
                  </Button>
                </div>
              </section>
            )}

            {filaRetrabalho.length > 0 && (
              <Painel titulo="Prioridade: retrabalho" codigo="RT" meta="Devolvidas pela inspeção para ajuste" className="border-serio/60">
                <div className="grid gap-3 md:grid-cols-2">
                  {filaRetrabalho.map(moto => (
                    <div key={moto.id} className="flex flex-col gap-4 rounded-md border border-l-[3px] border-l-serio bg-background/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1.5">
                        <p className="text-lg font-semibold leading-tight">{moto.modelo}</p>
                        <PlacaChassi chassi={moto.sku} tamanho="sm" />
                        <p className="flex items-start gap-1.5 text-sm font-medium text-foreground">
                          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-serio" aria-hidden />
                          &quot;{moto.observacoes?.replace(/RETRABALHO.*?: /, '')}&quot;
                        </p>
                        <p className="text-xs text-muted-foreground">Reprovado por: {moto.supervisor?.nome || '—'}{moto.montador_id !== getUsuarioLogado()?.id && moto.montador?.nome ? ` · montada por ${moto.montador.nome}` : ''}</p>
                      </div>
                      <Button onClick={() => iniciarTrabalho(moto, true)} disabled={processando || !!motoAtiva} variant="grafite" className="h-12 shrink-0 font-semibold">
                        <RotateCcw /> CORRIGIR
                      </Button>
                    </div>
                  ))}
                </div>
              </Painel>
            )}

            <Painel
              titulo="Fila de montagem"
              codigo="E2"
              meta="Por ordem de chegada na Entrada (E1)"
              className={cn(pausada && "pointer-events-none opacity-50")}
            >
              {fila.length === 0 ? (
                <EmptyState
                  icone={Wrench}
                  titulo="Nenhuma caixa aguardando"
                  descricao="Assim que uma caixa for registrada na Entrada (E1), ela aparece aqui."
                  compacto
                />
              ) : (
                <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {fila.map((moto, idx) => (
                    <li
                      key={moto.id}
                      className={cn(
                        "flex flex-col gap-3 rounded-md border bg-card p-4 transition-colors hover:border-foreground/40",
                        idx === 0 && "border-foreground/60",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <span className="flex h-6 min-w-8 items-center justify-center rounded-sm border font-mono text-xs font-semibold text-muted-foreground">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          {idx === 0 && <span className="rotulo rounded-sm bg-foreground px-1.5 py-1 text-[10px] text-background">Próxima</span>}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-sutil">
                          <Clock className="size-3" /> há {formatarDuracaoMin(minutosDesde(moto.created_at))}
                        </span>
                      </div>
                      <div className="min-w-0 space-y-1.5">
                        <p className="text-lg font-semibold leading-tight">{moto.modelo}</p>
                        <PlacaChassi chassi={moto.sku} tamanho="sm" />
                        <p className="text-xs text-sutil">{moto.localizacao || 'Sem local'}</p>
                      </div>
                      <div className="mt-auto flex gap-2">
                        <Button
                          onClick={() => iniciarTrabalho(moto, false)}
                          disabled={processando}
                          variant={idx === 0 ? "grafite" : "outline"}
                          className="h-11 flex-1 font-semibold"
                        >
                          <Play /> INICIAR
                        </Button>
                        {podeRemover && (
                          <Button variant="outline" size="icon" className="size-11 text-destructive" onClick={() => { setMotivoExclusao(MOTIVOS_EXCLUSAO[0]); setMotoExcluindo(moto); }} title="Remover da linha" aria-label="Remover da linha">
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Painel>
          </>
        )}

        {modo === 'producao' && motoAtiva && (
          <div className="mx-auto max-w-5xl space-y-5">
            {/* Painel de instrumentos da moto em montagem */}
            <section className="relative overflow-hidden rounded-lg border border-white/10 bg-sidebar text-white">
              {emRetrabalho && <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-serio" />}
              <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-6">
                <div className="min-w-0 space-y-2.5">
                  <p className="flex items-center gap-2">
                    <span className="flex h-5 min-w-7 items-center justify-center rounded-[2px] bg-white px-1 font-mono text-[10px] font-semibold text-sidebar">E2</span>
                    <Led estado={emRetrabalho ? "serio" : "processo"} piscando={!aguardandoAutorizacao} />
                    <span className="font-rotulo text-sm font-semibold uppercase tracking-[0.1em] text-white/85">
                      {emRetrabalho ? "CORREÇÃO EM ANDAMENTO" : "EM PRODUÇÃO"}
                    </span>
                  </p>
                  <h1 className="text-[28px] font-semibold leading-tight md:text-[32px]">{motoAtiva.modelo}</h1>
                  <PlacaChassi chassi={motoAtiva.sku} tamanho="md" />
                </div>
                <div
                  className="min-w-[220px] rounded-md border border-white/10 bg-white/[0.04] px-4 py-3"
                  title={atrasado ? `Acima do tempo de referência (${config.limiteMontagemMin} min)` : undefined}
                >
                  <p className="flex items-center justify-between gap-3">
                    <span className="rotulo flex items-center gap-1.5 text-white/60"><Timer className="size-3.5" /> Tempo</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-white/70">
                      <Led estado={atrasado ? "atencao" : "bom"} className="size-2" />
                      {atrasado ? `acima de ${config.limiteMontagemMin} min` : `ref. ${config.limiteMontagemMin} min`}
                    </span>
                  </p>
                  <p className="mt-1.5 font-mono text-[40px] font-semibold leading-none tracking-wider">{formatarCronometro(decorridoMs)}</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-[1px] bg-white/10">
                    <span
                      className={cn("block h-full transition-[width] duration-700", atrasado ? "bg-warning" : "bg-white/80")}
                      style={{ width: `${Math.min(100, (decorridoMin / Math.max(1, config.limiteMontagemMin)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="relative overflow-hidden rounded-lg border bg-card">
              {aguardandoAutorizacao && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-start bg-card/95 p-6 pt-16 text-center backdrop-blur-sm">
                  <span className="mb-4 flex size-16 items-center justify-center rounded-md border border-white/10 bg-sidebar">
                    <Led estado="atencao" piscando className="size-5 rounded-[3px]" />
                  </span>
                  <h2 className="text-2xl font-semibold text-foreground">Solicitação Enviada!</h2>
                  <p className="mt-1 text-lg text-muted-foreground">Aguarde a liberação do supervisor.</p>
                  <p className="mt-2 text-xs text-sutil">O cronômetro para assim que a pausa for autorizada.</p>
                  <Button variant="outline" className="mt-6" onClick={cancelarSolicitacaoPausa} disabled={processando}>
                    <XCircle /> Cancelar solicitação
                  </Button>
                </div>
              )}

              <div className="space-y-7 p-5 md:p-7">
                {emRetrabalho && (
                  <div className="rounded-md border border-l-[3px] border-l-serio bg-background/60 p-4">
                    <p className="rotulo flex items-center gap-2 text-sutil"><AlertTriangle className="size-4 text-serio" /> O que precisa ser corrigido</p>
                    <p className="mt-2 text-lg font-medium">{motoAtiva.observacoes?.replace('RETRABALHO:', '')}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="space-y-1">
                      <p className="rotulo text-sutil">Checklist de montagem</p>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">{feitos} de {CHECKLIST_ITENS.length}</span> itens conferidos
                      </p>
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto">
                      <Button variant="outline" onClick={abrirSolicitacaoPausa} className="h-11 flex-1 font-semibold sm:flex-none">
                        <Pause className="text-warning" /> PAUSAR
                      </Button>
                      <Button variant="secondary" onClick={handleMarcarTudo} className="h-11 flex-1 font-semibold sm:flex-none">
                        MARCAR TUDO
                      </Button>
                    </div>
                  </div>
                  <MedidorSegmentado
                    valor={feitos}
                    total={CHECKLIST_ITENS.length}
                    rotulo="Itens do checklist conferidos"
                    altura="h-2"
                    legenda={false}
                  />
                  <ol className="grid gap-2 md:grid-cols-2">
                    {CHECKLIST_ITENS.map((item, i) => {
                      const feito = !!checklist[item];
                      return (
                        <li key={item}>
                          <div
                            role="checkbox"
                            aria-checked={feito}
                            tabIndex={0}
                            onClick={() => toggleCheck(item)}
                            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleCheck(item); } }}
                            className={cn(
                              "flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                              feito ? "border-success/60 bg-success/[0.07]" : "bg-card hover:border-foreground/40",
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-8 shrink-0 items-center justify-center rounded-sm font-mono text-xs font-semibold",
                                feito ? "bg-success text-white" : "border text-muted-foreground",
                              )}
                            >
                              {feito ? <Check className="size-4" /> : String(i + 1).padStart(2, '0')}
                            </span>
                            <span className="select-none text-sm font-medium">{item}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                <div className="space-y-5 border-t pt-6">
                  <p className="rotulo flex items-center gap-2 text-sutil"><PaintBucket className="size-4" /> Acabamento final</p>
                  <SeletorCor rotulo="Cor da carenagem" cores={config.coresCarenagem} valor={corMotoInput} aoEscolher={escolherCorMoto} />
                  <SeletorCor rotulo="Cor do banco" cores={config.coresBanco} valor={corBancoInput} aoEscolher={escolherCorBanco} />
                </div>

                <div className="space-y-2 border-t pt-6">
                  <Button onClick={abrirFinalizacao} disabled={processando} className="h-16 w-full text-lg font-semibold">
                    {emRetrabalho ? 'CORREÇÃO FINALIZADA' : 'FINALIZAR MONTAGEM'} <ArrowRight className="size-6" />
                  </Button>
                  <p className="text-center text-xs text-sutil">
                    {pendentesChecklist.length > 0
                      ? `Faltam ${pendentesChecklist.length} item(ns) do checklist.`
                      : !corMotoInput || !corBancoInput
                        ? "Falta escolher as cores."
                        : "Tudo pronto: a moto segue para a inspeção de qualidade (E3)."}
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* SOLICITAÇÃO DE PAUSA */}
        <Dialog open={dialogoPausa} onOpenChange={(o) => !processando && setDialogoPausa(o)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Pause className="size-5 text-warning" /> Solicitar pausa</DialogTitle>
              <DialogDescription>O supervisor precisa autorizar. O cronômetro para somente após a aprovação.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              {[...MOTIVOS_PAUSA, 'Outro'].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotivoPausa(m)}
                  aria-pressed={motivoPausa === m}
                  className={cn(
                    "h-14 rounded-md border px-2 text-sm font-semibold transition-colors",
                    motivoPausa === m ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground/40",
                  )}
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
              <Button variant="grafite" onClick={enviarSolicitacaoPausa} disabled={processando || !motivoPausa || (motivoPausa === 'Outro' && !motivoPausaOutro.trim())} className="font-semibold">
                {processando ? <Loader2 className="animate-spin" /> : <Pause />} Enviar Solicitação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* CONFIRMAÇÃO DE FINALIZAÇÃO */}
        <Dialog open={dialogoFinalizar} onOpenChange={(o) => !processando && setDialogoFinalizar(o)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-success" /> Finalizar montagem?</DialogTitle>
              <DialogDescription>A moto seguirá para a inspeção de qualidade (E3).</DialogDescription>
            </DialogHeader>
            {motoAtiva && (
              <div className="space-y-3 rounded-md border bg-background/60 p-4 text-sm">
                <p className="text-lg font-semibold text-foreground">{motoAtiva.modelo}</p>
                <PlacaChassi chassi={motoAtiva.sku} tamanho="sm" />
                <dl className="grid grid-cols-3 gap-3 pt-1">
                  <div><dt className="rotulo text-sutil">Carenagem</dt><dd className="mt-1 font-medium">{corMotoInput}</dd></div>
                  <div><dt className="rotulo text-sutil">Banco</dt><dd className="mt-1 font-medium">{corBancoInput}</dd></div>
                  <div><dt className="rotulo text-sutil">Tempo</dt><dd className="mt-1 font-mono font-semibold">{formatarCronometro(decorridoMs)}</dd></div>
                </dl>
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialogoFinalizar(false)} disabled={processando}>Voltar</Button>
              <Button onClick={finalizarMontagem} disabled={processando} className="font-semibold">
                {processando ? <Loader2 className="animate-spin" /> : <ArrowRight />} Enviar para Qualidade
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* REMOÇÃO DA FILA */}
        <Dialog open={!!motoExcluindo} onOpenChange={(o) => !o && !processando && setMotoExcluindo(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Trash2 className="size-5 text-destructive" /> Remover moto da linha</DialogTitle>
              <DialogDescription>O registro é apagado e a remoção fica registrada na auditoria.</DialogDescription>
            </DialogHeader>
            {motoExcluindo && (
              <div className="space-y-3">
                <div className="space-y-1.5 rounded-md border bg-background/60 p-3">
                  <p className="font-semibold">{motoExcluindo.modelo}</p>
                  <PlacaChassi chassi={motoExcluindo.sku} tamanho="sm" />
                </div>
                <label className="rotulo text-sutil">Motivo</label>
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
                {processando ? <Loader2 className="animate-spin" /> : <Trash2 />} Remover
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
  );
}
