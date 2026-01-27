"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  Wrench, Play, Pause, CheckCircle2, AlertTriangle, ArrowRight, RotateCcw, Loader2, Clock 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { registrarLog } from "@/lib/logger";

const CHECKLIST_ITENS = [
  "Aperto da roda dianteira", "Aperto da roda traseira", "Aperto do guidão",
  "Aperto do motor", "Instalação de bateria", "Teste elétrico (Farol/Seta)",
  "Calibragem de pneus", "Ajuste de corrente", "Verificação de óleo", "Retrovisores fixados"
];

export default function MontagemPage() {
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useState<'fila' | 'producao'>('fila');
  
  const [fila, setFila] = useState<any[]>([]);
  const [filaRetrabalho, setFilaRetrabalho] = useState<any[]>([]);
  const [motoAtiva, setMotoAtiva] = useState<any>(null);
  
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  
  // Controle de Pausa Remota
  const [aguardandoAutorizacao, setAguardandoAutorizacao] = useState(false);

  useEffect(() => {
    verificarEstadoAtual();
    
    const interval = setInterval(() => {
        if (modo === 'fila') {
            const user = JSON.parse(localStorage.getItem('sgm_user') || '{}');
            if(user.id) carregarListas(user.id);
        }
    }, 10000);
    return () => clearInterval(interval);
  }, [modo]); // Dependência adicionada para otimizar polling

  // Salva o checklist localmente
  useEffect(() => {
      if (motoAtiva && Object.keys(checklist).length > 0) {
          localStorage.setItem(`checklist_${motoAtiva.id}`, JSON.stringify(checklist));
      }
  }, [checklist, motoAtiva]);

  // Listener de Pausa (Realtime)
  useEffect(() => {
    if (!aguardandoAutorizacao) return;

    const userStr = localStorage.getItem('sgm_user');
    const user = userStr ? JSON.parse(userStr) : null;

    const channel = supabase
      .channel('minhas-solicitacoes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'solicitacoes_pausa', filter: `montador_id=eq.${user?.id}` },
        (payload) => {
          if (payload.new.status === 'aprovado') {
             toast.success("Pausa Autorizada!");
             setAguardandoAutorizacao(false);
             verificarEstadoAtual(); // Recarrega para cair na tela de "Pausado"
          } else if (payload.new.status === 'rejeitado') {
             toast.error("Solicitação negada.");
             setAguardandoAutorizacao(false);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [aguardandoAutorizacao]);


  async function verificarEstadoAtual() {
    setLoading(true);
    const userStr = localStorage.getItem('sgm_user');
    const user = userStr ? JSON.parse(userStr) : null;
    
    if (!user) { setLoading(false); return; }

    try {
        // 1. Verifica Motos Ativas
        const { data: ativa } = await supabase
          .from('motos')
          .select('*')
          .eq('montador_id', user.id)
          .in('status', ['em_producao', 'pausado']) 
          .maybeSingle();

        if (ativa) {
          setMotoAtiva(ativa);
          
          // --- VERIFICAÇÃO DE PERSISTÊNCIA DE SOLICITAÇÃO ---
          // Se a moto está ativa, verifica se já existe um pedido PENDENTE para ela
          if (ativa.status !== 'pausado') {
             const { data: solicitacaoPendente } = await supabase
                .from('solicitacoes_pausa')
                .select('id')
                .eq('moto_id', ativa.id)
                .eq('status', 'pendente')
                .maybeSingle();
             
             if (solicitacaoPendente) {
                 setAguardandoAutorizacao(true); // <--- REATIVA O LOADING/BLOQUEIO
             } else {
                 setAguardandoAutorizacao(false);
             }
          } else {
              // Se já está pausado, não precisa esperar autorização
              setAguardandoAutorizacao(false);
          }
          // --------------------------------------------------

          if (ativa.status === 'pausado') {
              setModo('fila');
          } else {
              setModo('producao');
          }
          
          // Recupera checklist (código existente...)
          const salvo = localStorage.getItem(`checklist_${ativa.id}`);
          if (salvo) { setChecklist(JSON.parse(salvo)); } 
          else {
              const checkInicial: any = {};
              CHECKLIST_ITENS.forEach(i => checkInicial[i] = false);
              setChecklist(checkInicial);
          }
        } else {
          setMotoAtiva(null);
          setModo('fila');
          await carregarListas(user.id);
        }
    } catch (err) {
        console.error(err);
        toast.error("Erro de conexão.");
    } finally {
        setLoading(false);
    }
  }

  async function carregarListas(userId: string) {
    // Busca Retrabalhos COM o nome do supervisor que reprovou
    const reqRetrabalho = supabase
        .from('motos')
        .select(`
            *,
            supervisor:funcionarios!motos_supervisor_id_fkey(nome)
        `)
        .eq('status', 'retrabalho_montagem')
        .eq('montador_id', userId);

    const reqCaixas = supabase
        .from('motos')
        .select('*')
        .eq('status', 'aguardando_montagem')
        .order('created_at', { ascending: true });

    const [resRetrabalho, resCaixas] = await Promise.all([reqRetrabalho, reqCaixas]);

    if(resRetrabalho.data) setFilaRetrabalho(resRetrabalho.data);
    if(resCaixas.data) setFila(resCaixas.data);
  }

  async function iniciarTrabalho(moto: any, ehRetrabalho: boolean) {
    const userStr = localStorage.getItem('sgm_user');
    const user = userStr ? JSON.parse(userStr) : null;

    const updateData: any = {
        status: 'em_producao',
        montador_id: user.id
    };

    if (!ehRetrabalho) {
        updateData.inicio_montagem = new Date().toISOString();
    }

    setLoading(true); 

    const { error } = await supabase.from('motos').update(updateData).eq('id', moto.id);

    if (error) {
      toast.error("Erro ao iniciar.");
      setLoading(false);
    } else {
      toast.success(ehRetrabalho ? "Retrabalho Iniciado!" : "Montagem Iniciada!");
      await registrarLog('INICIO_MONTAGEM', moto.sku);
      verificarEstadoAtual();
    }
  }

  const handleMarcarTudo = () => {
    const novoCheck: any = {};
    CHECKLIST_ITENS.forEach(i => novoCheck[i] = true);
    setChecklist(novoCheck);
    toast.success("Checklist preenchido!");
  };

  const toggleCheck = (item: string) => {
    setChecklist(prev => ({ ...prev, [item]: !prev[item] }));
  };

  const finalizarMontagem = async () => {
    const pendentes = CHECKLIST_ITENS.filter(i => !checklist[i]);
    if (pendentes.length > 0) {
      toast.error(`Checklist incompleto!`);
      return;
    }

    if (!motoAtiva) return;

    let updatePayload: any = {
        status: 'em_analise',
        fim_montagem: new Date().toISOString()
    };
    
    if (motoAtiva.observacoes?.includes('RETRABALHO')) {
        updatePayload.observacoes = null; 
    }

    const { error } = await supabase.from('motos').update(updatePayload).eq('id', motoAtiva.id);

    if (error) toast.error("Erro ao finalizar.");
    else {
      toast.success("Enviado para Qualidade.");
      await registrarLog('FIM_MONTAGEM', motoAtiva.sku);
      localStorage.removeItem(`checklist_${motoAtiva.id}`);
      setMotoAtiva(null);
      verificarEstadoAtual();
    }
  };

  const handleSolicitarPausa = async () => {
      const motivo = prompt("Qual o motivo da pausa? (Ex: Almoço, Banheiro, Peça)");
      if (!motivo) return;

      setAguardandoAutorizacao(true);
      const userStr = localStorage.getItem('sgm_user');
      const user = userStr ? JSON.parse(userStr) : null;

      const { error } = await supabase.from('solicitacoes_pausa').insert({
          montador_id: user?.id,
          moto_id: motoAtiva.id,
          motivo: motivo
      });

      if (error) {
          toast.error("Erro ao enviar solicitação.");
          setAguardandoAutorizacao(false);
      } else {
          toast.info("Solicitação enviada! Aguarde...");
      }
  };

  // --- MUDANÇA: Retomar leva para modo produção ---
  const handleRetomar = async () => {
      const { error } = await supabase.from('motos').update({ status: 'em_producao' }).eq('id', motoAtiva.id);
      if(!error) {
          toast.success("Produção Retomada");
          verificarEstadoAtual(); // Isso mudará o modo para 'producao' automaticamente
      }
  }

  if (loading) return (
    <div className="p-8 flex flex-col items-center justify-center h-full space-y-4">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <p className="text-slate-500 animate-pulse">Sincronizando com a linha...</p>
    </div>
  );

  return (
    <RoleGuard allowedRoles={['montador', 'supervisor', 'master']}>
      <div className="space-y-6 animate-in fade-in pb-20">
        
        {/* MODO FILA (Agora inclui aviso de pausa) */}
        {modo === 'fila' && (
          <>
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white">Central de Montagem</h1>
                <p className="text-slate-500">Selecione uma tarefa para iniciar.</p>
              </div>
            </div>

            {/* --- NOVO: CARD DE RETOMADA (MOTO PAUSADA) --- */}
            {motoAtiva && motoAtiva.status === 'pausado' && (
                <div className="mb-8 animate-in slide-in-from-top-4 duration-500">
                    <Card className="border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-900/20 shadow-xl border-amber-200 dark:border-amber-800">
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="relative flex h-3 w-3">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                                </span>
                                <Badge variant="outline" className="text-amber-700 border-amber-500 bg-amber-100">PRODUÇÃO PAUSADA</Badge>
                            </div>
                            <CardTitle className="text-2xl">{motoAtiva.modelo}</CardTitle>
                            <CardDescription className="font-mono text-slate-600 dark:text-slate-300">
                                SKU: {motoAtiva.sku}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                             <div className="flex items-center gap-4 bg-white/50 dark:bg-black/20 p-4 rounded-lg mb-4">
                                <Clock className="w-5 h-5 text-amber-600"/>
                                <div>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Aguardando Retomada</p>
                                    <p className="text-xs text-slate-500">Clique abaixo quando estiver pronto para voltar.</p>
                                </div>
                             </div>
                             <Button onClick={handleRetomar} className="w-full h-14 text-lg font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-600/20">
                                <Play className="w-5 h-5 mr-2 fill-current" /> RETOMAR PRODUÇÃO
                             </Button>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* SEÇÃO DE ALERTA: RETRABALHO */}
            {filaRetrabalho.length > 0 && (
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-red-600 mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" /> ATENÇÃO: RETRABALHO PENDENTE
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filaRetrabalho.map(moto => (
                            <Card key={moto.id} className="border-l-4 border-l-red-600 bg-red-50 dark:bg-red-900/20 shadow-lg animate-pulse">
                                <CardHeader className="pb-2">
                                    <div className="flex justify-between items-start">
                                        <Badge variant="destructive" className="animate-bounce">CORRIGIR ERRO</Badge>
                                        <div className="text-right">
                                            <span className="text-[10px] font-bold text-red-600 uppercase block">Reprovado por</span>
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                                {moto.supervisor?.nome || 'Supervisor'}
                                            </span>
                                        </div>
                                    </div>
                                    <CardTitle className="text-xl mt-2">{moto.modelo}</CardTitle>
                                    <div className="bg-white/50 dark:bg-black/20 p-2 rounded border border-red-200 dark:border-red-800 mt-2">
                                        <p className="text-sm font-bold text-red-700 dark:text-red-400">
                                            "{moto.observacoes?.replace(/RETRABALHO.*?: /, '')}"
                                        </p>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Button onClick={() => iniciarTrabalho(moto, true)} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-12 shadow-red-900/20 shadow-lg">
                                        <RotateCcw className="w-5 h-5 mr-2" /> CORRIGIR AGORA
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* SEÇÃO: FILA NORMAL (Desabilitada visualmente se houver pausa ativa) */}
            <div className={motoAtiva && motoAtiva.status === 'pausado' ? 'opacity-40 pointer-events-none grayscale' : ''}>
                <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                    <Wrench className="w-5 h-5" /> Fila de Produção
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {fila.length === 0 ? (
                    <div className="col-span-full py-12 text-center border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800">
                        <p className="text-slate-400">Nenhuma caixa aguardando.</p>
                    </div>
                ) : (
                    fila.map((moto) => (
                    <Card key={moto.id} className="hover:border-blue-500 transition-all border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                        <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                            <Badge variant="secondary" className="font-mono">{moto.sku}</Badge>
                            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">NOVA</Badge>
                        </div>
                        <CardTitle className="text-xl mt-2">{moto.modelo}</CardTitle>
                        <CardDescription>{moto.localizacao || 'Sem local'}</CardDescription>
                        </CardHeader>
                        <CardContent>
                        <Button onClick={() => iniciarTrabalho(moto, false)} className="w-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold">
                            <Play className="w-4 h-4 mr-2" /> INICIAR
                        </Button>
                        </CardContent>
                    </Card>
                    ))
                )}
                </div>
            </div>
          </>
        )}

        {/* MODO PRODUÇÃO (Tela de Checklist) */}
        {modo === 'producao' && motoAtiva && (
          <div className="max-w-4xl mx-auto">
             
             {/* Header */}
             <div className={`
                ${motoAtiva.observacoes?.includes('RETRABALHO') ? 'bg-red-600' : 'bg-blue-600'} 
                text-white p-6 rounded-t-2xl shadow-lg flex flex-col md:flex-row justify-between items-center gap-4 transition-colors duration-500`}>
                <div>
                   <p className="text-white/80 text-sm font-bold uppercase tracking-widest mb-1 flex items-center gap-2">
                       {motoAtiva.observacoes?.includes('RETRABALHO') ? <><RotateCcw className="w-4 h-4"/> CORREÇÃO</> : 
                        <><Play className="w-4 h-4 animate-pulse"/> EM PRODUÇÃO</>}
                   </p>
                   <h1 className="text-3xl font-black">{motoAtiva.modelo}</h1>
                   <p className="opacity-90 font-mono">{motoAtiva.sku}</p>
                </div>
                
                <div className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-lg text-center min-w-[120px]">
                    <span className="block text-xs uppercase font-bold opacity-80">Tempo</span>
                    <span className="text-xl font-bold">ATIVO</span>
                </div>
             </div>

            <Card className="rounded-t-none border-t-0 bg-white dark:bg-slate-900 shadow-xl border-slate-200 dark:border-slate-800">
              <CardContent className="p-6 md:p-8 space-y-8">
                
                {/* Overlay de Bloqueio de Pausa (Aguardando) */}
                {aguardandoAutorizacao && (
                    <div className="absolute inset-0 bg-white/90 dark:bg-black/90 z-50 flex flex-col items-center justify-center rounded-b-xl backdrop-blur-sm animate-in fade-in">
                        <Loader2 className="w-16 h-16 text-blue-600 animate-spin mb-4" />
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Solicitação Enviada!</h2>
                        <p className="text-slate-500 text-lg">Aguarde a liberação do supervisor...</p>
                    </div>
                )}

                {motoAtiva.observacoes?.includes('RETRABALHO') && (
                    <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-900/50">
                        <p className="font-bold text-red-700 dark:text-red-400">Correção Solicitada:</p>
                        <p className="text-lg">{motoAtiva.observacoes}</p>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-6 gap-4">
                   <h2 className="text-xl font-bold flex items-center gap-2"><CheckCircle2 className="w-5 h-5"/> Checklist de Montagem</h2>
                   <div className="flex gap-2 w-full sm:w-auto">
                      <Button variant="outline" onClick={handleSolicitarPausa} className="flex-1 sm:flex-none text-amber-600 border-amber-200 hover:bg-amber-50 dark:border-amber-900/50 dark:hover:bg-amber-900/20">
                         <Pause className="w-4 h-4 mr-2" /> PAUSAR
                      </Button>
                      
                      <Button variant="secondary" onClick={handleMarcarTudo} className="flex-1 sm:flex-none">
                         MARCAR TUDO
                      </Button>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {CHECKLIST_ITENS.map((item, idx) => (
                    <div 
                        key={idx} 
                        onClick={() => toggleCheck(item)} 
                        className={`flex items-center space-x-3 p-4 rounded-xl border-2 transition-all cursor-pointer
                            ${checklist[item] ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-slate-100 dark:border-slate-800 hover:border-slate-300'}`}
                    >
                      <Checkbox checked={checklist[item]} className="data-[state=checked]:bg-green-500" />
                      <label className="text-sm font-medium cursor-pointer select-none">{item}</label>
                    </div>
                  ))}
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                   <Button 
                     onClick={finalizarMontagem} 
                     className="w-full h-16 text-lg font-bold bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20"
                   >
                      {motoAtiva.observacoes?.includes('RETRABALHO') ? 'CORREÇÃO FINALIZADA' : 'FINALIZAR MONTAGEM'} <ArrowRight className="ml-2 w-6 h-6" />
                   </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </RoleGuard>
  );
}