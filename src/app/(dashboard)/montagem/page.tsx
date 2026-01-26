"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  Timer, Wrench, CheckSquare, Save, AlertCircle, ArrowLeft, Bike, PlayCircle, X, Clock, AlertTriangle 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

// --- CHECKLISTS (Mantidos da versão anterior) ---
const CHECKLISTS = {
  STREET: {
    titulo: "Protocolo Street (JEF/SHI/Worker)",
    itens: [
      "Altura e Aperto do Guidon", "Altura do Freio Traseiro", "Folga do Freio Combinado (CBS)",
      "Aperto do Escapamento", "Regulagem da Corrente", "Parafusos da Carenagem",
      "Calibragem dos Pneus", "Aperto Alças Bagageiro", "Aperto Piscas (Tras/Dian)",
      "Trava do Banco", "Luz do Farol, Pisca e Freios", "Altura do Passador de Marcha",
      "Aperto Eixo Dianteiro", "Aperto Pinça de Freio", "Mangueira de Combustível",
      "Parafuso Suspensão Tras.", "Porca Amortecedor Central", "Passagem de Cabos", "Luzes Painel"
    ]
  },
  CUB: {
    titulo: "Protocolo CUB/Scooter (JET/Phoenix)",
    itens: [
      "Trava do Guidon", "Aperto do Guidon", "Aperto Parafusos Escape",
      "Aperto Paraf. Carenagem nº 8", "Regulagem da Corrente", "Parafusos da Carenagem Geral",
      "Calibragem dos Pneus", "Freios Traseiros", "Luzes e Lâmpadas",
      "Encaixe das Carenagens", "Parafuso da Pinça de Freio"
    ]
  }
};

type MotoMontagem = {
  id: string;
  modelo: string;
  sku: string;
  cor: string;
  ano: string;
  status: string;
  inicio_montagem: string | null;
  observacoes: string;
};

