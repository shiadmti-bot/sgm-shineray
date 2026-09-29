"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  ClipboardCheck, CheckCircle2, User, RotateCcw, Wrench, PaintBucket, Armchair, Clock, Timer, AlertTriangle, Loader2, Hourglass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { registrarLog } from "@/lib/logger";
import { getUsuarioLogado } from "@/lib/auth";
import { FotosMoto } from "@/components/sgm/FotosMoto";
import { EmptyState } from "@/components/sgm/EmptyState";
import { Dica } from "@/components/sgm/Guia";
import { Led } from "@/components/sgm/Led";
import { PageHeader } from "@/components/sgm/PageHeader";
import { PlacaChassi } from "@/components/sgm/PlacaChassi";
import { StatCard } from "@/components/sgm/StatCard";
import { useConfigGeral } from "@/lib/config-sistema";
import { TIPOS_AVARIA, getHexColor as corHex } from "@/lib/constantes";
import { formatarDuracaoMin, minutosDesde } from "@/lib/datas";
import { cn } from "@/lib/utils";

// Helper para calcular duração
const calcularDuracao = (inicio?: string | null, fim?: string | null) => {
    if (!inicio || !fim) return "N/A";
    const start = new Date(inicio).getTime();
    const end = new Date(fim).getTime();
    const diffMs = end - start;
    const diffMins = Math.floor(diffMs / 60000);
    return `${diffMins} min`;
};


interface MotoQA {
  id: string;
  sku: string;
  modelo: string;
  ano?: string | null;
  cor?: string | null;
  cor_banco?: string | null;
  inicio_montagem?: string | null;
  fim_montagem?: string | null;
  rework_count?: number | null;
  tecnico_reparo?: string | null;
  observacoes?: string | null;
  montador?: { nome: string } | null;
}

