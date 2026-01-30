"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  ClipboardCheck, CheckCircle2, AlertTriangle, User, RotateCcw, AlertOctagon, 
  Wrench, PaintBucket, Armchair, ScanBarcode, Clock, Calendar, Timer
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

// Helper para calcular duração
const calcularDuracao = (inicio: string, fim: string) => {
    if (!inicio || !fim) return "N/A";
    const start = new Date(inicio).getTime();
    const end = new Date(fim).getTime();
    const diffMs = end - start;
    const diffMins = Math.floor(diffMs / 60000);
    return `${diffMins} min`;
};

export default function QualidadePage() {
  const [loading, setLoading] = useState(true);
  const [listaAnalise, setListaAnalise] = useState<any[]>([]);
  const [listaReparo, setListaReparo] = useState<any[]>([]);
  
  // Modais
  const [modalDecisaoOpen, setModalDecisaoOpen] = useState(false);
  const [modalReparoOpen, setModalReparoOpen] = useState(false);

  // Estados
  const [acaoDecisao, setAcaoDecisao] = useState<'retrabalho' | 'avaria' | null>(null);
  const [motoSelecionada, setMotoSelecionada] = useState<any>(null);
  const [tipoAvaria, setTipoAvaria] = useState("");
  const [observacaoQA, setObservacaoQA] = useState("");
  const [nomeTecnico, setNomeTecnico] = useState("");
  const [observacaoReparo, setObservacaoReparo] = useState("");

  useEffect(() => {
    fetchMotos();
    const interval = setInterval(fetchMotos, 10000);
    return () => clearInterval(interval);
  }, []);

  async function fetchMotos() {
    setLoading(true);
    
    const { data: analise } = await supabase
      .from('motos')
      .select(`*, montador:funcionarios!motos_montador_id_fkey(nome)`)
      .eq('status', 'em_analise')
      .order('fim_montagem', { ascending: true });

    const { data: reparo } = await supabase
      .from('motos')
      .select(`*, montador:funcionarios!motos_montador_id_fkey(nome)`)
      .like('status', 'avaria_%')
      .order('updated_at', { ascending: false });

    if (analise) setListaAnalise(analise);
    if (reparo) setListaReparo(reparo);
    setLoading(false);
  }

  const handleAprovar = async (moto: any) => {
    if (!confirm(`Aprovar ${moto.modelo}?`)) return;
    const user = JSON.parse(localStorage.getItem('sgm_user') || '{}');

    const { error } = await supabase.from('motos').update({
        status: 'aprovado',
        supervisor_id: user.id,
        localizacao: 'Pátio de Estoque',
        updated_at: new Date().toISOString()
    }).eq('id', moto.id);

    if(error) toast.error("Erro ao aprovar");
    else {
        toast.success("Aprovada!");
        await registrarLog('APROVACAO_QA', moto.sku, { supervisor: user.nome });
        fetchMotos();
    }
  };

  const abrirModalQA = (moto: any, tipo: 'retrabalho' | 'avaria') => {
    setMotoSelecionada(moto);
    setAcaoDecisao(tipo);
    setObservacaoQA("");
    setTipoAvaria("");
    setModalDecisaoOpen(true);
  };

  const confirmarDecisaoQA = async () => {
    const user = JSON.parse(localStorage.getItem('sgm_user') || '{}');
    if (!observacaoQA) return toast.warning("Observação obrigatória");

    let payload: any = { supervisor_id: user.id, updated_at: new Date().toISOString() };

    if (acaoDecisao === 'retrabalho') {
        payload.status = 'retrabalho_montagem';
        payload.observacoes = `RETRABALHO: ${observacaoQA}`;
        payload.localizacao = motoSelecionada.montador ? `Box ${motoSelecionada.montador.nome.split(' ')[0]}` : 'Linha de Montagem';
        payload.rework_count = (motoSelecionada.rework_count || 0) + 1;
        await registrarLog('RETRABALHO_QA', motoSelecionada.sku, { motivo: observacaoQA });
    } else {
        if (!tipoAvaria) return toast.warning("Selecione o defeito.");
        payload.status = tipoAvaria; 
        payload.detalhes_avaria = observacaoQA;
        payload.localizacao = 'Pátio de Avarias CD';
        
        await supabase.from('historico_avarias').insert({
            moto_id: motoSelecionada.id,
            sku: motoSelecionada.sku,
            modelo: motoSelecionada.modelo,
            cor: motoSelecionada.cor,
            cor_banco: motoSelecionada.cor_banco,
            tipo_avaria: tipoAvaria,
            descricao_problema: observacaoQA,
            supervisor_id: user.id,
            status_ticket: 'pendente',
            data_reporte: new Date().toISOString()
        });
        await registrarLog('REPROVACAO_QA', motoSelecionada.sku, { motivo: observacaoQA, tipo: tipoAvaria });
    }

    await supabase.from('motos').update(payload).eq('id', motoSelecionada.id);
    toast.success("Status atualizado!");
    setModalDecisaoOpen(false);
    fetchMotos();
  };

  const concluirReparo = async () => {
    if (!nomeTecnico || !observacaoReparo) return toast.warning("Preencha todos os campos.");

    await supabase.from('historico_avarias').update({
        tecnico_nome: nomeTecnico,
        descricao_solucao: observacaoReparo,
        data_resolucao: new Date().toISOString(),
        status_ticket: 'resolvido'
    }).eq('moto_id', motoSelecionada.id).eq('status_ticket', 'pendente');

    await supabase.from('motos').update({
        status: 'em_analise',
        localizacao: 'Pátio Qualidade (Retorno Oficina)',
        tecnico_reparo: nomeTecnico, 
        detalhes_avaria: null,
        observacoes: `REPARADO POR ${nomeTecnico}: ${observacaoReparo}`
    }).eq('id', motoSelecionada.id);

    await registrarLog('REPARO_OFICINA', motoSelecionada.sku, { tecnico: nomeTecnico });
    toast.success("Reparo registrado!");
    setModalReparoOpen(false);
    fetchMotos();
  };

  return (
    <RoleGuard allowedRoles={['supervisor', 'gestor', 'master']}>
      <div className="space-y-6 animate-in fade-in pb-20">
        
        <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
               <ClipboardCheck className="w-8 h-8 text-purple-600" /> Inspeção de Qualidade
            </h1>
            <p className="text-slate-500">Validação técnica detalhada.</p>
          </div>
        </div>

        <Tabs defaultValue="qa" className="w-full">
            <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
                <TabsTrigger value="qa">🔎 Inspeção ({listaAnalise.length})</TabsTrigger>
                <TabsTrigger value="oficina">🛠️ Oficina ({listaReparo.length})</TabsTrigger>
            </TabsList>

            {/* ABA 1: INSPEÇÃO QA (VISUAL DETALHADO) */}
            <TabsContent value="qa" className="mt-6 space-y-4">
                {loading && <div className="space-y-4">{[1,2].map(i => <Skeleton key={i} className="h-48 w-full" />)}</div>}
                
                {!loading && listaAnalise.length === 0 && (
                    <div className="text-center py-20 text-slate-400 border-2 border-dashed rounded-xl">
                        <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-20"/>
                        <p>Linha limpa! Nenhuma moto aguardando validação.</p>
                    </div>
                )}

                {listaAnalise.map((moto) => (
                    <Card key={moto.id} className="border-l-4 border-l-blue-500 shadow-md hover:shadow-lg transition-all overflow-hidden">
                        <CardContent className="p-0">
                            {/* Header do Card */}
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="font-mono bg-white dark:bg-slate-800">{moto.sku}</Badge>
                                        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0">{moto.ano}</Badge>
                                    </div>
                                    <h3 className="font-black text-xl text-slate-900 dark:text-white mt-1">{moto.modelo}</h3>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs font-bold text-slate-400 uppercase">Finalizado em</div>
                                    <div className="text-sm font-medium flex items-center gap-1 justify-end">
                                        <Calendar className="w-3 h-3"/> {new Date(moto.fim_montagem).toLocaleDateString()}
                                    </div>
                                    <div className="text-xs text-slate-500 flex items-center gap-1 justify-end">
                                        <Clock className="w-3 h-3"/> {new Date(moto.fim_montagem).toLocaleTimeString()}
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 flex flex-col md:flex-row gap-6">
                                {/* Coluna 1: Dados Visuais da Moto */}
                                <div className="flex-1 grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><PaintBucket className="w-3 h-3"/> Cor Carenagem</p>
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 rounded-full border border-slate-200" style={{backgroundColor: moto.cor === 'Preta' ? '#000' : moto.cor === 'Vermelha' ? '#ef4444' : moto.cor === 'Branca' ? '#fff' : '#94a3b8'}}></div>
                                            <span className="font-medium text-sm">{moto.cor || 'Não Inf.'}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><Armchair className="w-3 h-3"/> Cor Banco</p>
                                        <span className="font-medium text-sm">{moto.cor_banco || 'Não Inf.'}</span>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><User className="w-3 h-3"/> Montador</p>
                                        <span className="font-bold text-sm text-slate-900 dark:text-white">{moto.montador?.nome || 'Desconhecido'}</span>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><Timer className="w-3 h-3"/> Duração</p>
                                        <span className="font-mono text-sm bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                                            {calcularDuracao(moto.inicio_montagem, moto.fim_montagem)}
                                        </span>
                                    </div>
                                </div>

                                {/* Coluna 2: Status e Histórico */}
                                <div className="flex-1 border-l border-slate-100 dark:border-slate-800 pl-0 md:pl-6 flex flex-col justify-center gap-2">
                                    {moto.rework_count > 0 && (
                                        <div className="bg-amber-50 text-amber-700 text-xs p-2 rounded border border-amber-200 flex items-center gap-2">
                                            <RotateCcw className="w-4 h-4"/> 
                                            Este é o <strong>{moto.rework_count}º Retrabalho</strong> desta moto.
                                        </div>
                                    )}
                                    {moto.tecnico_reparo && (
                                        <div className="bg-green-50 text-green-800 text-xs p-2 rounded border border-green-200">
                                            <div className="flex items-center gap-2 font-bold mb-1"><Wrench className="w-3 h-3"/> Histórico de Oficina</div>
                                            <p>Consertado por: {moto.tecnico_reparo}</p>
                                            <p className="italic opacity-80">"{moto.observacoes?.split(':').pop()?.trim()}"</p>
                                        </div>
                                    )}
                                    {!moto.rework_count && !moto.tecnico_reparo && (
                                        <div className="text-center text-slate-400 text-xs italic">
                                            Nenhum problema anterior registrado.
                                        </div>
                                    )}
                                </div>

                                {/* Coluna 3: Ações */}
                                <div className="flex flex-col gap-2 justify-center min-w-[150px]">
                                    <Button className="bg-green-600 hover:bg-green-700 h-12 w-full font-bold shadow-lg shadow-green-600/20" onClick={() => handleAprovar(moto)}>
                                        <CheckCircle2 className="w-5 h-5 mr-2"/> APROVAR
                                    </Button>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button variant="outline" size="sm" className="text-amber-600 border-amber-200 hover:bg-amber-50" onClick={() => abrirModalQA(moto, 'retrabalho')}>
                                            Retrabalho
                                        </Button>
                                        <Button variant="destructive" size="sm" onClick={() => abrirModalQA(moto, 'avaria')}>
                                            Reprovar
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </TabsContent>

            {/* ABA 2: OFICINA (Visual Compacto) */}
            <TabsContent value="oficina" className="mt-6 space-y-4">
                {listaReparo.map((moto) => (
                    <Card key={moto.id} className="border-l-4 border-l-red-500 bg-red-50/10">
                        <CardContent className="p-6 flex flex-col md:flex-row justify-between items-center gap-4">
                            <div>
                                <h3 className="font-bold text-red-700 flex items-center gap-2">
                                    <AlertOctagon className="w-5 h-5"/> {moto.status.replace('avaria_', 'FALHA EM ').toUpperCase()}
                                </h3>
                                <p className="text-sm font-semibold">{moto.modelo} <span className="font-mono text-slate-400 ml-2">{moto.sku}</span></p>
                                <div className="text-xs text-slate-500 mt-1">Montador: {moto.montador?.nome}</div>
                                <div className="mt-2 bg-white/50 p-2 rounded text-sm italic text-slate-700 border border-red-100">"{moto.detalhes_avaria}"</div>
                            </div>
                            <Button onClick={() => { setMotoSelecionada(moto); setNomeTecnico(""); setObservacaoReparo(""); setModalReparoOpen(true); }} className="bg-slate-900 text-white">
                                <Wrench className="w-4 h-4 mr-2" /> REALIZAR REPARO
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </TabsContent>
        </Tabs>

        {/* MODAL DECISÃO QA */}
        <Dialog open={modalDecisaoOpen} onOpenChange={setModalDecisaoOpen}>
            <DialogContent className="bg-white dark:bg-slate-950">
                <DialogHeader>
                    <DialogTitle>{acaoDecisao === 'retrabalho' ? 'Devolver para Montador' : 'Enviar para Oficina'}</DialogTitle>
                    <DialogDescription>Descreva o problema encontrado.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    {acaoDecisao === 'avaria' && (
                        <Select onValueChange={setTipoAvaria} value={tipoAvaria}>
                            <SelectTrigger><SelectValue placeholder="Tipo de Falha"/></SelectTrigger>
                            <SelectContent>
                                 <SelectItem value="avaria_mecanica">Mecânica</SelectItem>
                                 <SelectItem value="avaria_pintura">Pintura</SelectItem>
                                 <SelectItem value="avaria_estrutura">Estrutura</SelectItem>
                                 <SelectItem value="avaria_pecas">Peças</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                    <Input placeholder="Detalhes do problema..." value={observacaoQA} onChange={e => setObservacaoQA(e.target.value)} />
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setModalDecisaoOpen(false)}>Cancelar</Button>
                    <Button onClick={confirmarDecisaoQA} className={acaoDecisao === 'retrabalho' ? 'bg-amber-600' : 'bg-red-600'}>Confirmar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* MODAL REPARO */}
        <Dialog open={modalReparoOpen} onOpenChange={setModalReparoOpen}>
            <DialogContent className="bg-white dark:bg-slate-950">
                <DialogHeader><DialogTitle>Registro de Manutenção</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                    <Input placeholder="Nome do Técnico" value={nomeTecnico} onChange={e => setNomeTecnico(e.target.value)} />
                    <Input placeholder="O que foi feito?" value={observacaoReparo} onChange={e => setObservacaoReparo(e.target.value)} />
                </div>
                <DialogFooter><Button onClick={concluirReparo} className="bg-green-600 hover:bg-green-700 w-full">Concluir</Button></DialogFooter>
            </DialogContent>
        </Dialog>

      </div>
    </RoleGuard>
  );
}