export default function MontagemPage() {
  const [loading, setLoading] = useState(true);
  const [fila, setFila] = useState<MotoMontagem[]>([]);
  
  // Estados de Controle
  const [motoSelecionada, setMotoSelecionada] = useState<MotoMontagem | null>(null); // Moto no Modal de Confirmação
  const [motoAtiva, setMotoAtiva] = useState<MotoMontagem | null>(null); // Moto sendo trabalhada
  
  // Workbench
  const [checklistMarcado, setChecklistMarcado] = useState<Record<string, boolean>>({});
  const [observacao, setObservacao] = useState("");
  const [tempoDecorrido, setTempoDecorrido] = useState(0);

  useEffect(() => {
    fetchFila();
    recuperarSessao();
  }, []);

  // Timer: Roda independente da aba estar aberta
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (motoAtiva && motoAtiva.inicio_montagem) {
      // Função que recalcula o tempo baseado na hora de início (Server Time)
      // Isso garante que se o cara fechar a aba as 14:00 e voltar as 14:10, o timer pula 10 min
      const atualizarTimer = () => {
        const start = new Date(motoAtiva.inicio_montagem!).getTime();
        const now = new Date().getTime();
        const diff = Math.floor((now - start) / 1000);
        setTempoDecorrido(diff > 0 ? diff : 0);
      };

      atualizarTimer(); // Atualiza já na montagem
      interval = setInterval(atualizarTimer, 1000);
    }
    return () => clearInterval(interval);
  }, [motoAtiva]);

  async function fetchFila() {
    setLoading(true);
    const { data } = await supabase
      .from('motos')
      .select('*')
      .in('status', ['montagem', 'em_andamento'])
      .order('created_at', { ascending: true });
    
    if (data) setFila(data as any);
    setLoading(false);
  }

  // Recupera se o usuário deu F5 ou fechou a aba
  function recuperarSessao() {
    const salva = localStorage.getItem("sgm_moto_ativa");
    if (salva) {
       const m = JSON.parse(salva);
       // Verifica se ainda faz sentido (status não mudou no banco por outro gestor)
       setMotoAtiva(m);
       setObservacao(m.observacoes || "");
    }
  }

  const confirmarInicio = async () => {
    if (!motoSelecionada) return;

    const agora = new Date().toISOString();
    const userStr = localStorage.getItem('sgm_user');
    const user = userStr ? JSON.parse(userStr) : null;

    // Atualiza Banco
    const { error } = await supabase
      .from('motos')
      .update({ 
        status: 'em_andamento', 
        inicio_montagem: agora,
        montador_id: user?.id 
      })
      .eq('id', motoSelecionada.id);

    if (error) {
      toast.error("Erro de conexão. Tente novamente.");
      return;
    }

    // Atualiza Estado Local
    const motoAtualizada = { ...motoSelecionada, status: 'em_andamento', inicio_montagem: agora };
    setMotoAtiva(motoAtualizada);
    localStorage.setItem("sgm_moto_ativa", JSON.stringify(motoAtualizada));
    
    // Limpa modais
    setMotoSelecionada(null);
    setTempoDecorrido(0);
    toast.success("Cronômetro iniciado! Bom trabalho.");
  };

  const finalizarMontagem = async () => {
    if (!motoAtiva) return;

    const agora = new Date().toISOString();
    const minutosTotais = Math.floor(tempoDecorrido / 60);

    const { error } = await supabase
      .from('motos')
      .update({
        status: 'qualidade',
        fim_montagem: agora,
        tempo_montagem: minutosTotais,
        checklist_dados: checklistMarcado,
        observacoes: observacao
      })
      .eq('id', motoAtiva.id);

    if (error) {
      toast.error("Erro ao finalizar. Verifique sua conexão.");
      return;
    }

    toast.success(`Montagem finalizada em ${minutosTotais} min!`);
    
    // Reset Total
    setMotoAtiva(null);
    setChecklistMarcado({});
    setObservacao("");
    setTempoDecorrido(0);
    localStorage.removeItem("sgm_moto_ativa");
    fetchFila();
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const identificarChecklist = (modelo: string) => {
    const m = modelo.toUpperCase();
    if (m.includes("JEF") || m.includes("WORKER") || m.includes("SHI")) return CHECKLISTS.STREET;
    return CHECKLISTS.CUB;
  };

  return (
    <RoleGuard allowedRoles={['mecanico', 'gestor']}>
      <div className="space-y-6 pb-20 relative min-h-screen">

        {/* --- MODAL DE CONFIRMAÇÃO (Janela "Antes de Entrar") --- */}
        {motoSelecionada && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
             <Card className="w-full max-w-lg shadow-2xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                <CardHeader className="border-b border-slate-100 dark:border-slate-800">
                   <div className="flex justify-between items-start">
                      <CardTitle className="text-xl font-bold text-slate-800 dark:text-white">
                         Preparar Bancada
                      </CardTitle>
                      <button onClick={() => setMotoSelecionada(null)} className="text-slate-400 hover:text-slate-600">
                         <X className="w-6 h-6" />
                      </button>
                   </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                   
                   {/* Detalhes da Moto */}
                   <div className="flex gap-4 items-start">
                      <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                         <Bike className="w-10 h-10 text-slate-400" />
                      </div>
                      <div className="space-y-1">
                         <h2 className="text-2xl font-black text-slate-900 dark:text-white leading-none">
                            {motoSelecionada.modelo}
                         </h2>
                         <Badge variant="outline" className="text-slate-500 font-mono text-xs">
                            {motoSelecionada.sku}
                         </Badge>
                         <div className="flex gap-2 pt-2">
                            <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
                               {motoSelecionada.cor}
                            </Badge>
                            <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
                               {motoSelecionada.ano}
                            </Badge>
                         </div>
                      </div>
                   </div>

                   {/* Aviso do Timer */}
                   <div className="bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500 p-4 rounded-r-lg">
                      <div className="flex gap-3">
                         <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0" />
                         <div className="text-sm text-orange-800 dark:text-orange-200">
                            <p className="font-bold mb-1">Atenção ao Tempo</p>
                            <p className="opacity-90">
                               Ao clicar em iniciar, o cronômetro começará a rodar automaticamente e 
                               <strong> continuará contando mesmo se você sair desta tela</strong>.
                            </p>
                         </div>
                      </div>
                   </div>

                   {/* Ações */}
                   <div className="grid grid-cols-2 gap-3 pt-2">
                      <Button variant="outline" onClick={() => setMotoSelecionada(null)} className="h-12">
                         Cancelar
                      </Button>
                      <Button 
                         onClick={confirmarInicio} 
                         className="h-12 bg-green-600 hover:bg-green-700 text-white font-bold text-lg shadow-lg shadow-green-600/20"
                      >
                         <PlayCircle className="w-5 h-5 mr-2" /> INICIAR
                      </Button>
                   </div>

                </CardContent>
             </Card>
          </div>
        )}

        {/* --- TELA PRINCIPAL --- */}
        
        {/* CABEÇALHO (Só aparece se não estiver focado) */}
        {!motoAtiva && (
          <div>
             <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                <Wrench className="w-8 h-8 text-orange-600" /> Linha de Montagem
             </h1>
             <p className="text-slate-500">Selecione uma ordem de serviço para iniciar.</p>
          </div>
        )}

        {/* 1. LISTA DE ESPERA */}
        {!motoAtiva && (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in slide-in-from-bottom-4 duration-500">
              {loading ? (
                 <div className="col-span-full text-center py-20"><p>Buscando ordens...</p></div>
              ) : fila.length === 0 ? (
                 <div className="col-span-full flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                    <Bike className="w-16 h-16 text-slate-300 mb-4" />
                    <p className="text-slate-500 text-lg font-medium">Linha parada</p>
                    <p className="text-sm text-slate-400">Nenhuma moto registrada na entrada.</p>
                 </div>
              ) : (
                 fila.map((moto) => (
                    <Card 
                      key={moto.id} 
                      className="cursor-pointer hover:border-orange-500 hover:-translate-y-1 transition-all hover:shadow-xl group bg-white dark:bg-slate-900"
                      onClick={() => setMotoSelecionada(moto)} // <--- Abre o Modal em vez de iniciar direto
                    >
                       <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                          <div className="flex justify-between items-start">
                             <Badge variant="outline" className="font-mono text-xs text-slate-400">
                                {moto.sku.substring(0, 8)}...
                             </Badge>
                             <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
                          </div>
                          <CardTitle className="text-lg pt-2">{moto.modelo}</CardTitle>
                       </CardHeader>
                       <CardContent className="pt-4">
                          <div className="flex justify-between items-center text-sm text-slate-500 mb-4">
                             <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">{moto.cor}</span>
                             <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">{moto.ano}</span>
                          </div>
                          <Button className="w-full bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 hover:bg-orange-600 hover:text-white border-orange-200 dark:border-orange-900 border transition-colors">
                             VISUALIZAR ORDEM
                          </Button>
                       </CardContent>
                    </Card>
                 ))
              )}
           </div>
        )}

        {/* 2. ÁREA DE TRABALHO (WORKBENCH) */}
        {motoAtiva && (
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in zoom-in-95 duration-300">
              
              {/* PAINEL ESQUERDO (Timer e Info) */}
              <div className="space-y-6 lg:sticky lg:top-6 h-fit">
                 
                 {/* Cronômetro */}
                 <Card className="bg-slate-900 text-white border-0 shadow-2xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                       <Timer className="w-32 h-32" />
                    </div>
                    <CardContent className="p-8 text-center relative z-10">
                       <div className="flex items-center justify-center gap-2 mb-2 text-orange-400 animate-pulse">
                          <Clock className="w-4 h-4" />
                          <span className="text-xs font-bold uppercase tracking-widest">Em Execução</span>
                       </div>
                       <div className="text-7xl font-mono font-black tracking-tighter mb-6">
                          {formatTime(tempoDecorrido)}
                       </div>
                       
                       <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 text-left border border-white/10">
                          <h2 className="text-xl font-bold mb-1">{motoAtiva.modelo}</h2>
                          <p className="font-mono text-xs text-slate-400 mb-3">{motoAtiva.sku}</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                             <div className="bg-black/30 p-2 rounded">
                                <span className="block text-slate-400">Cor</span>
                                <span className="font-bold">{motoAtiva.cor}</span>
                             </div>
                             <div className="bg-black/30 p-2 rounded">
                                <span className="block text-slate-400">Ano</span>
                                <span className="font-bold">{motoAtiva.ano}</span>
                             </div>
                          </div>
                       </div>
                    </CardContent>
                 </Card>

                 <Button 
                    variant="outline" 
                    className="w-full border-dashed border-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                    onClick={() => {
                        setMotoAtiva(null);
                        localStorage.removeItem("sgm_moto_ativa");
                        toast.info("Trabalho pausado. O tempo continua contando.");
                    }}
                 >
                    <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para Fila (Não para o timer)
                 </Button>
              </div>

              {/* PAINEL DIREITO (Checklist) */}
              <div className="lg:col-span-2 space-y-6">
                 <Card className="border-t-4 border-t-orange-500 shadow-md">
                    <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                       <div className="flex justify-between items-center">
                          <CardTitle className="flex items-center gap-2 text-lg">
                             <CheckSquare className="w-5 h-5 text-green-600" />
                             Checklist de Montagem
                          </CardTitle>
                          <Badge variant="secondary" className="bg-white dark:bg-slate-800">
                             {identificarChecklist(motoAtiva.modelo).titulo}
                          </Badge>
                       </div>
                    </CardHeader>
                    <CardContent className="p-6">
                       <div className="grid grid-cols-1 gap-3">
                          {identificarChecklist(motoAtiva.modelo).itens.map((item, idx) => (
                             <div 
                                key={idx} 
                                className={`flex items-start space-x-4 p-4 rounded-xl transition-all border ${checklistMarcado[item] ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-900' : 'bg-white border-slate-100 hover:border-slate-300 dark:bg-slate-950 dark:border-slate-800'}`}
                             >
                                <Checkbox 
                                  id={`item-${idx}`} 
                                  className="mt-1 w-5 h-5 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                                  checked={checklistMarcado[item] || false}
                                  onCheckedChange={(checked) => 
                                     setChecklistMarcado(prev => ({...prev, [item]: checked === true}))
                                  }
                                />
                                <label 
                                  htmlFor={`item-${idx}`} 
                                  className={`text-base font-medium leading-snug cursor-pointer select-none flex-1 ${checklistMarcado[item] ? 'text-green-800 dark:text-green-300' : 'text-slate-700 dark:text-slate-300'}`}
                                >
                                  {item}
                                </label>
                             </div>
                          ))}
                       </div>

                       <div className="mt-8">
                          <label className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 block">
                             Diário de Bordo / Observações
                          </label>
                          <Textarea 
                             placeholder="Descreva eventuais problemas ou detalhes da montagem..."
                             value={observacao}
                             onChange={(e) => setObservacao(e.target.value)}
                             className="bg-slate-50 dark:bg-slate-900 min-h-[100px] border-slate-200 dark:border-slate-800 focus:border-orange-500 transition-colors"
                          />
                       </div>
                    </CardContent>
                 </Card>

                 <Button 
                    size="lg" 
                    className="w-full h-20 text-xl font-bold bg-green-600 hover:bg-green-700 shadow-xl shadow-green-600/20 transition-transform active:scale-95"
                    onClick={finalizarMontagem}
                 >
                    <Save className="w-6 h-6 mr-3" /> FINALIZAR E ENVIAR PARA QUALIDADE
                 </Button>
              </div>

           </div>
        )}
      </div>
    </RoleGuard>
  );
}