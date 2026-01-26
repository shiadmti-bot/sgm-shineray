"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  ClipboardCheck, ThumbsUp, ThumbsDown, Search, AlertTriangle, 
  User, Clock, CheckCircle2, XCircle, Bike
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// Itens de Verificação Final (Padrão para todas as motos)
const ITENS_QUALIDADE = [
  "Inspeção Visual (Arranhões/Danos)",
  "Acionamento do Motor (Partida)",
  "Funcionamento Elétrico (Farol/Piscas/Buzina)",
  "Teste de Freios (Dianteiro/Traseiro)",
  "Torque das Rodas",
  "Nível de Óleo e Combustível",
  "Teste de Rodagem (Pátio)"
];

type MotoQualidade = {
  id: string;
  modelo: string;
  sku: string;
  cor: string;
  ano: string;
  montador_id: string;
  tempo_montagem: number;
  status: string;
  created_at: string;
};

export default function QualidadePage() {
  const [loading, setLoading] = useState(true);
  const [fila, setFila] = useState<MotoQualidade[]>([]);
  const [motoAtiva, setMotoAtiva] = useState<MotoQualidade | null>(null);
  
  // Estado da Inspeção
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [observacao, setObservacao] = useState("");
  const [modalReprovacaoOpen, setModalReprovacaoOpen] = useState(false);

  useEffect(() => {
    fetchFila();
  }, []);

  async function fetchFila() {
    setLoading(true);
    // Busca motos que saíram da montagem e estão aguardando qualidade
    const { data } = await supabase
      .from('motos')
      .select('*')
      .eq('status', 'qualidade')
      .order('fim_montagem', { ascending: true }); // As mais antigas primeiro
    
    if (data) setFila(data as any);
    setLoading(false);
  }

  const handleFinalizar = async (resultado: 'aprovado' | 'reprovado') => {
    if (!motoAtiva) return;

    // Se for reprovar, exige observação
    if (resultado === 'reprovado' && observacao.length < 5) {
      toast.warning("Para reprovar, descreva o motivo da falha.");
      return;
    }

    const userStr = localStorage.getItem('sgm_user');
    const user = userStr ? JSON.parse(userStr) : null;
    const agora = new Date().toISOString();

    const novoStatus = resultado === 'aprovado' ? 'estoque' : 'reprovado';

    const { error } = await supabase
      .from('motos')
      .update({
        status: novoStatus,
        inspector_id: user?.id,
        data_inspecao: agora,
        checklist_qualidade: checklist,
        observacoes: resultado === 'reprovado' ? observacao : null // Salva obs apenas se reprovado (ou geral)
      })
      .eq('id', motoAtiva.id);

    if (error) {
      toast.error("Erro ao salvar inspeção.");
      return;
    }

    if (resultado === 'aprovado') {
      toast.success(`Moto ${motoAtiva.modelo} Aprovada e enviada ao Estoque!`);
    } else {
      toast.error(`Moto Reprovada! Enviada para retrabalho.`);
    }

    // Reset
    setMotoAtiva(null);
    setChecklist({});
    setObservacao("");
    setModalReprovacaoOpen(false);
    fetchFila();
  };

  return (
    <RoleGuard allowedRoles={['gestor']}>
      <div className="space-y-6 animate-in fade-in duration-500 pb-20">
        
        {/* Cabeçalho */}
        {!motoAtiva && (
          <div className="flex justify-between items-end">
             <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                   <ClipboardCheck className="w-8 h-8 text-blue-600" /> Controle de Qualidade
                </h1>
                <p className="text-slate-500">Inspeção final e liberação para estoque.</p>
             </div>
             <Badge variant="outline" className="text-lg px-4 py-1 border-blue-200 text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400">
                Fila: {fila.length} Motos
             </Badge>
          </div>
        )}

        {/* MODO 1: FILA DE ESPERA */}
        {!motoAtiva && (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {loading ? (
                 <p className="col-span-full text-center py-10">Carregando fila...</p>
              ) : fila.length === 0 ? (
                 <div className="col-span-full flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/50">
                    <CheckCircle2 className="w-16 h-16 text-green-500/50 mb-4" />
                    <p className="text-slate-500 text-lg font-medium">Tudo Limpo!</p>
                    <p className="text-sm text-slate-400">Nenhuma moto aguardando inspeção no momento.</p>
                 </div>
              ) : (
                 fila.map((moto) => (
                    <Card 
                      key={moto.id} 
                      className="cursor-pointer hover:border-blue-500 hover:shadow-lg transition-all group bg-white dark:bg-slate-900"
                      onClick={() => setMotoAtiva(moto)}
                    >
                       <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                          <div className="flex justify-between items-start">
                             <Badge variant="outline" className="font-mono text-xs text-slate-400">
                                {moto.sku.substring(0, 10)}...
                             </Badge>
                             <Clock className="w-4 h-4 text-slate-300" />
                          </div>
                          <CardTitle className="text-lg pt-2">{moto.modelo}</CardTitle>
                       </CardHeader>
                       <CardContent className="pt-4 space-y-3">
                          <div className="flex justify-between items-center text-sm text-slate-500">
                             <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full" style={{backgroundColor: moto.cor === 'Vermelha' ? '#ef4444' : moto.cor === 'Preta' ? '#000' : '#ccc'}}></span>
                                {moto.cor}
                             </div>
                             <span>{moto.ano}</span>
                          </div>
                          
                          <div className="bg-slate-100 dark:bg-slate-800 rounded p-2 text-xs flex justify-between items-center">
                             <span className="text-slate-500">Tempo de Montagem:</span>
                             <span className="font-bold text-slate-700 dark:text-slate-300">{moto.tempo_montagem} min</span>
                          </div>

                          <Button className="w-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 hover:bg-blue-600 hover:text-white border-blue-200 dark:border-blue-900 border transition-colors">
                             INICIAR INSPEÇÃO
                          </Button>
                       </CardContent>
                    </Card>
                 ))
              )}
           </div>
        )}

        {/* MODO 2: INSPEÇÃO ATIVA */}
        {motoAtiva && (
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in zoom-in-95 duration-300">
              
              {/* Painel Esquerdo: Detalhes da Moto */}
              <div className="space-y-6">
                 <Card className="bg-slate-900 text-white border-0 shadow-2xl relative overflow-hidden">
                    <div className="absolute -right-10 -top-10 text-white/5">
                       <Bike className="w-64 h-64" />
                    </div>
                    <CardHeader>
                       <Badge className="w-fit bg-blue-600 hover:bg-blue-700 mb-2">EM INSPEÇÃO</Badge>
                       <CardTitle className="text-3xl font-black">{motoAtiva.modelo}</CardTitle>
                       <p className="font-mono text-slate-400">{motoAtiva.sku}</p>
                    </CardHeader>
                    <CardContent className="space-y-4 relative z-10">
                       <div className="grid grid-cols-2 gap-3">
                          <div className="bg-white/10 p-3 rounded-lg backdrop-blur-sm">
                             <p className="text-xs text-slate-400 uppercase">Cor</p>
                             <p className="font-bold text-lg">{motoAtiva.cor}</p>
                          </div>
                          <div className="bg-white/10 p-3 rounded-lg backdrop-blur-sm">
                             <p className="text-xs text-slate-400 uppercase">Ano</p>
                             <p className="font-bold text-lg">{motoAtiva.ano}</p>
                          </div>
                       </div>
                       
                       <div className="bg-black/30 p-4 rounded-lg border border-white/10">
                          <div className="flex items-center gap-3 mb-2">
                             <User className="w-5 h-5 text-slate-400" />
                             <span className="text-sm font-medium">Dados da Montagem</span>
                          </div>
                          <div className="text-sm text-slate-300 space-y-1 pl-8">
                             <p>Tempo gasto: <span className="text-white">{motoAtiva.tempo_montagem} minutos</span></p>
                             <p>Montador ID: <span className="font-mono text-xs">{motoAtiva.montador_id?.slice(0,8)}...</span></p>
                          </div>
                       </div>
                    </CardContent>
                 </Card>

                 <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setMotoAtiva(null)}
                 >
                    Cancelar / Voltar
                 </Button>
              </div>

              {/* Painel Direito: Checklist de Qualidade */}
              <div className="lg:col-span-2 space-y-6">
                 <Card className="border-t-4 border-t-blue-500 shadow-md">
                    <CardHeader className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                       <CardTitle className="flex items-center gap-2">
                          <ClipboardCheck className="w-5 h-5 text-blue-600" />
                          Checklist de Aprovação
                       </CardTitle>
                       <CardDescription>
                          Verifique todos os pontos críticos antes de liberar.
                       </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6">
                       <div className="grid grid-cols-1 gap-3 mb-8">
                          {ITENS_QUALIDADE.map((item, idx) => (
                             <div 
                                key={idx} 
                                className={`flex items-center space-x-4 p-4 rounded-xl transition-all border ${checklist[item] ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-900' : 'bg-white border-slate-100 hover:border-slate-300 dark:bg-slate-950 dark:border-slate-800'}`}
                             >
                                <Checkbox 
                                  id={`q-item-${idx}`} 
                                  className="w-6 h-6 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                  checked={checklist[item] || false}
                                  onCheckedChange={(checked) => 
                                     setChecklist(prev => ({...prev, [item]: checked === true}))
                                  }
                                />
                                <label 
                                  htmlFor={`q-item-${idx}`} 
                                  className={`text-base font-medium cursor-pointer flex-1 ${checklist[item] ? 'text-blue-800 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}`}
                                >
                                  {item}
                                </label>
                             </div>
                          ))}
                       </div>

                       {/* Ações de Decisão */}
                       <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                          
                          {/* Botão REPROVAR (Abre Dialog) */}
                          <Dialog open={modalReprovacaoOpen} onOpenChange={setModalReprovacaoOpen}>
                             <DialogTrigger asChild>
                                <Button 
                                   variant="destructive" 
                                   className="h-16 text-lg font-bold bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/20 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-900"
                                >
                                   <ThumbsDown className="w-6 h-6 mr-2" /> REPROVAR
                                </Button>
                             </DialogTrigger>
                             <DialogContent>
                                <DialogHeader>
                                   <DialogTitle className="text-red-600 flex items-center gap-2">
                                      <AlertTriangle className="w-5 h-5" /> Reprovar Moto
                                   </DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                   <p className="text-sm text-slate-500">
                                      Descreva o motivo da reprovação. Esta informação será enviada para o setor de reparos.
                                   </p>
                                   <Textarea 
                                      placeholder="Ex: Risco profundo no tanque; Pisca direito não funciona..."
                                      value={observacao}
                                      onChange={(e) => setObservacao(e.target.value)}
                                      className="min-h-[100px]"
                                   />
                                </div>
                                <DialogFooter>
                                   <Button variant="outline" onClick={() => setModalReprovacaoOpen(false)}>Cancelar</Button>
                                   <Button 
                                      variant="destructive" 
                                      onClick={() => handleFinalizar('reprovado')}
                                      disabled={observacao.length < 5}
                                   >
                                      Confirmar Reprovação
                                   </Button>
                                </DialogFooter>
                             </DialogContent>
                          </Dialog>

                          {/* Botão APROVAR */}
                          <Button 
                             className="h-16 text-lg font-bold bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20"
                             onClick={() => handleFinalizar('aprovado')}
                             disabled={Object.keys(checklist).length < ITENS_QUALIDADE.length} // Opcional: só libera se marcar tudo
                          >
                             <ThumbsUp className="w-6 h-6 mr-2" /> APROVAR
                          </Button>
                       </div>
                    </CardContent>
                 </Card>
              </div>

           </div>
        )}
      </div>
    </RoleGuard>
  );
}