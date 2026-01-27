"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  ClipboardCheck, CheckCircle2, AlertTriangle, User, RotateCcw, AlertOctagon, ArrowRight, PauseCircle, Timer, Wrench
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { registrarLog } from "@/lib/logger";

const calcularPerformance = (inicio: string, fim: string) => {
    if(!inicio || !fim) return "N/A";
    const diff = new Date(fim).getTime() - new Date(inicio).getTime();
    const minutos = Math.floor(diff / 60000); 
    const segundos = Math.floor((diff % 60000) / 1000);
    return `${minutos}m ${segundos}s`;
}

export default function QualidadePage() {
  const [loading, setLoading] = useState(true);
  const [listaAnalise, setListaAnalise] = useState<any[]>([]);
  const [listaReparo, setListaReparo] = useState<any[]>([]);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [acaoDecisao, setAcaoDecisao] = useState<'retrabalho' | 'avaria' | null>(null);
  const [motoSelecionada, setMotoSelecionada] = useState<any>(null);
  
  const [tipoAvaria, setTipoAvaria] = useState("");
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    fetchMotos();
    const interval = setInterval(fetchMotos, 15000);
    return () => clearInterval(interval);
  }, []);

  async function fetchMotos() {
    setLoading(true);
    
    // Agora buscamos também o 'rework_count'
    const { data: analise, error: err1 } = await supabase
      .from('motos')
      .select(`
        *,
        montador:funcionarios!motos_montador_id_fkey(nome),
        pausas:pausas_producao(id) 
      `)
      .eq('status', 'em_analise')
      .order('fim_montagem', { ascending: true });

    if (err1) console.error("Erro busca análise:", err1);

    const { data: reparo, error: err2 } = await supabase
      .from('motos')
      .select(`
        *,
        montador:funcionarios!motos_montador_id_fkey(nome),
        supervisor:funcionarios!motos_supervisor_id_fkey(nome)
      `)
      .in('status', ['avaria_mecanica', 'avaria_pintura', 'avaria_estrutura', 'avaria_pecas'])
      .order('updated_at', { ascending: false });

    if (err2) console.error("Erro busca reparo:", err2);

    if (analise) setListaAnalise(analise);
    if (reparo) setListaReparo(reparo);
    setLoading(false);
  }

  const handleAprovar = async (moto: any) => {
    const userStr = localStorage.getItem('sgm_user');
    const user = userStr ? JSON.parse(userStr) : null;

    if (!confirm(`Confirmar aprovação da moto ${moto.sku}?`)) return;

    const { error } = await supabase
      .from('motos')
      .update({
        status: 'aprovado',
        supervisor_id: user?.id, 
        updated_at: new Date().toISOString()
      })
      .eq('id', moto.id);

    if (error) {
        toast.error("Erro ao aprovar.");
    } else {
      toast.success("Moto Aprovada e Assinada!");
      await registrarLog('APROVACAO_QA', moto.sku, { 
          supervisor: user?.nome, 
          montador_origem: moto.montador?.nome 
      });
      fetchMotos();
    }
  };

  const abrirModal = (moto: any, tipo: 'retrabalho' | 'avaria') => {
    setMotoSelecionada(moto);
    setAcaoDecisao(tipo);
    setTipoAvaria(""); 
    setObservacao(""); 
    setModalOpen(true);
  };

  const handleConfirmarDecisao = async () => {
    const userStr = localStorage.getItem('sgm_user');
    const user = userStr ? JSON.parse(userStr) : null;
    
    if (!observacao) return toast.warning("Descreva o problema obrigatóriamente.");

    let payload: any = {
        supervisor_id: user?.id,
        updated_at: new Date().toISOString()
    };

    if (acaoDecisao === 'retrabalho') {
        payload.status = 'retrabalho_montagem';
        payload.observacoes = `RETRABALHO (Por ${user?.nome.split(' ')[0]}): ${observacao}`;
        // LÓGICA DE INCREMENTO DE RETRABALHO
        const currentCount = motoSelecionada.rework_count || 0;
        payload.rework_count = currentCount + 1; // Incrementa +1
    } else {
        if (!tipoAvaria) return toast.warning("Selecione o tipo de avaria.");
        payload.status = tipoAvaria;
        payload.detalhes_avaria = observacao;
    }

    const { error } = await supabase
      .from('motos')
      .update(payload)
      .eq('id', motoSelecionada.id);

    if (error) {
        toast.error("Erro ao processar.");
    } else {
        toast.success(acaoDecisao === 'retrabalho' ? "Devolvida ao Montador!" : "Enviada para Oficina!");
        
        await registrarLog(acaoDecisao === 'retrabalho' ? 'RETRABALHO_QA' : 'REPROVACAO_QA', motoSelecionada.sku, { 
            motivo: observacao,
            supervisor_responsavel: user?.nome,
            contador_atual: payload.rework_count
        });

        setModalOpen(false);
        fetchMotos();
    }
  };

  const handleRetornarAnalise = async (id: string) => {
    const { error } = await supabase
        .from('motos')
        .update({ status: 'em_analise', detalhes_avaria: null }) 
        .eq('id', id);
    
    if(!error) { 
        toast.success("Retornada para inspeção."); 
        fetchMotos(); 
    }
  };

  return (
    <RoleGuard allowedRoles={['supervisor', 'gestor', 'master']}>
      <div className="space-y-6 animate-in fade-in pb-20">
        <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
               <ClipboardCheck className="w-8 h-8 text-purple-600" /> Controle de Qualidade
            </h1>
            <p className="text-slate-500">Validação técnica e assinatura digital de conformidade.</p>
          </div>
        </div>

        <Tabs defaultValue="analise" className="w-full">
            <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
                <TabsTrigger value="analise">Aguardando Inspeção ({listaAnalise.length})</TabsTrigger>
                <TabsTrigger value="reparo">Oficina / Avarias ({listaReparo.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="analise" className="mt-6 space-y-4">
                {loading ? <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full" />)}</div> : 
                listaAnalise.length === 0 ? (
                    <div className="text-center py-20 text-slate-400 border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-800">
                        <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-20"/>
                        <p>Linha limpa! Nenhuma moto aguardando validação.</p>
                    </div>
                ) : (
                    listaAnalise.map((moto) => (
                        <Card key={moto.id} className="border-l-4 border-l-blue-500 hover:shadow-md transition-all bg-white dark:bg-slate-900 border-y border-r border-slate-200 dark:border-slate-800 group">
                            <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                                <div className="flex-1 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-blue-600 border-blue-200 font-mono tracking-wider">{moto.sku}</Badge>
                                        <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">{moto.modelo}</Badge>
                                    </div>
                                    <div className="flex flex-wrap gap-4 items-center">
                                        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950/50 w-fit px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                                            <User className="w-4 h-4 text-slate-400" />
                                            <span className="text-xs text-slate-500 uppercase font-bold">Montador:</span>
                                            <span className="text-sm font-bold text-slate-900 dark:text-white">{moto.montador?.nome || 'Não Identificado'}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 text-xs font-medium bg-blue-50 dark:bg-blue-900/10 px-2 py-1 rounded border border-blue-100 dark:border-blue-900/20">
                                                <Timer className="w-3.5 h-3.5" />
                                                <span>Tempo: {calcularPerformance(moto.inicio_montagem, moto.fim_montagem)}</span>
                                            </div>
                                            {/* Indicador Visual de Retrabalhos Já Ocorridos */}
                                            {moto.rework_count > 0 && (
                                                <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 text-xs font-bold bg-red-50 dark:bg-red-900/10 px-2 py-1 rounded border border-red-100 dark:border-red-900/20">
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                    <span>{moto.rework_count}ª Devolução</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {moto.observacoes && moto.observacoes.includes('RETRABALHO') && (
                                        <p className="text-xs text-amber-600 font-bold flex items-center gap-1">
                                            <RotateCcw className="w-3 h-3" /> Moto retornou de retrabalho
                                        </p>
                                    )}
                                </div>
                                <div className="flex gap-2 w-full md:w-auto">
                                    <Button variant="outline" className="flex-1 md:flex-none text-amber-600 border-amber-200 hover:bg-amber-50 dark:border-amber-900/50 dark:hover:bg-amber-900/20" onClick={() => abrirModal(moto, 'retrabalho')}>
                                        <RotateCcw className="w-4 h-4 mr-2" /> Retrabalho
                                    </Button>
                                    <Button variant="outline" className="flex-1 md:flex-none text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20" onClick={() => abrirModal(moto, 'avaria')}>
                                        <AlertTriangle className="w-4 h-4 mr-2" /> Defeito
                                    </Button>
                                    <Button className="flex-[2] md:flex-none bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20" onClick={() => handleAprovar(moto)}>
                                        <CheckCircle2 className="w-4 h-4 mr-2" /> APROVAR
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </TabsContent>

            <TabsContent value="reparo" className="mt-6 space-y-4">
                {listaReparo.map((moto) => (
                    <Card key={moto.id} className="border-l-4 border-l-red-500 bg-red-50/30 dark:bg-red-900/10 border-y border-r border-slate-200 dark:border-slate-800">
                        <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="space-y-2">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{moto.modelo}</h3>
                                <div className="mt-2 text-sm text-red-600 font-bold flex items-center gap-2 uppercase tracking-wide">
                                    <AlertOctagon className="w-4 h-4" /> 
                                    {moto.status.replace('avaria_', 'Falha em ')}
                                </div>
                                <div className="bg-white/50 dark:bg-black/20 p-2 rounded border border-red-100 dark:border-red-900/30">
                                    <p className="text-sm text-slate-700 dark:text-slate-300 italic">"{moto.detalhes_avaria}"</p>
                                </div>
                            </div>
                            <Button onClick={() => handleRetornarAnalise(moto.id)} variant="secondary" className="whitespace-nowrap">
                                <Wrench className="w-4 h-4 mr-2" /> Reparo Concluído
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </TabsContent>
        </Tabs>

        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
            <DialogContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{acaoDecisao === 'retrabalho' ? 'Solicitar Retrabalho' : 'Reportar Avaria'}</DialogTitle>
                    <DialogDescription>
                        {acaoDecisao === 'retrabalho' ? 'Isso contará como uma falha de montagem no perfil do montador.' : 'A moto será segregada para a oficina.'}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    {acaoDecisao === 'avaria' && (
                        <Select value={tipoAvaria} onValueChange={setTipoAvaria}>
                            <SelectTrigger><SelectValue placeholder="Tipo de Defeito" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="avaria_mecanica">🔧 Mecânica</SelectItem>
                                <SelectItem value="avaria_pintura">🎨 Pintura</SelectItem>
                                <SelectItem value="avaria_estrutura">🏗️ Estrutura</SelectItem>
                                <SelectItem value="avaria_pecas">⚙️ Peças Faltantes</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                    <Input value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Descreva o problema..." className="h-11" />
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
                    <Button className={acaoDecisao === 'retrabalho' ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'} onClick={handleConfirmarDecisao}>
                        Confirmar <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}