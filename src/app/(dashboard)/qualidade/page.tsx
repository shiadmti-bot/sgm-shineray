"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  ClipboardCheck, CheckCircle2, User, RotateCcw, 
  Wrench, PaintBucket, Armchair, Clock, Calendar, Timer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  
  // Modais de Decisão
  const [modalDecisaoOpen, setModalDecisaoOpen] = useState(false);
  const [acaoDecisao, setAcaoDecisao] = useState<'retrabalho' | 'avaria' | null>(null);
  const [motoSelecionada, setMotoSelecionada] = useState<any>(null);
  const [tipoAvaria, setTipoAvaria] = useState("");
  const [observacaoQA, setObservacaoQA] = useState("");

  useEffect(() => {
    fetchMotos();
    const interval = setInterval(fetchMotos, 5000); // Polling rápido
    return () => clearInterval(interval);
  }, []);

  async function fetchMotos() {
    setLoading(true);
    // Busca apenas o que está aguardando inspeção
    const { data } = await supabase
      .from('motos')
      .select(`*, montador:funcionarios!motos_montador_id_fkey(nome)`)
      .eq('status', 'em_analise')
      .order('fim_montagem', { ascending: true }); // FIFO (Primeira que entra é a primeira a ser inspecionada)

    if (data) setListaAnalise(data);
    setLoading(false);
  }

  // --- AÇÃO 1: APROVAR (Manda para Etiquetagem) ---
  const handleAprovar = async (moto: any) => {
    if (!confirm(`Aprovar montagem da ${moto.modelo}?`)) return;
    const user = JSON.parse(localStorage.getItem('sgm_user') || '{}');

    const { error } = await supabase.from('motos').update({
        status: 'aguardando_etiqueta', 
        localizacao: 'Pátio Montada (Aguardando Etiqueta)',
        supervisor_id: user.id,
        updated_at: new Date().toISOString()
    }).eq('id', moto.id);

    if(error) toast.error("Erro ao aprovar");
    else {
        toast.success("Aprovada! Enviada para Etiquetagem.");
        await registrarLog('APROVACAO_QA', moto.sku, { supervisor: user.nome });
        fetchMotos();
    }
  };

  // --- AÇÃO 2: REPROVAR OU RETRABALHO ---
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
        // Devolve para a linha (Montador vê card vermelho)
        payload.status = 'retrabalho_montagem';
        payload.observacoes = `RETRABALHO: ${observacaoQA}`;
        payload.localizacao = motoSelecionada.montador ? `Box ${motoSelecionada.montador.nome.split(' ')[0]}` : 'Linha de Montagem';
        payload.rework_count = (motoSelecionada.rework_count || 0) + 1;
        await registrarLog('RETRABALHO_QA', motoSelecionada.sku, { motivo: observacaoQA });
    } else {
        // Manda para Pátio de Avarias (Página nova)
        if (!tipoAvaria) return toast.warning("Selecione o defeito.");
        payload.status = tipoAvaria; 
        payload.detalhes_avaria = observacaoQA;
        payload.localizacao = 'Pátio de Avarias'; 
        
        // Cria Histórico
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
    toast.success(acaoDecisao === 'retrabalho' ? "Devolvida para Montador" : "Segregada para Pátio de Avarias");
    setModalDecisaoOpen(false);
    fetchMotos();
  };

  return (
    <RoleGuard allowedRoles={['supervisor', 'gestor', 'master']}>
      <div className="space-y-6 animate-in fade-in pb-20">
        
        <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
               <ClipboardCheck className="w-8 h-8 text-purple-600" /> Inspeção de Qualidade
            </h1>
            <p className="text-slate-500">Validação final de montagem antes da etiquetagem.</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 px-4 py-2 rounded-lg text-sm font-bold">
            {listaAnalise.length} moto(s) na fila
          </div>
        </div>

        <div className="space-y-4">
            {loading && <div className="space-y-4">{[1,2].map(i => <Skeleton key={i} className="h-48 w-full" />)}</div>}
            
            {!loading && listaAnalise.length === 0 && (
                <div className="text-center py-20 text-slate-400 border-2 border-dashed rounded-xl bg-slate-50 dark:bg-slate-900/50">
                    <CheckCircle2 className="w-16 h-16 mx-auto mb-4 opacity-20"/>
                    <h2 className="text-xl font-bold text-slate-500">Linha Limpa!</h2>
                    <p>Nenhuma moto aguardando validação no momento.</p>
                </div>
            )}

            {listaAnalise.map((moto) => (
                <Card key={moto.id} className="border-l-4 border-l-purple-500 shadow-md hover:shadow-lg transition-all overflow-hidden bg-white dark:bg-slate-900">
                    <CardContent className="p-0">
                        {/* Header do Card */}
                        <div className="bg-slate-50 dark:bg-slate-950 p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap justify-between items-center gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="font-mono bg-white dark:bg-slate-800 text-sm px-3 py-1 border-purple-200">{moto.sku}</Badge>
                                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0">{moto.ano}</Badge>
                                </div>
                                <h3 className="font-black text-2xl text-slate-900 dark:text-white mt-2">{moto.modelo}</h3>
                            </div>
                            <div className="text-right">
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Montagem Finalizada em</div>
                                <div className="text-sm font-medium flex items-center gap-2 justify-end text-slate-700 dark:text-slate-300">
                                    <Calendar className="w-4 h-4"/> {new Date(moto.fim_montagem).toLocaleDateString()}
                                    <span className="opacity-30">|</span>
                                    <Clock className="w-4 h-4"/> {new Date(moto.fim_montagem).toLocaleTimeString()}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 flex flex-col xl:flex-row gap-6">
                            {/* Coluna 1: Dados Visuais da Moto */}
                            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-6">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><PaintBucket className="w-3 h-3"/> Carenagem</p>
                                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                                        <div className="w-4 h-4 rounded-full border border-slate-300 shadow-sm" style={{backgroundColor: moto.cor === 'Preta' ? '#000' : moto.cor === 'Vermelha' ? '#ef4444' : moto.cor === 'Branca' ? '#fff' : moto.cor === 'Azul' ? '#3b82f6' : '#94a3b8'}}></div>
                                        <span className="font-bold text-sm">{moto.cor || 'N/A'}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Armchair className="w-3 h-3"/> Banco</p>
                                    <div className="bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                                        <span className="font-bold text-sm">{moto.cor_banco || 'N/A'}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><User className="w-3 h-3"/> Montador</p>
                                    <div className="bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700 truncate">
                                        <span className="font-bold text-sm text-slate-900 dark:text-white">{moto.montador?.nome.split(' ')[0] || 'Desc.'}</span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Timer className="w-3 h-3"/> Tempo</p>
                                    <div className="bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                                        <span className="font-mono text-sm font-bold">
                                            {calcularDuracao(moto.inicio_montagem, moto.fim_montagem)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Coluna 2: Status e Histórico */}
                            <div className="flex-1 xl:max-w-xs border-l border-slate-100 dark:border-slate-800 pl-0 xl:pl-6 flex flex-col justify-center gap-3">
                                {moto.rework_count > 0 ? (
                                    <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs p-3 rounded-lg border border-amber-200 dark:border-amber-800 flex items-center gap-3">
                                        <RotateCcw className="w-5 h-5"/> 
                                        <div>
                                            <p className="font-bold uppercase">Atenção: Retrabalho</p>
                                            <p>Esta moto já voltou {moto.rework_count}x para a linha.</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs p-3 rounded-lg border border-green-200 dark:border-green-800 flex items-center gap-3">
                                        <CheckCircle2 className="w-5 h-5"/>
                                        <div>
                                            <p className="font-bold uppercase">Primeira Passagem</p>
                                            <p>Nenhum erro registrado até agora.</p>
                                        </div>
                                    </div>
                                )}

                                {moto.tecnico_reparo && (
                                    <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-xs p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                                        <div className="flex items-center gap-2 font-bold mb-1"><Wrench className="w-3 h-3"/> Histórico de Oficina</div>
                                        <p>Consertado por: <strong>{moto.tecnico_reparo}</strong></p>
                                        <p className="italic opacity-80 mt-1">"{moto.observacoes?.split(':').pop()?.trim()}"</p>
                                    </div>
                                )}
                            </div>

                            {/* Coluna 3: Ações */}
                            <div className="flex flex-col gap-3 justify-center min-w-[180px]">
                                <Button 
                                    className="bg-green-600 hover:bg-green-700 h-14 w-full font-black text-lg shadow-lg shadow-green-600/20 transition-all hover:scale-[1.02]" 
                                    onClick={() => handleAprovar(moto)}
                                >
                                    <CheckCircle2 className="w-6 h-6 mr-2"/> APROVAR
                                </Button>
                                <div className="grid grid-cols-2 gap-3">
                                    <Button variant="outline" size="sm" className="h-10 text-amber-600 border-amber-200 hover:bg-amber-50 dark:border-amber-900 dark:hover:bg-amber-900/20" onClick={() => abrirModalQA(moto, 'retrabalho')}>
                                        Retrabalho
                                    </Button>
                                    <Button variant="destructive" size="sm" className="h-10 shadow-red-600/10" onClick={() => abrirModalQA(moto, 'avaria')}>
                                        Reprovar
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>

        {/* MODAL DECISÃO QA */}
        <Dialog open={modalDecisaoOpen} onOpenChange={setModalDecisaoOpen}>
            <DialogContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                <DialogHeader>
                    <DialogTitle className={acaoDecisao === 'retrabalho' ? 'text-amber-600' : 'text-red-600'}>
                        {acaoDecisao === 'retrabalho' ? 'Devolver para Montador (Retrabalho)' : 'Segregar para Pátio de Avarias'}
                    </DialogTitle>
                    <DialogDescription>
                        {acaoDecisao === 'retrabalho' 
                            ? 'A moto voltará para a lista do montador com prioridade alta.' 
                            : 'A moto será removida do fluxo e enviada para manutenção.'}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    {acaoDecisao === 'avaria' && (
                        <div className="space-y-2">
                            <label className="text-sm font-bold">Tipo de Falha</label>
                            <Select onValueChange={setTipoAvaria} value={tipoAvaria}>
                                <SelectTrigger><SelectValue placeholder="Selecione..."/></SelectTrigger>
                                <SelectContent>
                                     <SelectItem value="avaria_mecanica">🔧 Mecânica / Motor</SelectItem>
                                     <SelectItem value="avaria_pintura">🎨 Pintura / Carenagem</SelectItem>
                                     <SelectItem value="avaria_estrutura">🏗️ Estrutura / Chassi</SelectItem>
                                     <SelectItem value="avaria_pecas">⚙️ Peças Faltantes</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="space-y-2">
                        <label className="text-sm font-bold">Descrição do Problema</label>
                        <Input 
                            placeholder={acaoDecisao === 'retrabalho' ? "O que precisa ser corrigido?" : "Detalhe o defeito encontrado..."} 
                            value={observacaoQA} 
                            onChange={e => setObservacaoQA(e.target.value)} 
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setModalDecisaoOpen(false)}>Cancelar</Button>
                    <Button onClick={confirmarDecisaoQA} className={acaoDecisao === 'retrabalho' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'}>
                        Confirmar Decisão
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

      </div>
    </RoleGuard>
  );
}