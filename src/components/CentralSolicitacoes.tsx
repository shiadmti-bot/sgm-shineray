"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BellRing, CheckCircle2, XCircle, Clock, User, Loader2 } from "lucide-react";
import { registrarLog } from "@/lib/logger";
import { Badge } from "@/components/ui/badge";
import { CARGOS_GESTAO, getUsuarioLogado, temCargo, useUsuarioLogado } from "@/lib/auth";
import { formatarDuracaoMin, minutosDesde } from "@/lib/datas";
import { tocarSom } from "@/lib/sons";

/** Disparado pelo Header (sino) para abrir a central. */
export const EVENTO_ABRIR_SOLICITACOES = "sgm:abrir-solicitacoes";
/** Publicado pela central com o total de pendências (detail: number). */
export const EVENTO_TOTAL_SOLICITACOES = "sgm:total-solicitacoes";

const INTERVALO_POLLING_MS = 20_000;

interface Solicitacao {
  id: string;
  moto_id: string;
  montador_id: string;
  motivo: string;
  status: string;
  created_at: string;
  montador?: { nome: string } | null;
  moto?: { sku: string; modelo: string } | null;
}

export function CentralSolicitacoes() {
  const usuario = useUsuarioLogado();
  // Só gestores/supervisores/master recebem e decidem solicitações.
  const isGestor = temCargo(usuario, CARGOS_GESTAO);

  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [processando, setProcessando] = useState<string | null>(null);
  const [, setRelogio] = useState(0);

  const fetchSolicitacoesPendentes = useCallback(async () => {
      const { data } = await supabase
        .from('solicitacoes_pausa')
        .select(`
            *,
            montador:funcionarios!solicitacoes_montador_id_fkey(nome),
            moto:motos!solicitacoes_moto_id_fkey(sku, modelo)
        `)
        .eq('status', 'pendente')
        .order('created_at', { ascending: true });

      if (data) setSolicitacoes(data as Solicitacao[]);
  }, []);

  useEffect(() => {
    if (!isGestor) return;

    fetchSolicitacoesPendentes();

    const channel = supabase
      .channel('central-solicitacoes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'solicitacoes_pausa' },
        (payload) => {
          const nova = payload.new as Partial<Solicitacao>;
          if (payload.eventType === 'INSERT' && nova.status === 'pendente') {
              fetchSolicitacoesPendentes();
              tocarSom('alerta');
              toast("Nova solicitação de pausa!", {
                  icon: <BellRing className="w-4 h-4 text-orange-500"/>,
                  action: { label: "Ver", onClick: () => setIsOpen(true) }
              });
          }
          else if (payload.eventType === 'UPDATE' && nova.status !== 'pendente') {
              setSolicitacoes(prev => prev.filter(s => s.id !== nova.id));
          }
        }
      )
      .subscribe();

    // Fallback caso o Realtime não esteja habilitado para a tabela.
    const polling = setInterval(fetchSolicitacoesPendentes, INTERVALO_POLLING_MS);
    // Atualiza o "há X min" exibido.
    const relogio = setInterval(() => setRelogio(r => r + 1), 60_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(polling);
      clearInterval(relogio);
    };
  }, [isGestor, fetchSolicitacoesPendentes]);

  // Publica o total para o sino do cabeçalho
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(EVENTO_TOTAL_SOLICITACOES, { detail: isGestor ? solicitacoes.length : 0 }));
  }, [solicitacoes.length, isGestor]);

  // Abre a central quando o sino é clicado
  useEffect(() => {
    const abrir = () => {
      if (solicitacoes.length === 0) toast.info("Nenhuma solicitação de pausa pendente.");
      else setIsOpen(true);
    };
    window.addEventListener(EVENTO_ABRIR_SOLICITACOES, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_SOLICITACOES, abrir);
  }, [solicitacoes.length]);

  const responder = async (solicitacao: Solicitacao, aprovado: boolean) => {
    const user = getUsuarioLogado();
    setProcessando(solicitacao.id);

    try {
        // Confere se ainda está pendente (outro supervisor pode ter respondido).
        const { data: atual } = await supabase.from('solicitacoes_pausa').select('status').eq('id', solicitacao.id).maybeSingle();
        if (atual && atual.status !== 'pendente') {
            toast.info("Esta solicitação já foi respondida por outra pessoa.");
            setSolicitacoes(prev => prev.filter(s => s.id !== solicitacao.id));
            return;
        }

        let decisao: 'aprovado' | 'rejeitado' = aprovado ? 'aprovado' : 'rejeitado';

        if (aprovado) {
            const agora = new Date().toISOString();
            // Só pausa se a moto continuar em produção (evita pausar moto já finalizada/removida).
            const { data: pausada, error: erroMoto } = await supabase
              .from('motos')
              .update({ status: 'pausado', updated_at: agora })
              .eq('id', solicitacao.moto_id)
              .eq('status', 'em_producao')
              .select('id');
            if (erroMoto) throw erroMoto;

            if (!pausada || pausada.length === 0) {
                decisao = 'rejeitado';
                toast.warning("A moto não está mais em produção. Solicitação encerrada sem pausa.");
            } else {
                const { error: erroPausa } = await supabase.from('pausas_producao').insert({
                    moto_id: solicitacao.moto_id,
                    montador_id: solicitacao.montador_id,
                    motivo: solicitacao.motivo,
                    inicio: agora
                });
                if (erroPausa) console.error("Erro ao registrar pausa:", erroPausa);
            }
        }

        const { error } = await supabase
            .from('solicitacoes_pausa')
            .update({
                status: decisao,
                supervisor_id: user?.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', solicitacao.id);

        if (error) throw error;

        await registrarLog(decisao === 'aprovado' ? 'PAUSA_APROVADA' : 'PAUSA_REJEITADA', solicitacao.moto?.sku || 'N/A', {
            motivo: solicitacao.motivo,
            montador: solicitacao.montador?.nome,
            decidido_por: user?.nome
        });

        setSolicitacoes(prev => prev.filter(s => s.id !== solicitacao.id));
        if (decisao === 'aprovado') toast.success("Pausa Autorizada");
        else if (!aprovado) toast.success("Solicitação Negada");

    } catch (err) {
        console.error(err);
        toast.error("Erro ao processar a solicitação.");
        fetchSolicitacoesPendentes();
    } finally {
        setProcessando(null);
    }
  };

  // --- TRAVA FINAL ---
  // Se não for gestor, retorna NULL (não renderiza nada no DOM)
  // Se for gestor mas não tiver solicitações, também não renderiza o botão
  if (!isGestor || solicitacoes.length === 0) return null;

  return (
    <>
      {/* Botão Flutuante (Fixo e Z-Index alto) */}
      <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-4 fade-in duration-500 print:hidden">
        <Button
            onClick={() => setIsOpen(true)}
            aria-label="Abrir solicitações de pausa"
            className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700 shadow-[0_0_20px_rgba(220,38,38,0.5)] border-4 border-white dark:border-slate-900 flex flex-col items-center justify-center relative ring-2 ring-red-500/50 ring-offset-2 transition-transform hover:scale-110 active:scale-95"
        >
            <BellRing className="w-7 h-7 text-white animate-[wiggle_1s_ease-in-out_infinite]" />
            <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-black text-red-600 border-2 border-red-100 shadow-sm">
                {solicitacoes.length}
            </span>
        </Button>
      </div>

      <Dialog open={isOpen && solicitacoes.length > 0} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-2xl bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 z-[110]">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl text-slate-900 dark:text-white">
                    <BellRing className="w-5 h-5 text-red-600" />
                    Solicitações Pendentes
                </DialogTitle>
                <DialogDescription>
                    Operadores aguardando autorização para interromper a linha.
                </DialogDescription>
            </DialogHeader>

            <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-3 mt-4">
                {solicitacoes.map((sol) => {
                    const espera = minutosDesde(sol.created_at);
                    return (
                    <div key={sol.id} className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                        <div className="space-y-2 w-full md:w-auto">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="font-bold flex gap-1 items-center bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300">
                                    <User className="w-3 h-3"/> {sol.montador?.nome || 'Desconhecido'}
                                </Badge>
                                <span className={`text-xs flex items-center gap-1 font-mono ${espera >= 5 ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
                                    <Clock className="w-3 h-3"/> {new Date(sol.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    {' · '}aguardando há {formatarDuracaoMin(espera)}
                                </span>
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                    {sol.moto?.modelo}
                                    <Badge variant="secondary" className="font-mono text-xs">{sol.moto?.sku}</Badge>
                                </h4>
                                <div className="mt-2 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg w-fit border border-red-100 dark:border-red-900/30">
                                    Motivo: &quot;{sol.motivo}&quot;
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                            <Button size="sm" variant="ghost" disabled={processando === sol.id} className="flex-1 md:flex-none text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => responder(sol, false)}>
                                <XCircle className="w-4 h-4 mr-2"/> Negar
                            </Button>
                            <Button size="sm" disabled={processando === sol.id} className="flex-1 md:flex-none bg-green-600 hover:bg-green-700 text-white font-bold shadow-lg shadow-green-600/20" onClick={() => responder(sol, true)}>
                                {processando === sol.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <CheckCircle2 className="w-4 h-4 mr-2"/>} Autorizar
                            </Button>
                        </div>
                    </div>
                    );
                })}
            </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
