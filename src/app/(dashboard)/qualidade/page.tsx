"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  ClipboardCheck, CheckCircle2, User, RotateCcw, 
  Wrench, PaintBucket, Armchair, Clock, Calendar, Timer, AlertTriangle, Loader2, Hourglass
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { registrarLog } from "@/lib/logger";
import { getUsuarioLogado } from "@/lib/auth";
import { useConfigGeral } from "@/lib/config-sistema";
import { TIPOS_AVARIA, getHexColor as corHex } from "@/lib/constantes";
import { formatarDuracaoMin, minutosDesde } from "@/lib/datas";

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
  const { config } = useConfigGeral();
  const getHexColor = (nome: string) => corHex(nome, [config.coresCarenagem, config.coresBanco]);
  const [loading, setLoading] = useState(true);
  const [listaAnalise, setListaAnalise] = useState<any[]>([]);
  const [salvandoDecisao, setSalvandoDecisao] = useState(false);
  const [, setRelogio] = useState(0);
  
  // Modais de Decisão
  const [modalDecisaoOpen, setModalDecisaoOpen] = useState(false);
  const [acaoDecisao, setAcaoDecisao] = useState<'retrabalho' | 'avaria' | null>(null);
  const [motoSelecionada, setMotoSelecionada] = useState<any>(null);
  const [tipoAvaria, setTipoAvaria] = useState("");
  const [observacaoQA, setObservacaoQA] = useState("");

  // Modal de Aprovação QoL
  const [motoAprovando, setMotoAprovando] = useState<any>(null);
  const [declaracaoQA, setDeclaracaoQA] = useState(false);
  const [aprovandoAcao, setAprovandoAcao] = useState(false);

  // Atualização silenciosa: o esqueleto de carregamento aparece só na primeira carga
  // (antes, a lista "piscava" a cada 5 segundos).
  const fetchMotos = useCallback(async () => {
    // Busca apenas o que está aguardando inspeção
    const { data, error } = await supabase
      .from('motos')
      .select(`*, montador:funcionarios!motos_montador_id_fkey(nome)`)
      .eq('status', 'em_analise')
      .order('fim_montagem', { ascending: true }); // FIFO (Primeira que entra é a primeira a ser inspecionada)

    if (error) console.error(error);
    else if (data) setListaAnalise(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMotos();
    const interval = setInterval(fetchMotos, 5000); // Polling rápido
    const relogio = setInterval(() => setRelogio(r => r + 1), 60000);
    return () => { clearInterval(interval); clearInterval(relogio); };
  }, [fetchMotos]);

  // --- AÇÃO 1: APROVAR (Manda para Etiquetagem) ---
  const handleAprovar = async (moto: any) => {
    setMotoAprovando(moto);
    setDeclaracaoQA(false);
    setAprovandoAcao(false);
  };

  const confirmarAprovarQA = async () => {
    if (!motoAprovando) return;
    if (!declaracaoQA) return toast.warning("Confirme a declaração de qualidade.");

    setAprovandoAcao(true);
    const user = getUsuarioLogado();

    try {
      const { data, error } = await supabase.from('motos').update({
          status: 'aguardando_etiqueta', 
          localizacao: 'Pátio Montada (Aguardando Etiqueta)',
          supervisor_id: user?.id,
          updated_at: new Date().toISOString()
      })
      .eq('id', motoAprovando.id)
      .eq('status', 'em_analise') // outra estação pode ter decidido antes
      .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        toast.warning("Esta moto já foi inspecionada por outra pessoa.");
        setMotoAprovando(null);
        fetchMotos();
        return;
      }

      toast.success("Aprovada! Enviada para Etiquetagem.");
      await registrarLog('APROVACAO_QA', motoAprovando.sku, { supervisor: user?.nome, retrabalhos: motoAprovando.rework_count || 0, reparada: !!motoAprovando.tecnico_reparo });
      setMotoAprovando(null);
      fetchMotos();
    } catch (err: any) {
      console.error("Erro ao aprovar:", err);
      toast.error("Erro ao aprovar a moto.");
    } finally {
      setAprovandoAcao(false);
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
    const user = getUsuarioLogado();
    const descricao = observacaoQA.trim();
    if (!descricao) return toast.warning("Observação obrigatória");
    if (acaoDecisao === 'avaria' && !tipoAvaria) return toast.warning("Selecione o defeito.");
    if (salvandoDecisao) return;
    setSalvandoDecisao(true);

    const payload: Record<string, unknown> = { supervisor_id: user?.id, updated_at: new Date().toISOString() };

    if (acaoDecisao === 'retrabalho') {
        // Devolve para a linha (Montador vê card vermelho)
        payload.status = 'retrabalho_montagem';
        payload.observacoes = `RETRABALHO: ${descricao}`;
        payload.localizacao = motoSelecionada.montador ? `Box ${motoSelecionada.montador.nome.split(' ')[0]}` : 'Linha de Montagem';
        payload.rework_count = (motoSelecionada.rework_count || 0) + 1;
    } else {
        // Manda para Pátio de Avarias
        payload.status = tipoAvaria; 
        payload.detalhes_avaria = descricao;
        payload.localizacao = 'Pátio de Avarias'; 
    }

    try {
        // 1. Atualiza a moto (somente se ainda estiver em inspeção)
        const { data, error } = await supabase.from('motos').update(payload)
          .eq('id', motoSelecionada.id)
          .eq('status', 'em_analise')
          .select('id');
        if (error) throw error;
        if (!data || data.length === 0) {
            toast.warning("Esta moto já foi inspecionada por outra pessoa.");
            setModalDecisaoOpen(false);
            fetchMotos();
            return;
        }

        // 2. Histórico e auditoria
        if (acaoDecisao === 'retrabalho') {
            await registrarLog('RETRABALHO_QA', motoSelecionada.sku, { motivo: descricao, tentativa: payload.rework_count });
        } else {
            const { error: erroHistorico } = await supabase.from('historico_avarias').insert({
                moto_id: motoSelecionada.id,
                sku: motoSelecionada.sku,
                modelo: motoSelecionada.modelo,
                cor: motoSelecionada.cor,
                cor_banco: motoSelecionada.cor_banco,
                tipo_avaria: tipoAvaria,
                descricao_problema: descricao,
                supervisor_id: user?.id,
                status_ticket: 'pendente',
                data_reporte: new Date().toISOString()
            });
            if (erroHistorico) {
                console.error(erroHistorico);
                toast.warning("Moto segregada, mas o histórico de avaria não foi gravado.");
            }
            await registrarLog('REPROVACAO_QA', motoSelecionada.sku, { motivo: descricao, tipo: tipoAvaria });
        }

        toast.success(acaoDecisao === 'retrabalho' ? "Devolvida para Montador" : "Segregada para Pátio de Avarias");
        setModalDecisaoOpen(false);
        fetchMotos();
    } catch (err) {
        console.error(err);
        toast.error("Erro ao registrar a decisão. Tente novamente.");
    } finally {
        setSalvandoDecisao(false);
    }
  };

  const totalFila = listaAnalise.length;
  const totalPrimeiraPassagem = listaAnalise.filter(m => !m.rework_count && !m.tecnico_reparo).length;
  const totalRetorno = totalFila - totalPrimeiraPassagem;

  const getBorderColor = (moto: any) => {
    const hasRework = (moto.rework_count || 0) > 0;
    const hasRepair = !!moto.tecnico_reparo;
    if (hasRework && hasRepair) return "border-l-indigo-600";
    if (hasRework) return "border-l-amber-500";
    if (hasRepair) return "border-l-blue-500";
    return "border-l-green-500";
  };

  return (
    <RoleGuard allowedRoles={['supervisor', 'gestor', 'master']}>
      <div className="space-y-6 animate-in fade-in pb-20">
        
        {/* Banner com Gradiente e Infos */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-800 dark:from-purple-950 dark:to-indigo-950 text-white p-6 rounded-2xl relative overflow-hidden shadow-lg border border-purple-500/10">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:16px_16px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
          <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-4 z-10">
            <div>
              <span className="text-[10px] bg-purple-500/30 text-purple-100 border border-purple-400/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                   Controle de Qualidade
              </span>
              <h1 className="text-3xl font-black mt-1.5 flex items-center gap-2">
                 <ClipboardCheck className="w-8 h-8 text-purple-100" /> Inspeção de Qualidade
              </h1>
              <p className="text-sm text-purple-200/90 mt-1">Validação final de montagem antes do envio ao estoque principal.</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl text-center border border-white/15">
              <span className="block text-[10px] font-black text-purple-200 uppercase tracking-wider">Fila de Espera</span>
              <span className="text-2xl font-black">{totalFila} moto(s)</span>
            </div>
          </div>
        </div>

        {/* Cards de Métricas da Fila */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-l-4 border-l-purple-500 shadow-md bg-white dark:bg-slate-900 overflow-hidden relative group hover:shadow-lg transition-all border-slate-200 dark:border-slate-800">
                <CardContent className="p-5 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Total na Fila</p>
                        <p className="text-3xl font-black text-slate-900 dark:text-white mt-1.5">{totalFila}</p>
                    </div>
                    <div className="p-3 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-xl group-hover:scale-110 transition-transform">
                        <ClipboardCheck className="w-6 h-6"/>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-l-4 border-l-green-500 shadow-md bg-white dark:bg-slate-900 overflow-hidden relative group hover:shadow-lg transition-all border-slate-200 dark:border-slate-800">
                <CardContent className="p-5 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Aguardando 1ª Passagem</p>
                        <p className="text-3xl font-black text-green-600 dark:text-green-400 mt-1.5">{totalPrimeiraPassagem}</p>
                    </div>
                    <div className="p-3 bg-green-500/10 text-green-600 dark:text-green-400 rounded-xl group-hover:scale-110 transition-transform">
                        <CheckCircle2 className="w-6 h-6"/>
                    </div>
                </CardContent>
            </Card>

            <Card className={`border-l-4 ${totalRetorno > 0 ? 'border-l-amber-500 bg-amber-500/5' : 'border-l-slate-300'} shadow-md bg-white dark:bg-slate-900 overflow-hidden relative group hover:shadow-lg transition-all border-slate-200 dark:border-slate-800`}>
                <CardContent className="p-5 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Reinspeções (Urgente)</p>
                        <p className={`text-3xl font-black mt-1.5 ${totalRetorno > 0 ? 'text-amber-600' : 'text-slate-900 dark:text-white'}`}>{totalRetorno}</p>
                    </div>
                    <div className={`p-3 rounded-xl group-hover:scale-110 transition-transform ${totalRetorno > 0 ? 'bg-amber-500/10 text-amber-600' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'}`}>
                        <RotateCcw className="w-6 h-6"/>
                    </div>
                </CardContent>
            </Card>
        </div>

        {/* Fila de Cards */}
        <div className="space-y-5">
            {loading && (
                <div className="space-y-4">
                     {[1, 2].map(i => <Skeleton key={i} className="h-44 w-full rounded-2xl" />)}
                </div>
            )}
            
            {!loading && listaAnalise.length === 0 && (
                <div className="text-center py-24 text-slate-400 border-2 border-dashed rounded-2xl bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800">
                    <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-500/60 animate-bounce"/>
                    <h2 className="text-xl font-black text-slate-700 dark:text-slate-300">Fila Limpa!</h2>
                    <p className="text-sm text-slate-500 mt-1">Nenhum veículo aguardando inspeção de qualidade no momento.</p>
                </div>
            )}

            {listaAnalise.map((moto) => {
                const temRework = (moto.rework_count || 0) > 0;
                const temReparo = !!moto.tecnico_reparo;

                return (
                    <Card key={moto.id} className={`border-l-4 ${getBorderColor(moto)} shadow-md hover:shadow-xl transition-all overflow-hidden bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800`}>
                        <CardContent className="p-0">
                            {/* Header do Card */}
                            <div className="bg-slate-50/80 dark:bg-slate-950/80 p-4 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap justify-between items-center gap-4">
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Badge variant="outline" className="font-mono bg-white dark:bg-slate-900 text-sm px-3 py-1 border-purple-200 text-slate-700 dark:text-slate-200">
                                             {moto.sku}
                                        </Badge>
                                        <Badge className="bg-blue-500/10 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-xs font-bold px-2 py-0.5">
                                             {moto.ano}
                                        </Badge>
                                        {temRework && (
                                             <Badge className="bg-amber-500/10 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-[10px] font-black uppercase tracking-wider">
                                                  RETRABALHO
                                             </Badge>
                                        )}
                                        {temReparo && (
                                             <Badge className="bg-blue-500/10 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-[10px] font-black uppercase tracking-wider">
                                                  RETORNO OFICINA
                                             </Badge>
                                        )}
                                    </div>
                                    <h3 className="font-black text-2xl text-slate-900 dark:text-white mt-2.5">{moto.modelo}</h3>
                                </div>
                                <div className="text-left sm:text-right">
                                    {(() => {
                                        const espera = minutosDesde(moto.fim_montagem);
                                        return (
                                            <div className={`text-[11px] font-bold flex items-center gap-1 sm:justify-end mb-1 ${espera >= 30 ? 'text-red-600' : espera >= 15 ? 'text-amber-600' : 'text-slate-400'}`}>
                                                <Hourglass className="w-3 h-3"/> Aguardando inspeção há {formatarDuracaoMin(espera)}
                                            </div>
                                        );
                                    })()}
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Finalizado na Montagem</div>
                                    <div className="text-sm font-bold flex items-center gap-2 justify-start sm:justify-end text-slate-700 dark:text-slate-300 mt-1">
                                        <Calendar className="w-4 h-4 text-slate-400"/> {new Date(moto.fim_montagem).toLocaleDateString()}
                                        <span className="opacity-30">|</span>
                                        <Clock className="w-4 h-4 text-slate-400"/> {new Date(moto.fim_montagem).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 flex flex-col xl:flex-row gap-6">
                                {/* Coluna 1: Dados Visuais da Moto */}
                                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-6">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                             <PaintBucket className="w-3.5 h-3.5 text-slate-400"/> Carenagem
                                        </p>
                                        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <div className="w-4 h-4 rounded-full border border-slate-300 shadow-sm shrink-0" style={{backgroundColor: getHexColor(moto.cor)}}></div>
                                            <span className="font-bold text-sm text-slate-700 dark:text-slate-200 capitalize">{moto.cor || 'N/A'}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                             <Armchair className="w-3.5 h-3.5 text-slate-400"/> Banco
                                        </p>
                                        <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <span className="font-bold text-sm text-slate-700 dark:text-slate-200 capitalize">{moto.cor_banco || 'N/A'}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                             <User className="w-3.5 h-3.5 text-slate-400"/> Montador
                                        </p>
                                        <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 truncate">
                                            <span className="font-bold text-sm text-slate-700 dark:text-slate-200">{moto.montador?.nome.split(' ')[0] || 'Desc.'}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                             <Timer className="w-3.5 h-3.5 text-slate-400"/> Tempo Montagem
                                        </p>
                                        <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <span className="font-mono text-sm font-bold text-slate-700 dark:text-slate-200">
                                                {calcularDuracao(moto.inicio_montagem, moto.fim_montagem)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Coluna 2: Status e Histórico Corrigidos */}
                                <div className="flex-1 xl:max-w-xs border-l border-slate-100 dark:border-slate-800 pl-0 xl:pl-6 flex flex-col justify-center gap-3">
                                    {!temRework && !temReparo ? (
                                        <div className="bg-green-500/5 text-green-800 dark:text-green-400 text-xs p-4 rounded-xl border border-green-500/10 flex items-start gap-3">
                                            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-green-600 dark:text-green-400"/>
                                            <div>
                                                <p className="font-black uppercase tracking-wider text-green-700 dark:text-green-400">1ª Passagem</p>
                                                <p className="text-slate-500 dark:text-slate-400 mt-0.5 leading-normal">Nenhum defeito ou retrabalho reportado até o momento.</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2.5">
                                            {temRework && (
                                                <div className="bg-amber-500/5 text-amber-800 dark:text-amber-300 text-xs p-3.5 rounded-xl border border-amber-500/10 flex items-start gap-3">
                                                    <RotateCcw className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"/>
                                                    <div>
                                                        <p className="font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">Linha: Retrabalho</p>
                                                        <p className="text-slate-600 dark:text-slate-400 mt-0.5">Retornou <strong className="font-bold text-slate-800 dark:text-slate-200">{moto.rework_count}x</strong> para correções na linha.</p>
                                                    </div>
                                                </div>
                                            )}
                                            {temReparo && (
                                                <div className="bg-blue-500/5 text-blue-800 dark:text-blue-300 text-xs p-3.5 rounded-xl border border-blue-500/10 flex items-start gap-3">
                                                    <Wrench className="w-5 h-5 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400"/>
                                                    <div>
                                                        <p className="font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">Pátio: Oficina</p>
                                                        <p className="text-slate-600 dark:text-slate-400 mt-0.5">Consertado por: <strong className="font-bold text-slate-800 dark:text-slate-200">{moto.tecnico_reparo}</strong></p>
                                                        <p className="italic opacity-80 mt-1 pl-2 border-l-2 border-blue-200 dark:border-blue-800 leading-normal">
                                                            &quot;{moto.observacoes?.split('):').pop()?.trim() || 'Avaria solucionada.'}&quot;
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Coluna 3: Ações */}
                                <div className="flex flex-col gap-3 justify-center min-w-[180px]">
                                    <Button 
                                        className="bg-green-600 hover:bg-green-700 text-white h-14 w-full font-black text-lg shadow-lg shadow-green-600/20 transition-all hover:scale-[1.02] rounded-xl" 
                                        onClick={() => handleAprovar(moto)}
                                    >
                                        <CheckCircle2 className="w-6 h-6 mr-2"/> APROVAR
                                    </Button>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Button variant="outline" size="sm" className="h-10 text-amber-600 border-amber-200 hover:bg-amber-50 dark:border-amber-900/40 dark:hover:bg-amber-950/20 font-bold rounded-xl" onClick={() => abrirModalQA(moto, 'retrabalho')}>
                                            Retrabalho
                                        </Button>
                                        <Button variant="destructive" size="sm" className="h-10 shadow-lg shadow-red-600/10 font-bold rounded-xl" onClick={() => abrirModalQA(moto, 'avaria')}>
                                            Reprovar
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>

        {/* MODAL DECISÃO QA */}
        <Dialog open={modalDecisaoOpen} onOpenChange={(o) => !salvandoDecisao && setModalDecisaoOpen(o)}>
            <DialogContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 max-w-md rounded-2xl shadow-2xl">
                <DialogHeader>
                    <DialogTitle className={`text-xl font-black flex items-center gap-2 ${acaoDecisao === 'retrabalho' ? 'text-amber-600' : 'text-red-600'}`}>
                        {acaoDecisao === 'retrabalho' ? <><RotateCcw className="w-5 h-5"/> Devolver para Montador</> : <><AlertTriangle className="w-5 h-5"/> Segregar para Pátio de Avarias</>}
                    </DialogTitle>
                    <DialogDescription className="text-sm mt-1">
                        {acaoDecisao === 'retrabalho' 
                            ? 'O veículo retornará com prioridade alta diretamente para a fila de produção do montador original.' 
                            : 'O veículo será retirado do fluxo operacional e direcionado para manutenção e reparos da oficina.'}
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-3">
                    {acaoDecisao === 'avaria' && (
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Tipo de Falha</label>
                            <Select onValueChange={setTipoAvaria} value={tipoAvaria}>
                                <SelectTrigger className="h-11 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800"><SelectValue placeholder="Selecione o tipo..."/></SelectTrigger>
                                <SelectContent>
                                     {TIPOS_AVARIA.map(t => <SelectItem key={t.valor} value={t.valor}>{t.emoji} {t.rotulo}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Descrição do Defeito</label>
                        <Textarea 
                            placeholder={acaoDecisao === 'retrabalho' ? "O que o montador precisa corrigir?" : "Detalhe o problema mecânico/visual encontrado..."} 
                            value={observacaoQA} 
                            onChange={e => setObservacaoQA(e.target.value)} 
                            rows={3}
                            maxLength={500}
                            className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                        />
                    </div>
                </div>
                
                <DialogFooter className="gap-2 sm:gap-0 mt-2">
                    <Button variant="ghost" onClick={() => setModalDecisaoOpen(false)} className="h-11 font-bold" disabled={salvandoDecisao}>Cancelar</Button>
                    <Button 
                         onClick={confirmarDecisaoQA} 
                         disabled={!observacaoQA.trim() || (acaoDecisao === 'avaria' && !tipoAvaria) || salvandoDecisao}
                         className={`h-11 font-bold ${acaoDecisao === 'retrabalho' ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-600/20' : 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20'}`}
                    >
                        {salvandoDecisao ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Salvando...</> : acaoDecisao === 'retrabalho' ? 'Devolver para Montador' : 'Confirmar Reprovação'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* MODAL DE APROVAÇÃO QA (Substitui confirm) */}
        <Dialog open={!!motoAprovando} onOpenChange={(open) => !open && setMotoAprovando(null)}>
            <DialogContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 max-w-md rounded-2xl shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black text-green-600 flex items-center gap-2">
                         <CheckCircle2 className="w-6 h-6"/> Confirmar Aprovação de Montagem
                    </DialogTitle>
                    <DialogDescription className="text-sm mt-1">
                         Esta ação enviará o veículo diretamente para a fila de Etiquetagem.
                    </DialogDescription>
                </DialogHeader>

                {motoAprovando && (
                    <div className="space-y-4 py-3">
                        <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                            <h4 className="font-black text-lg text-slate-800 dark:text-white leading-tight">{motoAprovando.modelo}</h4>
                            <p className="font-mono text-xs text-slate-500 mt-1 uppercase tracking-widest">{motoAprovando.sku}</p>
                        </div>

                        {/* Checklist de Validação */}
                        <label className="flex items-start gap-3 p-3.5 rounded-xl border border-green-500/10 bg-green-500/5 cursor-pointer select-none">
                            <input 
                                 type="checkbox"
                                 checked={declaracaoQA}
                                 onChange={(e) => setDeclaracaoQA(e.target.checked)}
                                 className="mt-1 w-4 h-4 rounded text-green-600 focus:ring-green-500 border-slate-300 dark:border-slate-700"
                            />
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 leading-normal">
                                 Declaro que inspecionei fisicamente o veículo e confirmo que a montagem atende a todos os critérios de qualidade estabelecidos.
                            </span>
                        </label>
                    </div>
                )}

                <DialogFooter className="gap-2 sm:gap-0 mt-2">
                    <Button variant="ghost" onClick={() => setMotoAprovando(null)} className="h-11 font-bold" disabled={aprovandoAcao}>Cancelar</Button>
                    <Button 
                         onClick={confirmarAprovarQA}
                         disabled={!declaracaoQA || aprovandoAcao}
                         className={`h-11 font-bold ${
                              declaracaoQA 
                                   ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20' 
                                   : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600'
                         }`}
                    >
                         {aprovandoAcao ? "Aprovando..." : "Sim, Aprovar Montagem"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

      </div>
    </RoleGuard>
  );
}