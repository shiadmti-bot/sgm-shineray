"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  Wrench, Play, Pause, CheckCircle2, AlertTriangle, ArrowRight, RotateCcw, Loader2, Clock, PaintBucket, Armchair, ScanBarcode, Timer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  
  // Inputs Controlados
  const [corMotoInput, setCorMotoInput] = useState("");
  const [corBancoInput, setCorBancoInput] = useState("");
  
  // Timer Visual
  const [tempoDecorrido, setTempoDecorrido] = useState("00:00");
  
  const [aguardandoAutorizacao, setAguardandoAutorizacao] = useState(false);

  useEffect(() => {
    verificarEstadoAtual();
    const interval = setInterval(() => {
        if (modo === 'fila') {
            const user = JSON.parse(localStorage.getItem('sgm_user') || '{}');
            if(user.id) carregarListas(user.id);
        }
    }, 5000);
    return () => clearInterval(interval);
  }, [modo]); 

  // Timer Effect
  useEffect(() => {
      let timer: NodeJS.Timeout;
      if (motoAtiva && modo === 'producao' && motoAtiva.inicio_montagem) {
          timer = setInterval(() => {
              const inicio = new Date(motoAtiva.inicio_montagem).getTime();
              const agora = new Date().getTime();
              const diff = agora - inicio;
              const mins = Math.floor(diff / 60000);
              const secs = Math.floor((diff % 60000) / 1000);
              setTempoDecorrido(`${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`);
          }, 1000);
      }
      return () => clearInterval(timer);
  }, [motoAtiva, modo]);

  // Salva o checklist localmente
  useEffect(() => {
      if (motoAtiva && Object.keys(checklist).length > 0) {
          localStorage.setItem(`checklist_${motoAtiva.id}`, JSON.stringify(checklist));
      }
  }, [checklist, motoAtiva]);

  // Listener de Pausa
  useEffect(() => {
    if (!aguardandoAutorizacao) return;
    const user = JSON.parse(localStorage.getItem('sgm_user') || '{}');
    const channel = supabase.channel('minhas-solicitacoes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'solicitacoes_pausa', filter: `montador_id=eq.${user?.id}` }, (payload) => {
          if (payload.new.status === 'aprovado') {
             toast.success("Pausa Autorizada!");
             setAguardandoAutorizacao(false);
             verificarEstadoAtual(); 
          } else if (payload.new.status === 'rejeitado') {
             toast.error("Solicitação negada.");
             setAguardandoAutorizacao(false);
          }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [aguardandoAutorizacao]);


  // 1. Função Corrigida: Busca qualquer moto ativa (inclusive retrabalho que acabou de começar)
  async function verificarEstadoAtual() {
    setLoading(true);
    const user = JSON.parse(localStorage.getItem('sgm_user') || '{}');
    if (!user.id) { setLoading(false); return; }

    try {
        // Busca moto onde sou o montador E o status é de trabalho ativo
        const { data: ativas } = await supabase
          .from('motos')
          .select('*')
          .eq('montador_id', user.id)
          .in('status', ['em_producao', 'pausado']) 
          .order('updated_at', { ascending: false });

        // Se encontrar alguma moto sendo trabalhada, assume ela
        const ativa = ativas && ativas.length > 0 ? ativas[0] : null;

        if (ativa) {
          setMotoAtiva(ativa);
          
          // Recupera estado dos inputs
          if (ativa.cor) setCorMotoInput(ativa.cor);
          else setCorMotoInput(""); 

          if (ativa.cor_banco) setCorBancoInput(ativa.cor_banco);
          else setCorBancoInput(""); 

          // Verifica se tem pausa
          if (ativa.status !== 'pausado') {
             const { data: pendente } = await supabase.from('solicitacoes_pausa').select('id').eq('moto_id', ativa.id).eq('status', 'pendente').maybeSingle();
             setAguardandoAutorizacao(!!pendente);
          } else {
             setAguardandoAutorizacao(false);
          }

          // Define o modo correto da tela
          if (ativa.status === 'pausado') setModo('fila');
          else setModo('producao');
          
          // Recupera checklist
          const salvo = localStorage.getItem(`checklist_${ativa.id}`);
          if (salvo) { setChecklist(JSON.parse(salvo)); } 
          else {
              const checkInicial: any = {};
              CHECKLIST_ITENS.forEach(i => checkInicial[i] = false);
              setChecklist(checkInicial);
          }
        } else {
          // Se não achou moto ativa, vai pra fila e carrega as listas
          setMotoAtiva(null);
          setModo('fila');
          await carregarListas(user.id);
        }
    } catch (err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
  }

  async function carregarListas(userId: string) {
    // Busca Retrabalhos pendentes
    const { data: retrabalho } = await supabase
        .from('motos')
        .select(`*, supervisor:funcionarios!motos_supervisor_id_fkey(nome)`)
        .eq('status', 'retrabalho_montagem')
        .eq('montador_id', userId); // Só os meus retrabalhos

    // Busca Caixas Novas
    const { data: caixas } = await supabase
        .from('motos')
        .select('*')
        .eq('status', 'aguardando_montagem')
        .order('created_at', { ascending: true });

    if(retrabalho) setFilaRetrabalho(retrabalho);
    if(caixas) setFila(caixas);
  }

  // 2. Função Corrigida: Força a mudança de tela visualmente (Optimistic Update)
  async function iniciarTrabalho(moto: any, ehRetrabalho: boolean) {
    const user = JSON.parse(localStorage.getItem('sgm_user') || '{}');
    
    // Prepara o objeto atualizado
    const updateData: any = {
        status: 'em_producao',
        montador_id: user.id,
        localizacao: `Box ${user.nome.split(' ')[0]}`
    };

    if (!ehRetrabalho) {
        updateData.inicio_montagem = new Date().toISOString();
    }

    setLoading(true); 
    
    // Atualiza no banco
    const { error } = await supabase.from('motos').update(updateData).eq('id', moto.id);

    if (error) {
      toast.error("Erro ao iniciar.");
      setLoading(false);
    } else {
      toast.success(ehRetrabalho ? "Corrigindo Erro..." : "Montagem Iniciada!");
      await registrarLog('INICIO_MONTAGEM', moto.sku);
      
      // TRUQUE: Atualiza o estado LOCALMENTE antes de esperar o banco
      // Isso garante que a tela mude instantaneamente
      const motoAtualizada = { ...moto, ...updateData };
      setMotoAtiva(motoAtualizada);
      setModo('producao');
      
      // Limpa inputs
      setCorMotoInput(moto.cor || "");
      setCorBancoInput(moto.cor_banco || "");
      
      setLoading(false);
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
    if (!motoAtiva) return;
    const pendentes = CHECKLIST_ITENS.filter(i => !checklist[i]);
    if (pendentes.length > 0) return toast.error(`Checklist incompleto!`);
    if (!corMotoInput || !corBancoInput) return toast.warning("Selecione as cores.");

    if (!confirm("Confirmar finalização?")) return;

    let updatePayload: any = {
        status: 'em_analise',
        fim_montagem: new Date().toISOString(),
        localizacao: 'Pátio de Qualidade',
        cor: corMotoInput,
        cor_banco: corBancoInput
    };
    
    if (motoAtiva.observacoes?.includes('RETRABALHO')) updatePayload.observacoes = null; 

    const { error } = await supabase.from('motos').update(updatePayload).eq('id', motoAtiva.id);

    if (error) toast.error("Erro ao finalizar.");
    else {
      toast.success("Enviado para Qualidade.");
      await registrarLog('PRODUCAO_FIM', motoAtiva.sku, { cor: corMotoInput, banco: corBancoInput });
      localStorage.removeItem(`checklist_${motoAtiva.id}`);
      
      // Reseta tudo para voltar pra fila
      setMotoAtiva(null);
      setCorMotoInput(""); setCorBancoInput("");
      setModo('fila');
      verificarEstadoAtual(); // Recarrega a fila
    }
  };

  const handleSolicitarPausa = async () => {
      const motivo = prompt("Qual o motivo da pausa? (Ex: Almoço, Banheiro, Peça)");
      if (!motivo) return;
      setAguardandoAutorizacao(true);
      const user = JSON.parse(localStorage.getItem('sgm_user') || '{}');
      await supabase.from('solicitacoes_pausa').insert({ montador_id: user?.id, moto_id: motoAtiva.id, motivo: motivo });
      toast.info("Solicitação enviada! Aguarde...");
  };

  const handleRetomar = async () => {
      await supabase.from('motos').update({ status: 'em_producao' }).eq('id', motoAtiva.id);
      toast.success("Produção Retomada");
      verificarEstadoAtual(); 
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
        
        {modo === 'fila' && (
          <>
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white">Central de Montagem</h1>
                <p className="text-slate-500">Selecione uma tarefa para iniciar.</p>
              </div>
            </div>

            {/* CARD DE RETOMADA (Pausa) */}
            {motoAtiva && motoAtiva.status === 'pausado' && (
                <div className="mb-8 animate-in slide-in-from-top-4 duration-500">
                    <Card className="border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-900/20 shadow-xl">
                        <CardContent className="p-6 flex items-center justify-between">
                             <div className="flex items-center gap-4">
                                <Clock className="w-8 h-8 text-amber-600"/>
                                <div>
                                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">Produção Pausada</h3>
                                    <p className="text-slate-500">{motoAtiva.modelo} - {motoAtiva.sku}</p>
                                </div>
                             </div>
                             <Button onClick={handleRetomar} className="h-12 text-lg font-bold bg-amber-600 hover:bg-amber-700 text-white">
                                <Play className="w-5 h-5 mr-2 fill-current" /> RETOMAR
                             </Button>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* SEÇÃO DE RETRABALHO */}
            {filaRetrabalho.length > 0 && (
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-red-600 mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" /> PRIORIDADE: RETRABALHO
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filaRetrabalho.map(moto => (
                            <Card key={moto.id} className="border-l-4 border-l-red-600 bg-red-50 dark:bg-red-900/20 shadow-lg animate-pulse">
                                <CardContent className="p-6 flex justify-between items-center">
                                    <div>
                                        <Badge variant="destructive" className="mb-2">CORRIGIR ERRO</Badge>
                                        <h3 className="text-xl font-bold">{moto.modelo}</h3>
                                        <p className="text-red-700 font-bold mt-1">"{moto.observacoes?.replace(/RETRABALHO.*?: /, '')}"</p>
                                        <p className="text-xs text-slate-500 mt-2">Reprovado por: {moto.supervisor?.nome}</p>
                                    </div>
                                    <Button onClick={() => iniciarTrabalho(moto, true)} className="bg-red-600 hover:bg-red-700 text-white font-bold h-12">
                                        <RotateCcw className="w-5 h-5 mr-2" /> CORRIGIR
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* SEÇÃO: FILA NORMAL */}
            <div className={motoAtiva && motoAtiva.status === 'pausado' ? 'opacity-40 pointer-events-none grayscale' : ''}>
                <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                    <Wrench className="w-5 h-5" /> Fila de Produção
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {fila.length === 0 ? (
                    <div className="col-span-full py-12 text-center border-2 border-dashed rounded-xl">
                        <p className="text-slate-400">Nenhuma caixa aguardando.</p>
                    </div>
                ) : (
                    fila.map((moto) => (
                    <Card key={moto.id} className="hover:border-blue-500 transition-all cursor-pointer border-l-4 border-l-transparent hover:border-l-blue-500">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start mb-4">
                                <Badge variant="secondary" className="font-mono">{moto.sku}</Badge>
                                <Badge className="bg-blue-100 text-blue-700">NOVA</Badge>
                            </div>
                            <h3 className="text-xl font-bold mb-1">{moto.modelo}</h3>
                            <p className="text-slate-500 text-sm mb-6">{moto.localizacao || 'Sem local'}</p>
                            <Button onClick={() => iniciarTrabalho(moto, false)} className="w-full bg-slate-900 text-white font-bold">
                                <Play className="w-4 h-4 mr-2" /> INICIAR MONTAGEM
                            </Button>
                        </CardContent>
                    </Card>
                    ))
                )}
                </div>
            </div>
          </>
        )}

        {/* MODO PRODUÇÃO */}
        {modo === 'producao' && motoAtiva && (
          <div className="max-w-4xl mx-auto">
             <div className={`
                ${motoAtiva.observacoes?.includes('RETRABALHO') ? 'bg-red-600' : 'bg-blue-600'} 
                text-white p-6 rounded-t-2xl shadow-lg flex flex-col md:flex-row justify-between items-center gap-4 transition-colors duration-500`}>
                <div>
                   <p className="text-white/80 text-sm font-bold uppercase tracking-widest mb-1 flex items-center gap-2">
                       {motoAtiva.observacoes?.includes('RETRABALHO') ? <><RotateCcw className="w-4 h-4"/> CORREÇÃO EM ANDAMENTO</> : 
                        <><Play className="w-4 h-4 animate-pulse"/> EM PRODUÇÃO</>}
                   </p>
                   <h1 className="text-3xl font-black">{motoAtiva.modelo}</h1>
                   <div className="flex items-center gap-2 mt-1">
                        <ScanBarcode className="w-4 h-4 opacity-70"/> 
                        <p className="opacity-90 font-mono tracking-widest">{motoAtiva.sku}</p>
                   </div>
                </div>
                
                <div className="bg-white/20 backdrop-blur-md px-6 py-3 rounded-xl text-center min-w-[140px] border border-white/30">
                    <span className="block text-xs uppercase font-bold opacity-80 mb-1 flex items-center justify-center gap-1"><Timer className="w-3 h-3"/> Tempo</span>
                    <span className="text-3xl font-mono font-black tracking-widest">{tempoDecorrido}</span>
                </div>
             </div>

            <Card className="rounded-t-none border-t-0 bg-white dark:bg-slate-900 shadow-xl">
              <CardContent className="p-6 md:p-8 space-y-8">
                
                {aguardandoAutorizacao && (
                    <div className="absolute inset-0 bg-white/90 dark:bg-black/90 z-50 flex flex-col items-center justify-center rounded-b-xl backdrop-blur-sm animate-in fade-in">
                        <Loader2 className="w-16 h-16 text-blue-600 animate-spin mb-4" />
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Solicitação Enviada!</h2>
                        <p className="text-slate-500 text-lg">Aguarde a liberação do supervisor...</p>
                    </div>
                )}

                {motoAtiva.observacoes?.includes('RETRABALHO') && (
                    <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-900/50 animate-in slide-in-from-top-2">
                        <p className="font-bold text-red-700 dark:text-red-400 flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> O que precisa ser corrigido:</p>
                        <p className="text-lg mt-1 pl-7 font-medium">{motoAtiva.observacoes?.replace('RETRABALHO:', '')}</p>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-6 gap-4">
                   <h2 className="text-xl font-bold flex items-center gap-2"><CheckCircle2 className="w-6 h-6 text-green-600"/> Checklist de Segurança</h2>
                   <div className="flex gap-2 w-full sm:w-auto">
                      <Button variant="outline" onClick={handleSolicitarPausa} className="flex-1 sm:flex-none text-amber-600 border-amber-200 hover:bg-amber-50">
                         <Pause className="w-4 h-4 mr-2" /> PAUSAR
                      </Button>
                      <Button variant="secondary" onClick={handleMarcarTudo} className="flex-1 sm:flex-none">
                         MARCAR TUDO
                      </Button>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {CHECKLIST_ITENS.map((item, idx) => (
                    <div key={idx} onClick={() => toggleCheck(item)} className={`flex items-center space-x-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${checklist[item] ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-slate-100 dark:border-slate-800 hover:border-slate-300'}`}>
                      <Checkbox checked={checklist[item]} className="data-[state=checked]:bg-green-500 w-5 h-5" />
                      <label className="text-sm font-medium cursor-pointer select-none">{item}</label>
                    </div>
                  ))}
                </div>

                <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-500 uppercase mb-4 flex items-center gap-2"><PaintBucket className="w-4 h-4"/> Acabamento Final</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-bold">Cor da Carenagem</label>
                            <Select value={corMotoInput} onValueChange={setCorMotoInput}>
                                <SelectTrigger className="h-12 bg-white dark:bg-slate-900"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Vermelha">🔴 Vermelha</SelectItem>
                                    <SelectItem value="Preta">⚫ Preta</SelectItem>
                                    <SelectItem value="Branca">⚪ Branca</SelectItem>
                                    <SelectItem value="Azul">🔵 Azul</SelectItem>
                                    <SelectItem value="Cinza">🔘 Cinza</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold">Cor do Banco</label>
                            <Select value={corBancoInput} onValueChange={setCorBancoInput}>
                                <SelectTrigger className="h-12 bg-white dark:bg-slate-900"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Preto">⚫ Preto</SelectItem>
                                    <SelectItem value="Marrom">🟤 Marrom</SelectItem>
                                    <SelectItem value="Bege">⚪ Bege</SelectItem>
                                    <SelectItem value="Vermelho">🔴 Vermelho</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                   <Button onClick={finalizarMontagem} className="w-full h-16 text-lg font-bold bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20 transition-all hover:scale-[1.01]">
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