"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BellRing, CheckCircle2, XCircle, Clock, User } from "lucide-react";
import { registrarLog } from "@/lib/logger";
import { Badge } from "@/components/ui/badge";

export function CentralSolicitacoes() {
  const [solicitacoes, setSolicitacoes] = useState<any[]>([]);
  const [isGestor, setIsGestor] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // 1. Inicialização e Permissão (RBAC)
  useEffect(() => {
    const userStr = localStorage.getItem('sgm_user');
    if (!userStr) return;
    
    try {
        const user = JSON.parse(userStr);
        
        // --- FILTRO DE SEGURANÇA ---
        // Se não for da gestão, encerra aqui. O componente não fará nada.
        if (!['gestor', 'supervisor', 'master'].includes(user.cargo)) {
            return;
        }
        
        // Se passou, marca como gestor e inicia o monitoramento
        setIsGestor(true);
        fetchSolicitacoesPendentes();

        // 2. Realtime: Escuta a tabela de solicitações
        const channel = supabase
          .channel('central-solicitacoes')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'solicitacoes_pausa' },
            (payload) => {
              // Nova solicitação chegando (INSERT)
              if (payload.eventType === 'INSERT' && payload.new.status === 'pendente') {
                  fetchSolicitacoesPendentes(); // Recarrega para pegar os Joins (nomes)
                  tocarSomNotificacao();
                  toast("Nova solicitação de pausa!", { 
                      icon: <BellRing className="w-4 h-4 text-orange-500"/>,
                      action: {
                        label: "Ver",
                        onClick: () => setIsOpen(true)
                      }
                  });
              }
              // Solicitação tratada por outro gestor (UPDATE)
              else if (payload.eventType === 'UPDATE' && payload.new.status !== 'pendente') {
                  // Remove da lista localmente
                  setSolicitacoes(prev => prev.filter(s => s.id !== payload.new.id));
              }
            }
          )
          .subscribe();

        return () => { supabase.removeChannel(channel); };

    } catch (e) {
        console.error("Erro ao validar permissão:", e);
    }
  }, []);

  // Abre modal automaticamente se houver itens (opcional)
  useEffect(() => {
      // if (solicitacoes.length > 0 && !isOpen) setIsOpen(true); 
  }, [solicitacoes]);

  const tocarSomNotificacao = () => {
    // Implementação simples de beep (opcional)
    try {
        const audio = new Audio('/notification.mp3'); // Certifique-se de ter este arquivo ou remova
        audio.play().catch(() => console.log("Áudio bloqueado pelo navegador"));
    } catch (e) { /* Ignora erro de áudio */ }
  };

  const fetchSolicitacoesPendentes = async () => {
      const { data } = await supabase
        .from('solicitacoes_pausa')
        .select(`
            *, 
            montador:funcionarios!solicitacoes_montador_id_fkey(nome), 
            moto:motos!solicitacoes_moto_id_fkey(sku, modelo)
        `)
        .eq('status', 'pendente')
        .order('created_at', { ascending: true });

      if (data) setSolicitacoes(data);
  };

  const responder = async (id: string, aprovado: boolean, solicitacao: any) => {
    const userStr = localStorage.getItem('sgm_user');
    const user = userStr ? JSON.parse(userStr) : null;

    // UI Otimista: Remove da tela imediatamente
    setSolicitacoes(prev => prev.filter(s => s.id !== id));
    if (solicitacoes.length <= 1) setIsOpen(false); // Fecha modal se for a última

    try {
        if (aprovado) {
            // 1. Atualiza status da moto para PAUSADO
            await supabase.from('motos').update({ status: 'pausado' }).eq('id', solicitacao.moto_id);
            
            // 2. Registra histórico da pausa (tabela auxiliar para métricas)
            await supabase.from('pausas_producao').insert({
                moto_id: solicitacao.moto_id,
                montador_id: solicitacao.montador_id,
                motivo: solicitacao.motivo,
                inicio: new Date().toISOString() // O fim será preenchido quando retomar
            });

            // 3. Log de Auditoria
            await registrarLog('PAUSA_MONTAGEM', solicitacao.moto?.sku || 'N/A', { 
                motivo: solicitacao.motivo, 
                autorizado_por: user?.nome 
            });
        }

        // 4. Finaliza a solicitação na tabela de controle
        const { error } = await supabase
            .from('solicitacoes_pausa')
            .update({
                status: aprovado ? 'aprovado' : 'rejeitado',
                supervisor_id: user?.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);
        
        if (error) throw error;
        toast.success(aprovado ? "Pausa Autorizada" : "Solicitação Negada");

    } catch (err) {
        console.error(err);
        toast.error("Erro ao processar. Tente novamente.");
        fetchSolicitacoesPendentes(); // Reverte UI em caso de erro
    }
  };

  // Se não for gestor ou não tiver solicitações, não renderiza nada (invisível)
  if (!isGestor || solicitacoes.length === 0) return null;

  return (
    <>
      {/* FAB (Botão Flutuante) */}
      <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-500">
        <Button 
            onClick={() => setIsOpen(true)}
            className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 shadow-2xl border-4 border-white dark:border-slate-900 flex flex-col items-center justify-center relative ring-2 ring-red-500/50 ring-offset-2"
        >
            <BellRing className="w-6 h-6 text-white animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-black text-red-600 border border-red-100">
                {solicitacoes.length}
            </span>
        </Button>
      </div>

      {/* MODAL DE GERENCIAMENTO */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
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
                {solicitacoes.map((sol) => (
                    <div key={sol.id} className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                        
                        <div className="space-y-2 w-full md:w-auto">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="font-bold flex gap-1 items-center bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300">
                                    <User className="w-3 h-3"/> {sol.montador?.nome || 'Desconhecido'}
                                </Badge>
                                <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                                    <Clock className="w-3 h-3"/> {new Date(sol.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                            </div>
                            
                            <div>
                                <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                    {sol.moto?.modelo}
                                    <Badge variant="secondary" className="font-mono text-xs">{sol.moto?.sku}</Badge>
                                </h4>
                                <div className="mt-2 text-sm font-medium text-red-700 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg w-fit border border-red-100 dark:border-red-900/30">
                                    Motivo: "{sol.motivo}"
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-2 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                            <Button 
                                size="sm" variant="ghost" 
                                className="flex-1 md:flex-none text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                onClick={() => responder(sol.id, false, sol)}
                            >
                                <XCircle className="w-4 h-4 mr-2"/> Negar
                            </Button>
                            <Button 
                                size="sm" 
                                className="flex-1 md:flex-none bg-green-600 hover:bg-green-700 text-white font-bold shadow-lg shadow-green-600/20"
                                onClick={() => responder(sol.id, true, sol)}
                            >
                                <CheckCircle2 className="w-4 h-4 mr-2"/> Autorizar
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </DialogContent>
      </Dialog>
    </>
  );
}