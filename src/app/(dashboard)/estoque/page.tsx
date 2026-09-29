"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { usePode } from "@/lib/auth";
import { PageHeader } from "@/components/sgm/PageHeader";
import { 
  Warehouse, Search, Truck, CheckCircle2, FileJson, Calendar, User, PaintBucket, Tag, AlertCircle, Wrench, RotateCcw, Pencil, Printer, Download, Loader2, RefreshCw
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { registrarLog } from "@/lib/logger";
import { listarModelos } from "@/lib/model-decoder";
import { getHexColor as corHex } from "@/lib/constantes";
import { useConfigGeral } from "@/lib/config-sistema";
import { minutosDesde } from "@/lib/datas";
import { carregarConfigEtiquetas, modeloPadrao } from "@/lib/etiquetas/armazenamento";
import { renderizarEtiquetas } from "@/lib/etiquetas/render";
import { imprimirHTML } from "@/lib/etiquetas/imprimir";

export default function EstoquePage() {
  const podeEditar = usePode("estoque.editar");
  const podeExpedir = usePode("estoque.expedir");
  const podeReimprimir = usePode("etiquetas.imprimir");
  const { config: configGeral } = useConfigGeral();
  const MODELOS_CADASTRADOS = listarModelos(configGeral.modelosExtras);
  const getHexColor = (nome: string) => corHex(nome, [configGeral.coresCarenagem, configGeral.coresBanco]);

  const [motos, setMotos] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [expedindo, setExpedindo] = useState(false);
  const [reimprimindo, setReimprimindo] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroModelo, setFiltroModelo] = useState("todos");
  const [filtroCor, setFiltroCor] = useState("todas");
  const [motoSaida, setMotoSaida] = useState<any>(null);
  
  // Estados para Detalhes
  const [motoDetalhes, setMotoDetalhes] = useState<any>(null);
  const [historicoAvarias, setHistoricoAvarias] = useState<any[]>([]);
  const [isRevertingConfirm, setIsRevertingConfirm] = useState(false);
  const [reverterMotivo, setReverterMotivo] = useState("etiqueta_danificada");
  const [reverterMotivoCustom, setReverterMotivoCustom] = useState("");
  const [declaracaoReverter, setDeclaracaoReverter] = useState(false);

  // Estados para QoL de Edição de Moto
  const [motoEditando, setMotoEditando] = useState<any>(null);
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
    else if (data) setMotos(data);
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
  const handleReimprimir = async (moto: any) => {
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

  const handleVerDetalhes = async (moto: any) => {
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

      if (data) setHistoricoAvarias(data);
  };

  const handleAbrirEditar = (moto: any) => {
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
      } catch (err: any) {
          console.error("Erro ao editar moto:", err);
          toast.error("Erro ao atualizar a moto.");
      } finally {
          setSalvandoEdit(false);
      }
  };

  const handleReverterEtiquetagem = async (moto: any) => {
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
      } catch (err: any) {
          console.error("Erro ao reverter:", err);
          toast.error("Erro ao reverter status para etiquetagem.");
      } finally {
          setRevertendo(false);
      }
  };

  // Extrai listas únicas para os filtros
  const modelosUnicos = Array.from(new Set(motos.map(m => m.modelo))).sort();
  const coresUnicas = Array.from(new Set(motos.map(m => m.cor).filter(Boolean))).sort();

  const motosFiltradas = motos.filter(m => {
    const termo = busca.toLowerCase();
    const matchBusca = (m.sku || '').toLowerCase().includes(termo) || (m.modelo || '').toLowerCase().includes(termo) || (m.cor || '').toLowerCase().includes(termo);
    const matchModelo = filtroModelo === "todos" || m.modelo === filtroModelo;
    const matchCor = filtroCor === "todas" || m.cor === filtroCor;
    return matchBusca && matchModelo && matchCor;
  });

  // Exporta a lista filtrada (CSV com ; e BOM: abre corretamente no Excel em português)
  const handleExportarCSV = () => {
    if (motosFiltradas.length === 0) return toast.warning("Nada para exportar.");
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cabecalho = ['Chassi', 'Modelo', 'Ano', 'Cor', 'Banco', 'Montador', 'Inspetor QA', 'Retrabalhos', 'Reparada por', 'Entrada no estoque', 'Dias em estoque', 'Localização'];
    const linhas = motosFiltradas.map(m => [
      m.sku, m.modelo, m.ano, m.cor, m.cor_banco, m.montador?.nome, m.supervisor?.nome, m.rework_count || 0, m.tecnico_reparo || '',
      m.updated_at ? new Date(m.updated_at).toLocaleString('pt-BR') : '', Math.floor(minutosDesde(m.updated_at) / 1440), m.localizacao,
    ].map(esc).join(';'));
    const blob = new Blob(['\uFEFF' + [cabecalho.map(esc).join(';'), ...linhas].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estoque_shineray_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
      <div className="space-y-6 animate-in fade-in pb-20">
        <PageHeader
          icone={Warehouse}
          titulo="Estoque"
          descricao="Motos etiquetadas e prontas para expedição."
          acoes={
          <div className="flex flex-wrap gap-2 items-center">
             <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900 px-3 py-1">
                {motos.length} Unidades Totais
             </Badge>
             <Badge variant="outline" className="text-slate-700 border-slate-200 bg-muted/50 dark:text-slate-300 dark:border-slate-800 px-3 py-1">
                {modelosUnicos.length} Modelos
             </Badge>
             <Button variant="outline" size="sm" onClick={handleExportarCSV} className="h-8">
                <Download className="w-4 h-4 mr-1" /> Exportar CSV
             </Button>
             <Button variant="ghost" size="icon" onClick={fetchEstoque} className="h-8 w-8" title="Atualizar" aria-label="Atualizar estoque">
                <RefreshCw className="w-4 h-4" />
             </Button>
          </div>
          }
        />

        {/* Barra de Filtros Harmonizada */}
        <div className="bg-card p-4 rounded-xl border border-border flex flex-col xl:flex-row gap-4 shadow-sm">
            <div className="relative flex-1">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
               <Input 
                   placeholder="Buscar chassi, modelo ou cor..." 
                   className="pl-10 h-10 border-border" 
                   value={busca}
                   onChange={e => setBusca(e.target.value)}
               />
            </div>
            
            <div className="flex gap-2 w-full xl:w-auto">
                <Select value={filtroModelo} onValueChange={setFiltroModelo}>
                    <SelectTrigger className="w-full md:w-[240px] h-10 border-border">
                        <Tag className="w-4 h-4 mr-2 text-muted-foreground"/>
                        <SelectValue placeholder="Filtrar Modelo" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todos">Todos os Modelos</SelectItem>
                        {modelosUnicos.map(mod => <SelectItem key={mod} value={mod}>{mod}</SelectItem>)}
                    </SelectContent>
                </Select>

                <Select value={filtroCor} onValueChange={setFiltroCor}>
                    <SelectTrigger className="w-full md:w-[180px] h-10 border-border">
                        <PaintBucket className="w-4 h-4 mr-2 text-muted-foreground"/>
                        <SelectValue placeholder="Filtrar Cor" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todas">Todas as Cores</SelectItem>
                        {coresUnicas.map(cor => (
                            <SelectItem key={cor} value={cor}>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full border border-slate-200" style={{backgroundColor: getHexColor(cor as string)}}></div>
                                    {cor}
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {(filtroModelo !== 'todos' || filtroCor !== 'todas' || busca) && (
                    <Button variant="ghost" onClick={() => { setBusca(""); setFiltroModelo("todos"); setFiltroCor("todas"); }} className="h-10 px-3 text-red-500 hover:text-red-700 hover:bg-red-50">
                        Limpar
                    </Button>
                )}
            </div>
        </div>

        {/* Tabela Detalhada */}
        <Card className="border-0 shadow-md">
            <CardContent className="p-0">
                <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead>Identificação</TableHead>
                                <TableHead>Detalhes Visuais</TableHead>
                                <TableHead>Histórico</TableHead>
                                <TableHead>Origem</TableHead>
                                <TableHead className="text-right">Expedição</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {carregando ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                                        <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40"/>
                                        Carregando estoque...
                                    </TableCell>
                                </TableRow>
                            ) : motosFiltradas.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                                        <Warehouse className="w-12 h-12 mx-auto mb-3 opacity-20"/>
                                        Nenhuma moto encontrada com os filtros atuais.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                motosFiltradas.map((moto) => (
                                    <TableRow key={moto.id} className="hover:bg-accent group transition-colors">
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-foreground">{moto.modelo}</span>
                                                <Badge variant="outline" className="w-fit mt-1 font-mono text-[10px] text-muted-foreground border-slate-300">
                                                    {moto.sku}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full border-2 border-white shadow-sm flex items-center justify-center bg-muted relative z-0 before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-tr before:from-black/10 before:to-transparent" style={{backgroundColor: getHexColor(moto.cor)}}>
                                                    {/* Dot Visual */}
                                                </div>
                                                <div className="flex flex-col text-xs">
                                                    <span className="font-bold text-foreground/90">{moto.cor}</span>
                                                    <span className="text-muted-foreground">Banco: {moto.cor_banco}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center text-xs text-muted-foreground" title="Entrada no estoque">
                                                    <Calendar className="w-3 h-3 mr-1"/>
                                                    {new Date(moto.updated_at).toLocaleDateString()}
                                                    <span className="ml-1 text-muted-foreground">({Math.floor(minutosDesde(moto.updated_at) / 1440)}d)</span>
                                                </div>
                                                <div className="flex gap-1">
                                                    {moto.rework_count > 0 && <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">Rework</Badge>}
                                                    {moto.tecnico_reparo && <Badge className="bg-blue-100 text-blue-700 text-[9px] px-1 py-0 h-4 border-0">Reparada</Badge>}
                                                    {!moto.rework_count && !moto.tecnico_reparo && <Badge className="bg-green-100 text-green-700 text-[9px] px-1 py-0 h-4 border-0">1ª Linha</Badge>}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col text-xs">
                                                <span className="flex items-center gap-1 text-muted-foreground"><User className="w-3 h-3"/> Mont: {moto.montador?.nome?.split(' ')[0] || '—'}</span>
                                                <span className="flex items-center gap-1 text-muted-foreground"><CheckCircle2 className="w-3 h-3 text-green-500"/> QA: {moto.supervisor?.nome?.split(' ')[0] || '—'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Dialog open={!!motoDetalhes && motoDetalhes.id === moto.id} onOpenChange={(open) => !open && setMotoDetalhes(null)}>
                                                    <DialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => handleVerDetalhes(moto)}>
                                                            <FileJson className="w-4 h-4"/>
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent className="sm:max-w-2xl bg-card p-0 overflow-hidden shadow-2xl rounded-2xl border border-slate-200/80 dark:border-slate-800">
                                                        {/* Header com gradiente */}
                                                        <div className="bg-gradient-to-r from-emerald-600 to-teal-800 dark:from-emerald-950 dark:to-teal-900 text-white p-6 relative overflow-hidden">
                                                            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
                                                            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/5 rounded-full blur-2xl"></div>
                                                            <div className="relative flex items-center justify-between">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/20 shadow-inner">
                                                                        <Warehouse className="w-6 h-6 text-emerald-100 animate-pulse"/>
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-[10px] bg-emerald-500/30 text-emerald-100 border border-emerald-400/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                                                             Ficha Técnica
                                                                        </span>
                                                                        <h2 className="text-2xl font-black leading-tight mt-1">{moto.modelo}</h2>
                                                                        <p className="text-xs text-emerald-200/80 font-mono tracking-widest uppercase mt-0.5">{moto.sku}</p>
                                                                    </div>
                                                                </div>
                                                                <div className="hidden sm:block text-right">
                                                                     <span className="text-xs text-emerald-200">Entrada</span>
                                                                     <p className="font-bold text-sm">{new Date(moto.updated_at).toLocaleDateString()}</p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                                                            {!isRevertingConfirm ? (
                                                                <>
                                                                    {/* Grid de Informações Chave */}
                                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                                        <div className="bg-muted/50 p-3.5 rounded-xl border border-border flex flex-col justify-between">
                                                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                                                                <PaintBucket className="w-3.5 h-3.5 text-muted-foreground"/> Carenagem
                                                                            </span>
                                                                            <div className="flex items-center gap-2 mt-2">
                                                                                <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-700 shadow-sm" style={{backgroundColor: getHexColor(moto.cor)}}></div>
                                                                                <span className="font-bold text-sm text-foreground capitalize">{moto.cor}</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="bg-muted/50 p-3.5 rounded-xl border border-border flex flex-col justify-between">
                                                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                                                                <PaintBucket className="w-3.5 h-3.5 text-muted-foreground"/> Banco
                                                                            </span>
                                                                            <p className="font-bold text-sm text-foreground mt-2 capitalize">{moto.cor_banco || 'N/A'}</p>
                                                                        </div>
                                                                        <div className="bg-muted/50 p-3.5 rounded-xl border border-border flex flex-col justify-between">
                                                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                                                                <Calendar className="w-3.5 h-3.5 text-muted-foreground"/> Ano Modelo
                                                                            </span>
                                                                            <p className="font-bold text-sm text-foreground mt-2">{moto.ano}</p>
                                                                        </div>
                                                                        <div className="bg-muted/50 p-3.5 rounded-xl border border-border flex flex-col justify-between">
                                                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                                                                <Tag className="w-3.5 h-3.5 text-muted-foreground"/> Status
                                                                            </span>
                                                                            <Badge className="bg-emerald-500/10 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border-0 mt-2 text-[10px] w-fit px-2 py-0.5">
                                                                                ESTOQUE
                                                                            </Badge>
                                                                        </div>
                                                                    </div>

                                                                    {/* Fluxo de Rastreabilidade */}
                                                                    <div className="bg-muted/50 p-4 rounded-xl border border-border">
                                                                        <h4 className="text-xs font-black text-muted-foreground uppercase tracking-wider mb-4">Fluxo de Rastreabilidade</h4>
                                                                        
                                                                        <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-0">
                                                                            {/* Linha conectora de fundo */}
                                                                            <div className="absolute left-[15px] top-4 bottom-4 w-0.5 md:left-4 md:right-4 md:top-4 md:bottom-auto md:w-auto md:h-0.5 bg-muted z-0"></div>
                                                                            
                                                                            {/* Step 1: Montagem */}
                                                                            <div className="relative flex md:flex-col items-start md:items-center gap-3 md:gap-2 z-10 w-full md:w-1/4">
                                                                                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border-2 border-emerald-500 flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                                                                                     1
                                                                                </div>
                                                                                <div className="text-left md:text-center">
                                                                                    <p className="font-bold text-xs text-foreground">Montagem</p>
                                                                                    <p className="text-[10px] text-muted-foreground font-medium">Por: {moto.montador?.nome?.split(' ')[0] || 'N/A'}</p>
                                                                                    <p className="text-[9px] text-muted-foreground">{new Date(moto.created_at).toLocaleDateString()}</p>
                                                                                </div>
                                                                            </div>

                                                                            {/* Step 2: Controle QA */}
                                                                            <div className="relative flex md:flex-col items-start md:items-center gap-3 md:gap-2 z-10 w-full md:w-1/4">
                                                                                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border-2 border-emerald-500 flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                                                                                     2
                                                                                </div>
                                                                                <div className="text-left md:text-center">
                                                                                    <p className="font-bold text-xs text-foreground">Controle QA</p>
                                                                                    <p className="text-[10px] text-muted-foreground font-medium">Por: {moto.supervisor?.nome?.split(' ')[0] || 'N/A'}</p>
                                                                                </div>
                                                                            </div>

                                                                            {/* Step 3: Etiquetagem */}
                                                                            <div className="relative flex md:flex-col items-start md:items-center gap-3 md:gap-2 z-10 w-full md:w-1/4">
                                                                                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border-2 border-emerald-500 flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                                                                                     3
                                                                                </div>
                                                                                <div className="text-left md:text-center">
                                                                                    <p className="font-bold text-xs text-foreground">Etiquetagem</p>
                                                                                    <p className="text-[10px] text-muted-foreground font-medium">Etiqueta Aplicada</p>
                                                                                </div>
                                                                            </div>

                                                                            {/* Step 4: Estoque */}
                                                                            <div className="relative flex md:flex-col items-start md:items-center gap-3 md:gap-2 z-10 w-full md:w-1/4">
                                                                                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground border-2 border-primary flex items-center justify-center font-bold text-xs shadow-md shadow-blue-500/20 shrink-0">
                                                                                     4
                                                                                </div>
                                                                                <div className="text-left md:text-center">
                                                                                    <p className="font-bold text-xs text-info">Em Estoque</p>
                                                                                    <p className="text-[10px] text-muted-foreground font-medium truncate max-w-[120px]">{moto.localizacao || 'Pátio de Estoque'}</p>
                                                                                    <p className="text-[9px] text-muted-foreground">{new Date(moto.updated_at).toLocaleDateString()}</p>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Histórico de Qualidade */}
                                                                    <div className="space-y-4">
                                                                        <h4 className="text-xs font-black text-muted-foreground uppercase tracking-wider border-b border-border pb-2 flex items-center gap-1.5">
                                                                            <Wrench className="w-4 h-4 text-muted-foreground"/> Histórico de Qualidade & Reparos
                                                                        </h4>

                                                                        {motoDetalhes?.rework_count > 0 && (
                                                                            <div className="bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-300 p-4 rounded-xl flex items-start gap-3">
                                                                                <div className="p-1.5 bg-amber-500/20 rounded-lg text-amber-600 dark:text-amber-400 shrink-0">
                                                                                    <RotateCcw className="w-4 h-4"/>
                                                                                </div>
                                                                                <div>
                                                                                    <p className="text-sm font-bold">Retrabalhos na Linha</p>
                                                                                    <p className="text-xs text-amber-700/80 dark:text-amber-300/85 mt-0.5 leading-relaxed">
                                                                                        Este veículo retornou <strong className="text-amber-900 dark:text-amber-200">{motoDetalhes.rework_count}x</strong> para a linha de montagem para correções durante a inspeção.
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {motoDetalhes?.tecnico_reparo && (
                                                                            <div className="bg-info/10 border border-info/20 text-foreground/90 p-4 rounded-xl space-y-2">
                                                                                <div className="flex items-center gap-2 text-xs font-bold text-info uppercase tracking-wider">
                                                                                    <Wrench className="w-4 h-4"/> Último Reparo Concluído
                                                                                </div>
                                                                                <p className="text-xs text-muted-foreground leading-relaxed bg-card p-2.5 rounded-lg border border-border">
                                                                                    &quot;{motoDetalhes.observacoes || "Sem observações detalhadas registradas."}&quot;
                                                                                </p>
                                                                                <div className="text-[10px] text-muted-foreground">
                                                                                    Técnico Responsável: <strong className="text-muted-foreground">{motoDetalhes.tecnico_reparo}</strong>
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {historicoAvarias.length > 0 ? (
                                                                            <div className="space-y-3">
                                                                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Histórico Detalhado de Falhas</p>
                                                                                <div className="space-y-2.5 max-h-[200px] overflow-y-auto pr-1">
                                                                                    {historicoAvarias.map((av, idx) => (
                                                                                        <div key={idx} className="bg-red-500/5 dark:bg-red-500/5 p-3.5 rounded-xl border border-red-500/10 dark:border-red-500/10 text-sm">
                                                                                            <div className="flex justify-between items-start mb-1.5">
                                                                                                <span className="font-bold text-red-600 dark:text-red-400 capitalize text-[10px] bg-red-500/10 dark:bg-red-500/20 px-2 py-0.5 rounded-md">
                                                                                                    {av.tipo_avaria.replace('avaria_', '').replace('_', ' ')}
                                                                                                </span>
                                                                                                <span className="text-[10px] text-muted-foreground">{new Date(av.created_at).toLocaleDateString()}</span>
                                                                                            </div>
                                                                                            <p className="text-xs text-muted-foreground italic">&quot;{av.descricao_problema}&quot;</p>
                                                                                            
                                                                                            {av.descricao_solucao && (
                                                                                                <div className="mt-2.5 pt-2 border-t border-red-500/10 dark:border-red-500/10">
                                                                                                    <p className="text-xs text-emerald-600 dark:text-emerald-400 leading-relaxed">
                                                                                                        <strong className="font-bold">Solução Aplicada:</strong> {av.descricao_solucao}
                                                                                                    </p>
                                                                                                </div>
                                                                                            )}
                                                                                            {av.data_resolucao && (
                                                                                                <div className="mt-2 text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                                                                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500"/> Resolvido por <strong className="text-emerald-700 dark:text-emerald-300">{av.tecnico_nome}</strong> em {new Date(av.data_resolucao).toLocaleDateString()}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            !motoDetalhes?.rework_count && !motoDetalhes?.tecnico_reparo && (
                                                                                <div className="text-center py-8 text-muted-foreground bg-muted/50 rounded-xl border border-dashed border-border">
                                                                                    <CheckCircle2 className="w-10 h-10 mx-auto mb-2.5 text-emerald-500/50"/>
                                                                                    <p className="font-bold text-sm text-foreground/90">Veículo de Primeira Linha</p>
                                                                                    <p className="text-xs mt-0.5">Nenhum defeito ou retrabalho foi registrado para esta moto.</p>
                                                                                </div>
                                                                            )
                                                                        )}
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <div className="space-y-5 py-2 animate-in fade-in duration-300">
                                                                    <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl text-amber-800 dark:text-amber-300 flex gap-3">
                                                                        <AlertCircle className="w-6 h-6 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"/>
                                                                        <div>
                                                                             <h4 className="font-bold text-sm">Atenção: Reversão de Status</h4>
                                                                             <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                                                                  Ao reverter a moto para a etapa de Etiquetagem, ela sairá do Estoque Disponível e voltará para a fila de impressão. A sua localização será alterada para <strong>Pátio Montada (Aguardando Etiqueta)</strong>.
                                                                             </p>
                                                                        </div>
                                                                    </div>

                                                                    {/* Formulário de Reversão */}
                                                                    <div className="space-y-4">
                                                                         <div className="space-y-2">
                                                                              <label className="text-xs font-black text-muted-foreground uppercase tracking-wider">
                                                                                   Selecione o Motivo da Reversão
                                                                              </label>
                                                                              <Select value={reverterMotivo} onValueChange={setReverterMotivo}>
                                                                                   <SelectTrigger className="w-full h-11 border-border bg-card">
                                                                                        <SelectValue placeholder="Selecione um motivo..." />
                                                                                   </SelectTrigger>
                                                                                   <SelectContent>
                                                                                        <SelectItem value="etiqueta_danificada">Etiqueta física danificada ou ilegível</SelectItem>
                                                                                        <SelectItem value="erro_dados">Erro nos dados impressos na etiqueta</SelectItem>
                                                                                        <SelectItem value="defeito_detectado">Defeito físico ou visual detectado no estoque</SelectItem>
                                                                                        <SelectItem value="outro">Outro motivo (especificar abaixo)</SelectItem>
                                                                                   </SelectContent>
                                                                              </Select>
                                                                         </div>

                                                                         {reverterMotivo === "outro" && (
                                                                              <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                                                                                   <label className="text-xs font-black text-muted-foreground uppercase tracking-wider">
                                                                                        Especifique o Motivo
                                                                                   </label>
                                                                                   <Input 
                                                                                        placeholder="Digite o motivo detalhado..."
                                                                                        value={reverterMotivoCustom}
                                                                                        onChange={e => setReverterMotivoCustom(e.target.value)}
                                                                                        className="h-11 border-border bg-card"
                                                                                   />
                                                                              </div>
                                                                         )}

                                                                         {/* Declaração de Reversão */}
                                                                         <label className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-500/10 bg-amber-500/5 cursor-pointer select-none">
                                                                              <input 
                                                                                   type="checkbox"
                                                                                   checked={declaracaoReverter}
                                                                                   onChange={(e) => setDeclaracaoReverter(e.target.checked)}
                                                                                   className="mt-1 w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 dark:border-slate-700"
                                                                              />
                                                                              <span className="text-xs font-medium text-muted-foreground leading-normal">
                                                                                   Confirmo que esta moto deve retornar para a etapa de Etiquetagem e todas as áreas operacionais correspondentes serão notificadas desta alteração.
                                                                              </span>
                                                                         </label>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Footer com Ação de Reversão */}
                                                        <DialogFooter className="p-4 bg-muted/50 border-t border-border flex justify-between items-center w-full gap-2 sm:gap-0">
                                                            {!isRevertingConfirm ? (
                                                                <>
                                                                    {podeEditar ? (
                                                                    <Button 
                                                                        variant="outline" 
                                                                        onClick={() => setIsRevertingConfirm(true)}
                                                                        className="text-amber-600 border-amber-200 hover:bg-amber-50 dark:border-amber-900/40 dark:hover:bg-amber-950/40 font-bold flex items-center gap-2 h-10 mr-auto"
                                                                    >
                                                                        <RotateCcw className="w-4 h-4"/>
                                                                        Reverter para Etiquetagem
                                                                    </Button>
                                                                    ) : <span className="mr-auto" />}
                                                                    <Button variant="ghost" onClick={() => setMotoDetalhes(null)} className="h-10">
                                                                        Fechar
                                                                    </Button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Button 
                                                                        variant="ghost" 
                                                                        onClick={() => setIsRevertingConfirm(false)}
                                                                        className="h-10 text-muted-foreground font-bold"
                                                                        disabled={revertendo}
                                                                    >
                                                                        Voltar aos Detalhes
                                                                    </Button>
                                                                    <div className="flex gap-2">
                                                                         <Button variant="ghost" onClick={() => setMotoDetalhes(null)} className="h-10" disabled={revertendo}>
                                                                             Fechar
                                                                         </Button>
                                                                         <Button 
                                                                             onClick={() => handleReverterEtiquetagem(motoDetalhes)}
                                                                             disabled={!declaracaoReverter || (reverterMotivo === "outro" && !reverterMotivoCustom.trim()) || revertendo}
                                                                             className={`h-10 font-bold ${
                                                                                  declaracaoReverter && (reverterMotivo !== "outro" || reverterMotivoCustom.trim())
                                                                                       ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-600/20' 
                                                                                       : 'bg-slate-100 text-muted-foreground dark:bg-slate-800 dark:text-slate-600'
                                                                             }`}
                                                                         >
                                                                              {revertendo ? "Revertendo..." : "Confirmar Reversão"}
                                                                         </Button>
                                                                    </div>
                                                                </>
                                                            )}
                                                        </DialogFooter>
                                                    </DialogContent>
                                                </Dialog>

                                                {podeReimprimir && (
                                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => handleReimprimir(moto)} disabled={reimprimindo === moto.id} title="Reimprimir etiqueta" aria-label="Reimprimir etiqueta">
                                                      {reimprimindo === moto.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <Printer className="w-4 h-4"/>}
                                                  </Button>
                                                )}

                                                {podeEditar && (
                                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-warning" onClick={() => handleAbrirEditar(moto)} title="Editar moto" aria-label="Editar moto">
                                                      <Pencil className="w-4 h-4"/>
                                                  </Button>
                                                )}

                                                {podeExpedir && (
                                                  <Button size="sm" className="bg-success hover:bg-success/90 text-success-foreground h-8 text-xs font-bold" onClick={() => setMotoSaida(moto)}>
                                                      <Truck className="w-3 h-3 mr-2"/> EXPEDIR
                                                  </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>

        {/* Modal de Saída */}
        <Dialog open={!!motoSaida} onOpenChange={(open) => !open && !expedindo && setMotoSaida(null)}>
            <DialogContent className="bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Truck className="w-5 h-5 text-emerald-600"/> Confirmar Expedição</DialogTitle>
                    <DialogDescription>A moto sai do estoque disponível e fica registrada como expedida.</DialogDescription>
                </DialogHeader>
                <div className="py-2">
                    <p>Deseja dar baixa na moto <strong>{motoSaida?.modelo}</strong>?</p>
                    <div className="mt-2 bg-muted p-2 rounded text-sm font-mono text-muted-foreground">{motoSaida?.sku}</div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setMotoSaida(null)} disabled={expedindo}>Cancelar</Button>
                    <Button onClick={handleDarBaixa} disabled={expedindo} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        {expedindo ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Registrando...</> : "Confirmar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Modal de Edição QoL */}
        <Dialog open={!!motoEditando} onOpenChange={(open) => !open && setMotoEditando(null)}>
            <DialogContent className="bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="text-amber-600 flex items-center gap-2">
                        <Pencil className="w-5 h-5"/> Editar Informações da Moto
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="bg-muted/50 p-3 rounded-lg border border-border">
                        <p className="text-xs text-muted-foreground uppercase font-bold">Chassi (VIN / SKU)</p>
                        <p className="font-mono text-lg font-bold tracking-widest text-foreground">{motoEditando?.sku}</p>
                    </div>

                    <div className="flex items-center gap-4 border-b border-border pb-3">
                         <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                              <input 
                                   type="radio" 
                                   checked={!usarCustomModeloEdit} 
                                   onChange={() => setUsarCustomModeloEdit(false)} 
                                   className="text-primary focus:ring-ring"
                              />
                              Selecionar modelo do catálogo
                         </label>
                         <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                              <input 
                                   type="radio" 
                                   checked={usarCustomModeloEdit} 
                                   onChange={() => setUsarCustomModeloEdit(true)} 
                                   className="text-primary focus:ring-ring"
                              />
                              Digitar modelo manualmente
                         </label>
                    </div>

                    {!usarCustomModeloEdit ? (
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted-foreground uppercase">Modelo do Catálogo</label>
                            <Select onValueChange={setModeloEdit} value={modeloEdit}>
                                <SelectTrigger className="w-full">
                                     <SelectValue placeholder="Selecione um modelo..."/>
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                     {MODELOS_CADASTRADOS.map(m => (
                                          <SelectItem key={m} value={m}>{m}</SelectItem>
                                     ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted-foreground uppercase">Modelo Personalizado</label>
                            <Input 
                                 placeholder="Ex: SHI 175 EFI 2026..." 
                                 value={customModeloEdit} 
                                 onChange={e => setCustomModeloEdit(e.target.value)} 
                                 className="uppercase"
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted-foreground uppercase">Cor da Carenagem</label>
                            <Input 
                                 placeholder="Ex: Vermelha..." 
                                 value={corEdit} 
                                 onChange={e => setCorEdit(e.target.value)} 
                                 list="catalogo-cores-carenagem"
                            />
                            <datalist id="catalogo-cores-carenagem">
                                {configGeral.coresCarenagem.map(c => <option key={c.nome} value={c.nome}>{c.descricao}</option>)}
                            </datalist>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted-foreground uppercase">Cor do Banco</label>
                            <Input 
                                 placeholder="Ex: Preto..." 
                                 value={corBancoEdit} 
                                 onChange={e => setCorBancoEdit(e.target.value)} 
                                 list="catalogo-cores-banco"
                            />
                            <datalist id="catalogo-cores-banco">
                                {configGeral.coresBanco.map(c => <option key={c.nome} value={c.nome}>{c.descricao}</option>)}
                            </datalist>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setMotoEditando(null)}>Cancelar</Button>
                    <Button onClick={handleSalvarEdicao} className="bg-amber-600 hover:bg-amber-700 text-white" disabled={salvandoEdit}>
                        {salvandoEdit ? "Salvando..." : "Salvar Alterações"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

      </div>
  );
}