"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area"; // Se não tiver, use div normal com overflow
import { BellRing, CheckCircle2, XCircle, Clock, User } from "lucide-react";
import { registrarLog } from "@/lib/logger";
import { Badge } from "@/components/ui/badge";

export function CentralSolicitacoes() {
  const [solicitacoes, setSolicitacoes] = useState<any[]>([]);
  const [isGestor, setIsGestor] = useState(false);
  const [isOpen, setIsOpen] = useState(false); // Controla visibilidade da lista
  
// Áudio removido para evitar erros

  // 1. Inicialização e Permissão
  useEffect(() => {
    const userStr = localStorage.getItem('sgm_user');
    if (!userStr) return;
    const user = JSON.parse(userStr);
    
    // Apenas Gestão vê isso
    if (!['gestor', 'supervisor', 'master'].includes(user.cargo)) return;
    
    setIsGestor(true);
    fetchSolicitacoesPendentes();

    // 2. Realtime: Escuta a FILA
    const channel = supabase
      .channel('central-solicitacoes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'solicitacoes_pausa' },
        (payload) => {
          // Se entrou algo novo
          if (payload.eventType === 'INSERT' && payload.new.status === 'pendente') {
             fetchSolicitacoesPendentes(); // Recarrega a lista completa para garantir dados (joins)
             tocarSom();
             toast("Nova solicitação de pausa!", { icon: <BellRing className="w-4 h-4 text-orange-500"/> });
          }
          // Se algo foi atualizado (aprovado/rejeitado por outro gestor), remove da lista
          else if (payload.eventType === 'UPDATE' && payload.new.status !== 'pendente') {
             setSolicitacoes(prev => prev.filter(s => s.id !== payload.new.id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Abre o modal automaticamente se houver itens e ele estiver fechado (opcional)
  useEffect(() => {
      if (solicitacoes.length > 0 && !isOpen) {
          // Opcional: Descomente se quiser que abra na cara do gestor
          // setIsOpen(true); 
      }
  }, [solicitacoes]);

  const tocarSom = () => {
    // Tenta fazer um beep simples se o navegador permitir, ou apenas ignora
    console.log("🔔 Ding! Nova solicitação.");
};

  const fetchSolicitacoesPendentes = async () => {
      const { data } = await supabase
        .from('solicitacoes_pausa')
        .select(`
            *, 
            montador:funcionarios!solicitacoes_montador_fkey(nome), 
            moto:motos!solicitacoes_moto_fkey(sku, modelo)
        `)
        .eq('status', 'pendente')
        .order('created_at', { ascending: true }); // Fila: Primeiro que entra é o primeiro da lista

      if (data) setSolicitacoes(data);
  };

  const responder = async (id: string, aprovado: boolean, solicitacao: any) => {
    const userStr = localStorage.getItem('sgm_user');
    const user = userStr ? JSON.parse(userStr) : null;

    // Otimistic UI: Remove da lista visualmente antes do banco responder
    setSolicitacoes(prev => prev.filter(s => s.id !== id));

    try {
        if (aprovado) {
            // 1. Pausa Moto
            await supabase.from('motos').update({ status: 'pausado' }).eq('id', solicitacao.moto_id);
            
            // 2. Cria Log Histórico
            await supabase.from('pausas_producao').insert({
                moto_id: solicitacao.moto_id,
                montador_id: solicitacao.montador_id,
                motivo: solicitacao.motivo,
                inicio: new Date().toISOString()
            });

            // 3. Auditoria
            registrarLog('PAUSA_MONTAGEM', solicitacao.moto.sku, { motivo: solicitacao.motivo, autorizado: user?.nome });
        }

        // 4. Atualiza status do pedido (Isso avisa o montador)
        await supabase
            .from('solicitacoes_pausa')
            .update({
                status: aprovado ? 'aprovado' : 'rejeitado',
                supervisor_id: user?.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);
        
        toast.success(aprovado ? "Autorizado" : "Rejeitado");

    } catch (err) {
        console.error(err);
        toast.error("Erro ao processar. Atualize a página.");
        fetchSolicitacoesPendentes(); // Reverte se der erro
    }
  };

  if (!isGestor || solicitacoes.length === 0) return null;

  return (
    <>
      {/* BOTÃO FLUTUANTE (FAB) - Só aparece se tiver pendências */}
      <div className="fixed bottom-6 right-6 z-50 animate-bounce">
        <Button 
            onClick={() => setIsOpen(true)}
            className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700 shadow-2xl border-4 border-white dark:border-slate-900 flex flex-col items-center justify-center gap-1"
        >
            <BellRing className="w-6 h-6 text-white" />
            <span className="text-[10px] font-bold text-white bg-black/20 px-2 rounded-full">
                {solicitacoes.length}
            </span>
        </Button>
      </div>

      {/* MODAL COM A LISTA (STACK) */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl bg-slate-50 dark:bg-slate-900">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl">
                    <BellRing className="w-5 h-5 text-red-500" />
                    Solicitações de Pausa ({solicitacoes.length})
                </DialogTitle>
                <DialogDescription>
                    Gerencie a fila de pedidos pendentes.
                </DialogDescription>
            </DialogHeader>

            <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-3 mt-4">
                {solicitacoes.map((sol) => (
                    <div key={sol.id} className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center animate-in slide-in-from-bottom-2">
                        
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="font-bold flex gap-1 items-center bg-slate-100 dark:bg-slate-900">
                                    <User className="w-3 h-3"/> {sol.montador?.nome}
                                </Badge>
                                <span className="text-xs text-slate-400 flex items-center gap-1">
                                    <Clock className="w-3 h-3"/> há {Math.floor((new Date().getTime() - new Date(sol.created_at).getTime()) / 60000)} min
                                </span>
                            </div>
                            <h4 className="font-bold text-slate-800 dark:text-slate-200">
                                {sol.moto?.modelo} <span className="text-slate-400 font-normal text-sm">({sol.moto?.sku})</span>
                            </h4>
                            <p className="text-sm font-medium text-red-600 bg-red-50 dark:bg-red-900/10 px-2 py-1 rounded w-fit">
                                Motivo: "{sol.motivo}"
                            </p>
                        </div>

                        <div className="flex gap-2 w-full sm:w-auto">
                            <Button 
                                size="sm" variant="outline" 
                                className="flex-1 sm:flex-none border-red-200 text-red-600 hover:bg-red-50"
                                onClick={() => responder(sol.id, false, sol)}
                            >
                                <XCircle className="w-4 h-4 mr-1"/> Negar
                            </Button>
                            <Button 
                                size="sm" 
                                className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => responder(sol.id, true, sol)}
                            >
                                <CheckCircle2 className="w-4 h-4 mr-1"/> Autorizar
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