export default function QualidadePage() {
  const { config } = useConfigGeral();
  const getHexColor = (nome: string) => corHex(nome, [config.coresCarenagem, config.coresBanco]);
  const [loading, setLoading] = useState(true);
  const [listaAnalise, setListaAnalise] = useState<MotoQA[]>([]);
  const [salvandoDecisao, setSalvandoDecisao] = useState(false);
  const [, setRelogio] = useState(0);
  
  // Modais de Decisão
  const [modalDecisaoOpen, setModalDecisaoOpen] = useState(false);
  const [acaoDecisao, setAcaoDecisao] = useState<'retrabalho' | 'avaria' | null>(null);
  const [motoSelecionada, setMotoSelecionada] = useState<MotoQA | null>(null);
  const [tipoAvaria, setTipoAvaria] = useState("");
  const [observacaoQA, setObservacaoQA] = useState("");

  // Modal de Aprovação QoL
  const [motoAprovando, setMotoAprovando] = useState<MotoQA | null>(null);
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
    else if (data) setListaAnalise(data as MotoQA[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMotos();
    const interval = setInterval(fetchMotos, 5000); // Polling rápido
    const relogio = setInterval(() => setRelogio(r => r + 1), 60000);
    return () => { clearInterval(interval); clearInterval(relogio); };
  }, [fetchMotos]);

  // --- AÇÃO 1: APROVAR (Manda para Etiquetagem) ---
  const handleAprovar = async (moto: MotoQA) => {
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
    } catch (err) {
      console.error("Erro ao aprovar:", err);
      toast.error("Erro ao aprovar a moto.");
    } finally {
      setAprovandoAcao(false);
    }
  };

  // --- AÇÃO 2: REPROVAR OU RETRABALHO ---
  const abrirModalQA = (moto: MotoQA, tipo: 'retrabalho' | 'avaria') => {
    setMotoSelecionada(moto);
    setAcaoDecisao(tipo);
    setObservacaoQA("");
    setTipoAvaria("");
    setModalDecisaoOpen(true);
  };

  const confirmarDecisaoQA = async () => {
    if (!motoSelecionada) return;
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

  return (
      <div className="space-y-6 pb-20">
        <PageHeader
          titulo="Qualidade"
          descricao="Inspeção final antes da etiquetagem, na ordem em que as motos foram finalizadas. Registre fotos de qualquer defeito."
          acoes={
            <div className="flex items-center gap-3 rounded-md border bg-card px-3.5 py-2">
              <span className="text-2xl font-semibold leading-none">{totalFila}</span>
              <span className="rotulo text-sutil">na fila</span>
            </div>
          }
        />

        <Dica titulo="Três decisões possíveis para cada moto">
          <span className="font-semibold text-foreground">APROVAR</span> envia para a Etiquetagem (E4).{" "}
          <span className="font-semibold text-foreground">Retrabalho</span> devolve ao montador para um ajuste simples (entra como prioridade na Montagem).{" "}
          <span className="font-semibold text-foreground">Reprovar</span> segrega no pátio de avarias quando o defeito exige reparo; depois do reparo a moto volta para esta fila.
        </Dica>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard rotulo="Na fila" valor={totalFila} icone={ClipboardCheck} tom={totalFila > config.limiteFilaQA ? "alerta" : "neutro"} destacar={totalFila > config.limiteFilaQA} dica={`Limite configurado: ${config.limiteFilaQA}`} carregando={loading} />
          <StatCard rotulo="1ª passagem" valor={totalPrimeiraPassagem} icone={CheckCircle2} tom="neutro" dica="Nunca voltaram para ajuste ou reparo" carregando={loading} />
          <StatCard rotulo="Reinspeções" valor={totalRetorno} icone={RotateCcw} tom={totalRetorno > 0 ? "alerta" : "neutro"} dica="Voltaram do retrabalho ou da oficina" carregando={loading} />
        </div>

        <div className="space-y-4">
            {loading && [1, 2].map(i => <div key={i} className="h-48 animate-pulse rounded-lg bg-muted" />)}

            {!loading && listaAnalise.length === 0 && (
                <EmptyState icone={CheckCircle2} titulo="Fila de inspeção vazia" descricao="Nenhuma moto aguardando inspeção. Toda moto finalizada na Montagem (E2) aparece aqui, por ordem de chegada." />
            )}

            {listaAnalise.map((moto, idx) => {
                const temRework = (moto.rework_count || 0) > 0;
                const temReparo = !!moto.tecnico_reparo;
                const espera = minutosDesde(moto.fim_montagem);
                const esperaLonga = espera > 30;

                return (
                    <article key={moto.id} className="overflow-hidden rounded-lg border bg-card">
                        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-painel-cabecalho px-4 py-3">
                            <div className="flex min-w-0 flex-wrap items-center gap-3">
                                <span className="flex h-7 min-w-9 items-center justify-center rounded-sm bg-foreground font-mono text-xs font-semibold text-background">
                                    {String(idx + 1).padStart(2, '0')}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-lg font-semibold leading-tight">{moto.modelo}</p>
                                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-sutil">
                                        {moto.ano && <span>Ano {moto.ano}</span>}
                                        {!temRework && !temReparo && <span className="rounded-sm border px-1.5 py-px font-medium text-foreground">1ª passagem</span>}
                                        {temRework && <span className="flex items-center gap-1 rounded-sm border border-serio/60 px-1.5 py-px font-medium text-foreground"><RotateCcw className="size-3 text-serio" /> Retrabalho {moto.rework_count}x</span>}
                                        {temReparo && <span className="flex items-center gap-1 rounded-sm border border-info/50 px-1.5 py-px font-medium text-foreground"><Wrench className="size-3 text-info" /> Retorno da oficina</span>}
                                    </p>
                                </div>
                            </div>
                            <PlacaChassi chassi={moto.sku} tamanho="md" />
                        </header>

                        <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,17rem)_12rem] lg:p-5">
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                                <div>
                                    <dt className="rotulo flex items-center gap-1.5 text-sutil"><PaintBucket className="size-3.5" /> Carenagem</dt>
                                    <dd className="mt-1.5 flex items-center gap-2 text-sm font-medium">
                                        <span aria-hidden className="size-4 shrink-0 rounded-[3px] border border-foreground/25" style={{ backgroundColor: getHexColor(moto.cor || "") }} />
                                        {moto.cor || '—'}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="rotulo flex items-center gap-1.5 text-sutil"><Armchair className="size-3.5" /> Banco</dt>
                                    <dd className="mt-1.5 flex items-center gap-2 text-sm font-medium">
                                        <span aria-hidden className="size-4 shrink-0 rounded-[3px] border border-foreground/25" style={{ backgroundColor: getHexColor(moto.cor_banco || "") }} />
                                        {moto.cor_banco || '—'}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="rotulo flex items-center gap-1.5 text-sutil"><User className="size-3.5" /> Montador</dt>
                                    <dd className="mt-1.5 truncate text-sm font-medium">{moto.montador?.nome || '—'}</dd>
                                </div>
                                <div>
                                    <dt className="rotulo flex items-center gap-1.5 text-sutil"><Timer className="size-3.5" /> Tempo de montagem</dt>
                                    <dd className="mt-1.5 font-mono text-sm font-semibold">{calcularDuracao(moto.inicio_montagem, moto.fim_montagem)}</dd>
                                </div>
                                <div>
                                    <dt className="rotulo flex items-center gap-1.5 text-sutil"><Clock className="size-3.5" /> Finalizada</dt>
                                    <dd className="mt-1.5 font-mono text-sm">
                                        {moto.fim_montagem ? new Date(moto.fim_montagem).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="rotulo flex items-center gap-1.5 text-sutil"><Hourglass className="size-3.5" /> Na fila há</dt>
                                    <dd className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold">
                                        <Led estado={esperaLonga ? "atencao" : "neutro"} className="size-2" />
                                        {formatarDuracaoMin(espera)}
                                    </dd>
                                </div>
                            </dl>

                            <div className="space-y-2.5 border-t pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                                <p className="rotulo text-sutil">Histórico da moto</p>
                                {!temRework && !temReparo ? (
                                    <p className="text-sm text-muted-foreground">Nenhum retrabalho ou reparo registrado até agora.</p>
                                ) : (
                                    <>
                                        {temRework && (
                                            <p className="rounded-sm border border-l-[3px] border-l-serio px-3 py-2 text-sm text-muted-foreground">
                                                Voltou <strong className="font-semibold text-foreground">{moto.rework_count}x</strong> para correções na linha.
                                            </p>
                                        )}
                                        {temReparo && (
                                            <div className="rounded-sm border border-l-[3px] border-l-info px-3 py-2 text-sm text-muted-foreground">
                                                <p>Consertado por <strong className="font-semibold text-foreground">{moto.tecnico_reparo}</strong></p>
                                                <p className="mt-1 italic">&quot;{moto.observacoes?.split('):').pop()?.trim() || 'Avaria solucionada.'}&quot;</p>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="flex flex-col justify-center gap-2">
                                <Button variant="grafite" className="h-14 w-full text-base font-semibold" onClick={() => handleAprovar(moto)}>
                                    <CheckCircle2 className="size-5 text-success" /> APROVAR
                                </Button>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button variant="outline" className="h-11 font-semibold" onClick={() => abrirModalQA(moto, 'retrabalho')}>
                                        Retrabalho
                                    </Button>
                                    <Button variant="destructive" className="h-11 font-semibold" onClick={() => abrirModalQA(moto, 'avaria')}>
                                        Reprovar
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </article>
                );
            })}
        </div>

        {/* MODAL DECISÃO QA */}
        <Dialog open={modalDecisaoOpen} onOpenChange={(o) => !salvandoDecisao && setModalDecisaoOpen(o)}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        {acaoDecisao === 'retrabalho'
                          ? <><RotateCcw className="size-5 text-serio" /> Devolver para o montador</>
                          : <><AlertTriangle className="size-5 text-destructive" /> Segregar no pátio de avarias</>}
                    </DialogTitle>
                    <DialogDescription>
                        {acaoDecisao === 'retrabalho'
                            ? 'A moto volta como prioridade para quem a montou, com a sua descrição do ajuste.'
                            : 'A moto sai do fluxo e vai para o pátio de avarias (AV). Depois do reparo, volta para esta fila.'}
                    </DialogDescription>
                </DialogHeader>

                {motoSelecionada && (
                    <div className="space-y-1.5 rounded-md border bg-background/60 p-3">
                        <p className="font-semibold">{motoSelecionada.modelo}</p>
                        <PlacaChassi chassi={motoSelecionada.sku} tamanho="sm" />
                    </div>
                )}

                <div className="space-y-4 py-1">
                    {acaoDecisao === 'avaria' && (
                        <div className="space-y-2">
                            <label className="rotulo text-sutil">Tipo de falha</label>
                            <Select onValueChange={setTipoAvaria} value={tipoAvaria}>
                                <SelectTrigger className="h-11"><SelectValue placeholder="Selecione o tipo..."/></SelectTrigger>
                                <SelectContent>
                                     {TIPOS_AVARIA.map(t => <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {motoSelecionada && (
                        <FotosMoto
                            motoId={motoSelecionada.id}
                            sku={motoSelecionada.sku}
                            etapas={[acaoDecisao === 'avaria' ? 'avaria' : 'qualidade']}
                            etapaEnvio={acaoDecisao === 'avaria' ? 'avaria' : 'qualidade'}
                            titulo="Fotos do defeito (recomendado)"
                        />
                    )}
                    <div className="space-y-2">
                        <label className="rotulo text-sutil">Descrição do defeito</label>
                        <Textarea
                            placeholder={acaoDecisao === 'retrabalho' ? "O que o montador precisa corrigir?" : "Detalhe o problema mecânico ou visual encontrado..."}
                            value={observacaoQA}
                            onChange={e => setObservacaoQA(e.target.value)}
                            rows={3}
                            maxLength={500}
                        />
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={() => setModalDecisaoOpen(false)} className="h-11" disabled={salvandoDecisao}>Cancelar</Button>
                    <Button
                         onClick={confirmarDecisaoQA}
                         disabled={!observacaoQA.trim() || (acaoDecisao === 'avaria' && !tipoAvaria) || salvandoDecisao}
                         variant={acaoDecisao === 'retrabalho' ? 'grafite' : 'destructive'}
                         className="h-11 font-semibold"
                    >
                        {salvandoDecisao ? <><Loader2 className="animate-spin"/> Salvando...</> : acaoDecisao === 'retrabalho' ? 'Devolver para Montador' : 'Confirmar Reprovação'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* MODAL DE APROVAÇÃO */}
        <Dialog open={!!motoAprovando} onOpenChange={(open) => !open && setMotoAprovando(null)}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                         <CheckCircle2 className="size-5 text-success"/> Confirmar aprovação
                    </DialogTitle>
                    <DialogDescription>
                         A moto segue para a fila de Etiquetagem (E4).
                    </DialogDescription>
                </DialogHeader>

                {motoAprovando && (
                    <div className="space-y-4 py-1">
                        <div className="space-y-1.5 rounded-md border bg-background/60 p-3">
                            <p className="font-semibold">{motoAprovando.modelo}</p>
                            <PlacaChassi chassi={motoAprovando.sku} tamanho="sm" />
                        </div>

                        <FotosMoto
                            motoId={motoAprovando.id}
                            sku={motoAprovando.sku}
                            etapaEnvio="qualidade"
                            titulo="Fotos (opcional)"
                        />

                        <label className={cn("flex cursor-pointer select-none items-start gap-3 rounded-md border p-3.5", declaracaoQA && "border-foreground")}>
                            <input
                                 type="checkbox"
                                 checked={declaracaoQA}
                                 onChange={(e) => setDeclaracaoQA(e.target.checked)}
                                 className="mt-0.5 size-4 accent-[hsl(var(--foreground))]"
                            />
                            <span className="text-sm leading-normal text-muted-foreground">
                                 Declaro que inspecionei fisicamente a moto e que a montagem atende aos critérios de qualidade.
                            </span>
                        </label>
                    </div>
                )}

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={() => setMotoAprovando(null)} className="h-11" disabled={aprovandoAcao}>Cancelar</Button>
                    <Button variant="grafite" onClick={confirmarAprovarQA} disabled={!declaracaoQA || aprovandoAcao} className="h-11 font-semibold">
                         {aprovandoAcao ? <><Loader2 className="animate-spin" /> Aprovando...</> : "Sim, Aprovar Montagem"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

      </div>
  );
}
