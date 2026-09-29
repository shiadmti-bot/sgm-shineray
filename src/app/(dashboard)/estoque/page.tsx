"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePode } from "@/lib/auth";
import { PageHeader } from "@/components/sgm/PageHeader";
import { EmptyState } from "@/components/sgm/EmptyState";
import { Dica } from "@/components/sgm/Guia";
import { Led } from "@/components/sgm/Led";
import { Painel } from "@/components/sgm/Painel";
import { PlacaChassi } from "@/components/sgm/PlacaChassi";
import { StatCard } from "@/components/sgm/StatCard";
import { MatrizPatio } from "@/components/estoque/MatrizPatio";
import {
  Warehouse, Search, Truck, CheckCircle2, FileText, AlertCircle, Wrench, RotateCcw, Pencil, Printer, Download, Loader2, RefreshCw, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { registrarLog } from "@/lib/logger";
import { listarModelos } from "@/lib/model-decoder";
import { getHexColor as corHex, rotuloAvaria } from "@/lib/constantes";
import { useConfigGeral } from "@/lib/config-sistema";
import { minutosDesde } from "@/lib/datas";
import { carregarConfigEtiquetas, modeloPadrao } from "@/lib/etiquetas/armazenamento";
import { renderizarEtiquetas } from "@/lib/etiquetas/render";
import { imprimirHTML } from "@/lib/etiquetas/imprimir";
import { cn } from "@/lib/utils";

interface MotoEstoque {
  id: string;
  sku: string;
  modelo: string;
  ano?: string | null;
  cor?: string | null;
  cor_banco?: string | null;
  localizacao?: string | null;
  observacoes?: string | null;
  tecnico_reparo?: string | null;
  rework_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  montador?: { nome: string } | null;
  supervisor?: { nome: string } | null;
}

interface AvariaHistorico {
  id: string;
  tipo_avaria: string;
  descricao_problema: string;
  descricao_solucao?: string | null;
  tecnico_nome?: string | null;
  created_at: string;
  data_resolucao?: string | null;
}

export default function EstoquePage() {
  const podeEditar = usePode("estoque.editar");
  const podeExpedir = usePode("estoque.expedir");
  const podeReimprimir = usePode("etiquetas.imprimir");
  const { config: configGeral } = useConfigGeral();
  const MODELOS_CADASTRADOS = listarModelos(configGeral.modelosExtras);
  const getHexColor = (nome: string) => corHex(nome, [configGeral.coresCarenagem, configGeral.coresBanco]);

  const [motos, setMotos] = useState<MotoEstoque[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [expedindo, setExpedindo] = useState(false);
  const [reimprimindo, setReimprimindo] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [limiteLista, setLimiteLista] = useState(60);
  const [filtroModelo, setFiltroModelo] = useState("todos");
  const [filtroCor, setFiltroCor] = useState("todas");
  const [motoSaida, setMotoSaida] = useState<MotoEstoque | null>(null);
  
  // Estados para Detalhes
  const [motoDetalhes, setMotoDetalhes] = useState<MotoEstoque | null>(null);
  const [historicoAvarias, setHistoricoAvarias] = useState<AvariaHistorico[]>([]);
  const [isRevertingConfirm, setIsRevertingConfirm] = useState(false);
  const [reverterMotivo, setReverterMotivo] = useState("etiqueta_danificada");
  const [reverterMotivoCustom, setReverterMotivoCustom] = useState("");
  const [declaracaoReverter, setDeclaracaoReverter] = useState(false);

  // Estados para QoL de Edição de Moto
  const [motoEditando, setMotoEditando] = useState<MotoEstoque | null>(null);
  const [modeloEdit, setModeloEdit] = useState("");
  const [customModeloEdit, setCustomModeloEdit] = useState("");
  const [usarCustomModeloEdit, setUsarCustomModeloEdit] = useState(false);
  const [corEdit, setCorEdit] = useState("");
  const [corBancoEdit, setCorBancoEdit] = useState("");
  const [salvandoEdit, setSalvandoEdit] = useState(false);
  const [revertendo, setRevertendo] = useState(false);

  const fetchEstoque = useCallback(async () => {
    const { data, error } = await supabase
      .from('motos')
      .select(`
        *,
        montador:funcionarios!motos_montador_id_fkey(nome),
        supervisor:funcionarios!motos_supervisor_id_fkey(nome)
      `)
      .eq('status', 'estoque')
      .order('updated_at', { ascending: false });
    
    if (error) toast.error("Erro ao carregar o estoque.");
    else if (data) setMotos(data as MotoEstoque[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    fetchEstoque();
    const interval = setInterval(fetchEstoque, 30000);
    return () => clearInterval(interval);
  }, [fetchEstoque]);

  const handleDarBaixa = async () => {
    if (!motoSaida || expedindo) return;
    setExpedindo(true);

    const { data, error } = await supabase.from('motos').update({
        status: 'expedido',
        localizacao: 'Expedido / Vendido',
        updated_at: new Date().toISOString()
    })
    .eq('id', motoSaida.id)
    .eq('status', 'estoque') // evita expedir duas vezes
    .select('id');

    if (error) {
        toast.error("Erro ao registrar a saída.");
    } else if (!data || data.length === 0) {
        toast.warning("Esta moto já não está mais no estoque.");
        setMotoSaida(null);
        fetchEstoque();
    } else {
        toast.success("Saída registrada!");
        await registrarLog('SAIDA_ESTOQUE', motoSaida.sku, { destino: 'Expedição', modelo: motoSaida.modelo });
        setMotoSaida(null);
        fetchEstoque();
    }
    setExpedindo(false);
  };

  // Reimpressão direta (etiqueta danificada) sem tirar a moto do estoque
  const handleReimprimir = async (moto: MotoEstoque) => {
    setReimprimindo(moto.id);
    try {
        const { valor } = await carregarConfigEtiquetas();
        const modelo = modeloPadrao(valor);
        const html = await renderizarEtiquetas(modelo, [{
            sku: moto.sku, modelo: moto.modelo, cor: moto.cor, cor_banco: moto.cor_banco, ano: moto.ano,
            montador: moto.montador?.nome, supervisor: moto.supervisor?.nome, localizacao: moto.localizacao,
        }], { modo: 'impressao', titulo: `ETIQUETA ${moto.sku}` });
        await imprimirHTML(html);
        await registrarLog('REIMPRESSAO_ETIQUETA', moto.sku, { modelo_etiqueta: modelo.nome, origem: 'estoque' });
    } catch (err) {
        console.error(err);
        toast.error("Não foi possível reimprimir a etiqueta.");
    } finally {
        setReimprimindo(null);
    }
  };

  const handleVerDetalhes = async (moto: MotoEstoque) => {
      setMotoDetalhes(moto);
      setHistoricoAvarias([]); // Limpa anterior
      setIsRevertingConfirm(false);
      setReverterMotivo("etiqueta_danificada");
      setReverterMotivoCustom("");
      setDeclaracaoReverter(false);

      // Busca histórico de avarias desta moto
      const { data } = await supabase
        .from('historico_avarias')
        .select('*')
        .eq('moto_id', moto.id)
        .order('created_at', { ascending: false });

      if (data) setHistoricoAvarias(data as AvariaHistorico[]);
  };

  const handleAbrirEditar = (moto: MotoEstoque) => {
      setMotoEditando(moto);
      const isCustom = !MODELOS_CADASTRADOS.includes(moto.modelo);
      setUsarCustomModeloEdit(isCustom);
      if (isCustom) {
          setCustomModeloEdit(moto.modelo);
          setModeloEdit(MODELOS_CADASTRADOS[0] || "");
      } else {
          setModeloEdit(moto.modelo);
          setCustomModeloEdit("");
      }
      setCorEdit(moto.cor || "");
      setCorBancoEdit(moto.cor_banco || "");
  };

  const handleSalvarEdicao = async () => {
      if (!motoEditando) return;
      const modeloFinal = usarCustomModeloEdit ? customModeloEdit.toUpperCase().trim() : modeloEdit;
      if (!modeloFinal) return toast.warning("Modelo é obrigatório");
      if (!corEdit) return toast.warning("Cor é obrigatória");
      if (!corBancoEdit) return toast.warning("Cor do banco é obrigatória");

      setSalvandoEdit(true);
      try {
          const { error } = await supabase
              .from('motos')
              .update({
                  modelo: modeloFinal,
                  cor: corEdit,
                  cor_banco: corBancoEdit,
                  updated_at: new Date().toISOString()
              })
              .eq('id', motoEditando.id);

          if (error) throw error;

          toast.success("Moto atualizada com sucesso!");
          await registrarLog('EDICAO', motoEditando.sku, { 
              de: { modelo: motoEditando.modelo, cor: motoEditando.cor, cor_banco: motoEditando.cor_banco },
              para: { modelo: modeloFinal, cor: corEdit, cor_banco: corBancoEdit }
          });
          setMotoEditando(null);
          fetchEstoque();
      } catch (err) {
          console.error("Erro ao editar moto:", err);
          toast.error("Erro ao atualizar a moto.");
      } finally {
          setSalvandoEdit(false);
      }
  };

  const handleReverterEtiquetagem = async (moto: MotoEstoque) => {
      const motivoFinal = reverterMotivo === "outro" ? reverterMotivoCustom.trim() : reverterMotivo;
      if (!motivoFinal || motivoFinal.trim() === "") {
          return toast.warning("Por favor, informe o motivo da reversão.");
      }
      if (!declaracaoReverter) {
          return toast.warning("Você precisa confirmar a declaração.");
      }

      setRevertendo(true);
      try {
          const { data, error } = await supabase
              .from('motos')
              .update({
                  status: 'aguardando_etiqueta',
                  localizacao: 'Pátio Montada (Aguardando Etiqueta)',
                  updated_at: new Date().toISOString()
              })
              .eq('id', moto.id)
              .eq('status', 'estoque')
              .select('id');

          if (error) throw error;
          if (!data || data.length === 0) {
              toast.warning("Esta moto já não está mais no estoque.");
              setMotoDetalhes(null);
              fetchEstoque();
              return;
          }

          toast.success("Moto enviada de volta para Etiquetagem!");
          await registrarLog('REVERSAO_ESTOQUE', moto.sku, { 
              motivo: 'Reversão de Estoque para Etiquetagem',
              detalhe_motivo: motivoFinal
          });
          setMotoDetalhes(null); // Fecha o modal
          fetchEstoque();
      } catch (err) {
          console.error("Erro ao reverter:", err);
          toast.error("Erro ao reverter status para etiquetagem.");
      } finally {
          setRevertendo(false);
      }
  };

  const modelosUnicos = Array.from(new Set(motos.map(m => m.modelo))).sort();
  const coresUnicas = Array.from(new Set(motos.map(m => m.cor).filter(Boolean)));
  const diasParada = (m: MotoEstoque) => Math.floor(minutosDesde(m.updated_at) / 1440);
  const paradas30 = motos.filter(m => diasParada(m) >= 30).length;

  const motosFiltradas = motos.filter(m => {
    const termo = busca.toLowerCase();
    const matchBusca = (m.sku || '').toLowerCase().includes(termo) || (m.modelo || '').toLowerCase().includes(termo) || (m.cor || '').toLowerCase().includes(termo);
    const matchModelo = filtroModelo === "todos" || m.modelo === filtroModelo;
    const matchCor = filtroCor === "todas" || (m.cor || "Sem cor") === filtroCor;
    return matchBusca && matchModelo && matchCor;
  });
  const filtrando = filtroModelo !== 'todos' || filtroCor !== 'todas' || !!busca;

  // Exporta a lista filtrada (CSV com ; e BOM: abre corretamente no Excel em português)
  const handleExportarCSV = () => {
    if (motosFiltradas.length === 0) return toast.warning("Nada para exportar.");
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cabecalho = ['Chassi', 'Modelo', 'Ano', 'Cor', 'Banco', 'Montador', 'Inspetor QA', 'Retrabalhos', 'Reparada por', 'Entrada no estoque', 'Dias em estoque', 'Localização'];
    const linhas = motosFiltradas.map(m => [
      m.sku, m.modelo, m.ano, m.cor, m.cor_banco, m.montador?.nome, m.supervisor?.nome, m.rework_count || 0, m.tecnico_reparo || '',
      m.updated_at ? new Date(m.updated_at).toLocaleString('pt-BR') : '', diasParada(m), m.localizacao,
    ].map(esc).join(';'));
    const blob = new Blob(['\uFEFF' + [cabecalho.map(esc).join(';'), ...linhas].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estoque_shineray_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const data = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

  return (
      <div className="space-y-6 pb-20">
        <PageHeader
          titulo="Estoque"
          descricao="Pátio de motos prontas: etiquetadas na Etiquetagem (E4) e aguardando expedição."
          acoes={
            <>
              <Button variant="outline" size="sm" onClick={handleExportarCSV} className="gap-1.5">
                <Download className="size-3.5" /> Exportar CSV
              </Button>
              <Button variant="outline" size="sm" onClick={fetchEstoque} className="gap-1.5" aria-label="Atualizar estoque">
                <RefreshCw className="size-3.5" /> Atualizar
              </Button>
            </>
          }
        />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard rotulo="Unidades no pátio" valor={motos.length} icone={Warehouse} tom="neutro" carregando={carregando} />
          <StatCard rotulo="Modelos" valor={modelosUnicos.length} tom="neutro" carregando={carregando} />
          <StatCard rotulo="Cores" valor={coresUnicas.length} tom="neutro" carregando={carregando} />
          <StatCard
            rotulo="Sem movimentação 30+ dias"
            valor={paradas30}
            tom={paradas30 > 0 ? "alerta" : "neutro"}
            dica="Pela data da última atualização da moto"
            carregando={carregando}
          />
        </div>

        <Dica titulo="Como usar o estoque">
          A matriz mostra quantas motos há de cada modelo e cor: toque numa célula (ou no nome do modelo ou da cor) para filtrar a lista.
          Na lista, <span className="font-semibold text-foreground">EXPEDIR</span> registra a saída; a ficha mostra o caminho da moto pela linha e permite devolvê-la à Etiquetagem.
        </Dica>

        {!carregando && (
          <MatrizPatio
            motos={motos}
            corDaCor={(nome) => getHexColor(nome)}
            modelo={filtroModelo}
            cor={filtroCor}
            aoFiltrar={(mod, c) => { setFiltroModelo(mod); setFiltroCor(c); }}
          />
        )}

        <Painel
          titulo="Motos no pátio"
          codigo="E5"
          meta={filtrando ? `${motosFiltradas.length} de ${motos.length} com os filtros atuais` : `${motos.length} unidade(s)`}
          semRecuo
        >
          <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar chassi, modelo ou cor..."
                className="h-10 bg-background pl-10"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                aria-label="Buscar no estoque"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {filtroModelo !== 'todos' && (
                <button type="button" onClick={() => setFiltroModelo('todos')} className="flex h-8 items-center gap-1.5 rounded-sm bg-foreground px-2.5 text-xs font-medium text-background">
                  Modelo: {filtroModelo} <X className="size-3.5" />
                </button>
              )}
              {filtroCor !== 'todas' && (
                <button type="button" onClick={() => setFiltroCor('todas')} className="flex h-8 items-center gap-1.5 rounded-sm bg-foreground px-2.5 text-xs font-medium text-background">
                  <span aria-hidden className="size-3 rounded-[2px] border border-background/40" style={{ backgroundColor: getHexColor(filtroCor) }} />
                  Cor: {filtroCor} <X className="size-3.5" />
                </button>
              )}
              {filtrando && (
                <Button variant="ghost" size="sm" onClick={() => { setBusca(""); setFiltroModelo("todos"); setFiltroCor("todas"); }}>
                  Limpar filtros
                </Button>
              )}
            </div>
          </div>

          {carregando ? (
            <div className="space-y-2 p-4">{[1, 2, 3].map(i => <div key={i} className="h-14 animate-pulse rounded-sm bg-muted" />)}</div>
          ) : motosFiltradas.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icone={Warehouse}
                titulo={motos.length === 0 ? "Pátio vazio" : "Nenhuma moto com os filtros atuais"}
                descricao={motos.length === 0 ? "Motos etiquetadas na Etiquetagem (E4) aparecem aqui." : "Limpe os filtros ou toque em outra célula da matriz."}
                compacto
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th scope="col" className="rotulo px-4 py-2.5 font-semibold text-sutil">Moto</th>
                    <th scope="col" className="rotulo px-3 py-2.5 font-semibold text-sutil">Cores</th>
                    <th scope="col" className="rotulo px-3 py-2.5 font-semibold text-sutil">Passagem</th>
                    <th scope="col" className="rotulo px-3 py-2.5 font-semibold text-sutil">No pátio</th>
                    <th scope="col" className="rotulo px-3 py-2.5 font-semibold text-sutil">Origem</th>
                    <th scope="col" className="rotulo px-4 py-2.5 text-right font-semibold text-sutil">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {motosFiltradas.slice(0, limiteLista).map((moto) => {
                    const dias = diasParada(moto);
                    return (
                      <tr key={moto.id} className="hover:bg-accent/40">
                        <td className="px-4 py-2.5">
                          <p className="font-semibold">{moto.modelo}</p>
                          <PlacaChassi chassi={moto.sku} tamanho="sm" className="mt-1" />
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="flex items-center gap-2">
                            <span aria-hidden className="size-4 shrink-0 rounded-[3px] border border-foreground/25" style={{ backgroundColor: getHexColor(moto.cor || "") }} />
                            <span className="font-medium">{moto.cor || '—'}</span>
                          </p>
                          <p className="mt-0.5 pl-6 text-xs text-sutil">Banco: {moto.cor_banco || '—'}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {(moto.rework_count || 0) > 0 && <span className="flex items-center gap-1 rounded-sm border border-serio/60 px-1.5 py-px text-xs"><RotateCcw className="size-3 text-serio" /> Retrabalho {moto.rework_count}x</span>}
                            {moto.tecnico_reparo && <span className="flex items-center gap-1 rounded-sm border border-info/50 px-1.5 py-px text-xs"><Wrench className="size-3 text-info" /> Reparada</span>}
                            {!moto.rework_count && !moto.tecnico_reparo && <span className="rounded-sm border px-1.5 py-px text-xs">1ª passagem</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="flex items-center gap-1.5 font-mono text-sm tabular-nums">
                            {dias >= 30 && <Led estado="atencao" className="size-2" />}
                            {dias} d
                          </p>
                          <p className="text-xs text-sutil">desde {data(moto.updated_at)}</p>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          <p>Montagem: <span className="text-foreground">{moto.montador?.nome?.split(' ')[0] || '—'}</span></p>
                          <p>Qualidade: <span className="text-foreground">{moto.supervisor?.nome?.split(' ')[0] || '—'}</span></p>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleVerDetalhes(moto)} title="Ficha da moto" aria-label="Ficha da moto">
                              <FileText className="size-4" />
                            </Button>
                            {podeReimprimir && (
                              <Button variant="ghost" size="icon" onClick={() => handleReimprimir(moto)} disabled={reimprimindo === moto.id} title="Reimprimir etiqueta" aria-label="Reimprimir etiqueta">
                                {reimprimindo === moto.id ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
                              </Button>
                            )}
                            {podeEditar && (
                              <Button variant="ghost" size="icon" onClick={() => handleAbrirEditar(moto)} title="Editar moto" aria-label="Editar moto">
                                <Pencil className="size-4" />
                              </Button>
                            )}
                            {podeExpedir && (
                              <Button size="sm" variant="grafite" className="ml-1 font-semibold" onClick={() => setMotoSaida(moto)}>
                                <Truck className="size-3.5" /> EXPEDIR
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {motosFiltradas.length > limiteLista && (
                <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
                  <span className="text-sutil">Mostrando {limiteLista} de {motosFiltradas.length}. Use a matriz ou a busca para ir direto ao que procura.</span>
                  <Button variant="outline" size="sm" onClick={() => setLimiteLista((n) => n + 60)}>Mostrar mais 60</Button>
                </div>
              )}
            </div>
          )}
        </Painel>

        {/* FICHA DA MOTO */}
        <Dialog open={!!motoDetalhes} onOpenChange={(open) => !open && !revertendo && setMotoDetalhes(null)}>
          <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
            {motoDetalhes && (
              <>
                <div className="space-y-3 border-b border-white/10 bg-sidebar p-5 text-white">
                  <p className="rotulo text-white/60">Ficha da moto · Estoque (E5)</p>
                  <DialogTitle className="text-2xl font-semibold leading-tight text-white">{motoDetalhes.modelo}</DialogTitle>
                  <DialogDescription className="sr-only">Dados, caminho na linha e histórico de qualidade da moto.</DialogDescription>
                  <PlacaChassi chassi={motoDetalhes.sku} tamanho="md" />
                </div>

                <div className="max-h-[62vh] space-y-6 overflow-y-auto p-5">
                  {!isRevertingConfirm ? (
                    <>
                      <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <div>
                          <dt className="rotulo text-sutil">Carenagem</dt>
                          <dd className="mt-1.5 flex items-center gap-2 text-sm font-medium">
                            <span aria-hidden className="size-4 rounded-[3px] border border-foreground/25" style={{ backgroundColor: getHexColor(motoDetalhes.cor || "") }} />
                            {motoDetalhes.cor || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="rotulo text-sutil">Banco</dt>
                          <dd className="mt-1.5 flex items-center gap-2 text-sm font-medium">
                            <span aria-hidden className="size-4 rounded-[3px] border border-foreground/25" style={{ backgroundColor: getHexColor(motoDetalhes.cor_banco || "") }} />
                            {motoDetalhes.cor_banco || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="rotulo text-sutil">Ano-modelo</dt>
                          <dd className="mt-1.5 text-sm font-medium">{motoDetalhes.ano || '—'}</dd>
                        </div>
                        <div>
                          <dt className="rotulo text-sutil">Local</dt>
                          <dd className="mt-1.5 text-sm font-medium">{motoDetalhes.localizacao || 'Pátio de Estoque'}</dd>
                        </div>
                      </dl>

                      <div className="space-y-3">
                        <p className="rotulo text-sutil">Caminho na linha</p>
                        <ol className="relative grid gap-3 sm:grid-cols-5">
                          {[
                            { codigo: "E1", titulo: "Entrada", texto: data(motoDetalhes.created_at) },
                            { codigo: "E2", titulo: "Montagem", texto: motoDetalhes.montador?.nome?.split(' ')[0] || '—' },
                            { codigo: "E3", titulo: "Qualidade", texto: motoDetalhes.supervisor?.nome?.split(' ')[0] || '—' },
                            { codigo: "E4", titulo: "Etiquetagem", texto: "etiqueta aplicada" },
                            { codigo: "E5", titulo: "Estoque", texto: `desde ${data(motoDetalhes.updated_at)}` },
                          ].map((e, i, lista) => (
                            <li key={e.codigo} className="relative flex items-start gap-2.5 sm:flex-col sm:gap-1.5">
                              {i < lista.length - 1 && <span aria-hidden className="absolute left-[13px] top-6 hidden h-px w-[calc(100%-8px)] bg-border sm:block" />}
                              <span className="codigo-estacao relative z-10">{e.codigo}</span>
                              <span className="min-w-0">
                                <span className="block text-xs font-semibold">{e.titulo}</span>
                                <span className="block truncate text-xs text-sutil">{e.texto}</span>
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      <div className="space-y-2.5">
                        <p className="rotulo text-sutil">Histórico de qualidade</p>
                        {(motoDetalhes.rework_count || 0) > 0 && (
                          <p className="rounded-sm border border-l-[3px] border-l-serio px-3 py-2 text-sm text-muted-foreground">
                            Voltou <strong className="font-semibold text-foreground">{motoDetalhes.rework_count}x</strong> para correções na linha durante a inspeção.
                          </p>
                        )}
                        {motoDetalhes.tecnico_reparo && (
                          <div className="rounded-sm border border-l-[3px] border-l-info px-3 py-2 text-sm text-muted-foreground">
                            <p>Reparada por <strong className="font-semibold text-foreground">{motoDetalhes.tecnico_reparo}</strong></p>
                            <p className="mt-1 italic">&quot;{motoDetalhes.observacoes || "Sem observações registradas."}&quot;</p>
                          </div>
                        )}
                        {historicoAvarias.map((av) => (
                          <div key={av.id} className="space-y-1 rounded-sm border border-l-[3px] border-l-destructive px-3 py-2 text-sm">
                            <p className="flex items-center justify-between gap-2">
                              <span className="font-semibold">{rotuloAvaria(av.tipo_avaria)}</span>
                              <span className="text-xs text-sutil">{data(av.created_at)}</span>
                            </p>
                            <p className="text-muted-foreground">&quot;{av.descricao_problema}&quot;</p>
                            {av.descricao_solucao && <p className="text-muted-foreground"><span className="font-medium text-foreground">Solução:</span> {av.descricao_solucao}</p>}
                            {av.data_resolucao && <p className="text-xs text-sutil">Resolvido por {av.tecnico_nome || '—'} em {data(av.data_resolucao)}</p>}
                          </div>
                        ))}
                        {!(motoDetalhes.rework_count || 0) && !motoDetalhes.tecnico_reparo && historicoAvarias.length === 0 && (
                          <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CheckCircle2 className="size-4 text-success" /> Primeira passagem: nenhum retrabalho ou avaria registrado.
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-5">
                      <div className="flex gap-3 rounded-md border border-l-[3px] border-l-warning p-4">
                        <AlertCircle className="mt-0.5 size-5 shrink-0 text-warning" />
                        <div>
                          <p className="text-sm font-semibold">Devolver para a Etiquetagem</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            A moto sai do estoque disponível e volta para a fila de impressão (E4), com o local <strong className="font-semibold text-foreground">Pátio Montada (Aguardando Etiqueta)</strong>.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="rotulo text-sutil">Motivo da reversão</label>
                        <Select value={reverterMotivo} onValueChange={setReverterMotivo}>
                          <SelectTrigger className="h-11 w-full"><SelectValue placeholder="Selecione um motivo..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="etiqueta_danificada">Etiqueta física danificada ou ilegível</SelectItem>
                            <SelectItem value="erro_dados">Erro nos dados impressos na etiqueta</SelectItem>
                            <SelectItem value="defeito_detectado">Defeito físico ou visual detectado no estoque</SelectItem>
                            <SelectItem value="outro">Outro motivo (especificar abaixo)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {reverterMotivo === "outro" && (
                        <div className="space-y-2">
                          <label className="rotulo text-sutil">Especifique o motivo</label>
                          <Input placeholder="Digite o motivo detalhado..." value={reverterMotivoCustom} onChange={e => setReverterMotivoCustom(e.target.value)} className="h-11" />
                        </div>
                      )}
                      <label className={cn("flex cursor-pointer select-none items-start gap-3 rounded-md border p-3.5", declaracaoReverter && "border-foreground")}>
                        <input type="checkbox" checked={declaracaoReverter} onChange={(e) => setDeclaracaoReverter(e.target.checked)} className="mt-0.5 size-4 accent-[hsl(var(--foreground))]" />
                        <span className="text-sm text-muted-foreground">Confirmo que esta moto deve voltar para a etapa de Etiquetagem.</span>
                      </label>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex-row items-center gap-2 border-t bg-painel-cabecalho p-4 sm:justify-between">
                  {!isRevertingConfirm ? (
                    <>
                      {podeEditar ? (
                        <Button variant="outline" onClick={() => setIsRevertingConfirm(true)} className="mr-auto">
                          <RotateCcw /> Reverter para Etiquetagem
                        </Button>
                      ) : <span className="mr-auto" />}
                      <Button variant="ghost" onClick={() => setMotoDetalhes(null)}>Fechar</Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" onClick={() => setIsRevertingConfirm(false)} disabled={revertendo} className="mr-auto">Voltar</Button>
                      <Button
                        variant="grafite"
                        onClick={() => handleReverterEtiquetagem(motoDetalhes)}
                        disabled={!declaracaoReverter || (reverterMotivo === "outro" && !reverterMotivoCustom.trim()) || revertendo}
                        className="font-semibold"
                      >
                        {revertendo ? <><Loader2 className="animate-spin" /> Revertendo...</> : "Confirmar Reversão"}
                      </Button>
                    </>
                  )}
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* EXPEDIÇÃO */}
        <Dialog open={!!motoSaida} onOpenChange={(open) => !open && !expedindo && setMotoSaida(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Truck className="size-5" /> Confirmar expedição</DialogTitle>
              <DialogDescription>A moto sai do estoque disponível e fica registrada como expedida.</DialogDescription>
            </DialogHeader>
            {motoSaida && (
              <div className="space-y-1.5 rounded-md border bg-background/60 p-3">
                <p className="font-semibold">{motoSaida.modelo}</p>
                <PlacaChassi chassi={motoSaida.sku} tamanho="sm" />
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMotoSaida(null)} disabled={expedindo}>Cancelar</Button>
              <Button variant="grafite" onClick={handleDarBaixa} disabled={expedindo} className="font-semibold">
                {expedindo ? <><Loader2 className="animate-spin" /> Registrando...</> : "Confirmar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* EDIÇÃO */}
        <Dialog open={!!motoEditando} onOpenChange={(open) => !open && setMotoEditando(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Pencil className="size-5" /> Editar moto</DialogTitle>
              <DialogDescription>Corrija modelo e cores. A alteração fica registrada na auditoria.</DialogDescription>
            </DialogHeader>
            {motoEditando && <PlacaChassi chassi={motoEditando.sku} tamanho="md" />}
            <div className="space-y-4">
              <div className="flex items-center gap-4 border-b pb-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input type="radio" checked={!usarCustomModeloEdit} onChange={() => setUsarCustomModeloEdit(false)} className="accent-[hsl(var(--foreground))]" />
                  Modelo do catálogo
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input type="radio" checked={usarCustomModeloEdit} onChange={() => setUsarCustomModeloEdit(true)} className="accent-[hsl(var(--foreground))]" />
                  Digitar manualmente
                </label>
              </div>
              {!usarCustomModeloEdit ? (
                <div className="space-y-2">
                  <label className="rotulo text-sutil">Modelo do catálogo</label>
                  <Select onValueChange={setModeloEdit} value={modeloEdit}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecione um modelo..." /></SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {MODELOS_CADASTRADOS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="rotulo text-sutil">Modelo personalizado</label>
                  <Input placeholder="Ex: SHI 175 EFI 2026..." value={customModeloEdit} onChange={e => setCustomModeloEdit(e.target.value)} className="uppercase" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="rotulo text-sutil">Cor da carenagem</label>
                  <Input placeholder="Ex: Vermelha..." value={corEdit} onChange={e => setCorEdit(e.target.value)} list="catalogo-cores-carenagem" />
                  <datalist id="catalogo-cores-carenagem">
                    {configGeral.coresCarenagem.map(c => <option key={c.nome} value={c.nome}>{c.descricao}</option>)}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <label className="rotulo text-sutil">Cor do banco</label>
                  <Input placeholder="Ex: Preto..." value={corBancoEdit} onChange={e => setCorBancoEdit(e.target.value)} list="catalogo-cores-banco" />
                  <datalist id="catalogo-cores-banco">
                    {configGeral.coresBanco.map(c => <option key={c.nome} value={c.nome}>{c.descricao}</option>)}
                  </datalist>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMotoEditando(null)}>Cancelar</Button>
              <Button variant="grafite" onClick={handleSalvarEdicao} disabled={salvandoEdit} className="font-semibold">
                {salvandoEdit ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  );
}
