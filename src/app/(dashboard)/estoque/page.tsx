"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  Warehouse, Search, Filter, Truck, CheckCircle2, FileJson, Calendar, User, PaintBucket, Tag, AlertCircle, Wrench, RotateCcw, Pencil
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { registrarLog } from "@/lib/logger";
import { MODELOS_CADASTRADOS } from "@/lib/model-decoder";

const getHexColor = (colorName: string) => {
    if (!colorName) return '#94a3b8';
    const lower = colorName.toLowerCase();
    if (lower.includes('preta fosca')) return '#27272a';
    if (lower.includes('preta')) return '#000000';
    if (lower.includes('branca')) return '#ffffff';
    if (lower.includes('vermelha fosca')) return '#991b1b';
    if (lower.includes('vermelha')) return '#ef4444';
    if (lower.includes('azul fosco')) return '#1e3a8a';
    if (lower.includes('azul')) return '#3b82f6';
    if (lower.includes('amarela')) return '#eab308';
    if (lower.includes('verde')) return '#22c55e';
    if (lower.includes('bege')) return '#d6d3d1';
    if (lower.includes('prata')) return '#cbd5e1';
    if (lower.includes('nardo') || lower.includes('cinza')) return '#64748b';
    if (lower.includes('marrom')) return '#78350f';
    if (lower.includes('laranja')) return '#f97316';
    return '#94a3b8';
};

export default function EstoquePage() {
  const [motos, setMotos] = useState<any[]>([]);
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

  useEffect(() => {
    fetchEstoque();
  }, []);

  async function fetchEstoque() {
    const { data } = await supabase
      .from('motos')
      .select(`
        *,
        montador:funcionarios!motos_montador_id_fkey(nome),
        supervisor:funcionarios!motos_supervisor_id_fkey(nome)
      `)
      .eq('status', 'estoque')
      .order('updated_at', { ascending: false });
    
    if (data) setMotos(data);
  }

  const handleDarBaixa = async () => {
    if (!motoSaida) return;

    const { error } = await supabase.from('motos').update({
        status: 'expedido',
        localizacao: 'Expedido / Vendido',
        updated_at: new Date().toISOString()
    }).eq('id', motoSaida.id);

    if (!error) {
        toast.success("Saída registrada!");
        await registrarLog('SAIDA_ESTOQUE', motoSaida.sku, { destino: 'Expedição' });
        setMotoSaida(null);
        fetchEstoque();
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
          const { error } = await supabase
              .from('motos')
              .update({
                  status: 'aguardando_etiqueta',
                  localizacao: 'Pátio Montada (Aguardando Etiqueta)',
                  updated_at: new Date().toISOString()
              })
              .eq('id', moto.id);

          if (error) throw error;

          toast.success("Moto enviada de volta para Etiquetagem!");
          await registrarLog('EDICAO', moto.sku, { 
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
    const matchBusca = m.sku.toLowerCase().includes(busca.toLowerCase()) || m.modelo.toLowerCase().includes(busca.toLowerCase());
    const matchModelo = filtroModelo === "todos" || m.modelo === filtroModelo;
    const matchCor = filtroCor === "todas" || m.cor === filtroCor;
    return matchBusca && matchModelo && matchCor;
  });

  return (
    <RoleGuard allowedRoles={['gestor', 'master', 'supervisor']}>
      <div className="space-y-6 animate-in fade-in pb-20">
        
        {/* Header com Stats Rápidos */}
        <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-black text-emerald-600 flex items-center gap-3">
               <Warehouse className="w-8 h-8" /> Estoque Disponível
            </h1>
            <p className="text-slate-500">Gestão centralizada de inventário pronto.</p>
          </div>
          <div className="flex gap-2">
             <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 px-3 py-1">
                {motos.length} Unidades Totais
             </Badge>
             <Badge variant="outline" className="text-slate-700 border-slate-200 bg-slate-50 px-3 py-1">
                {modelosUnicos.length} Modelos
             </Badge>
          </div>
        </div>

        {/* Barra de Filtros Harmonizada */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row gap-4 shadow-sm">
            <div className="relative flex-1">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
               <Input 
                   placeholder="Buscar chassi ou modelo..." 
                   className="pl-10 h-10 border-slate-200 dark:border-slate-700" 
                   value={busca}
                   onChange={e => setBusca(e.target.value)}
               />
            </div>
            
            <div className="flex gap-2 w-full xl:w-auto">
                <Select value={filtroModelo} onValueChange={setFiltroModelo}>
                    <SelectTrigger className="w-full md:w-[240px] h-10 border-slate-200 dark:border-slate-700">
                        <Tag className="w-4 h-4 mr-2 text-slate-500"/>
                        <SelectValue placeholder="Filtrar Modelo" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="todos">Todos os Modelos</SelectItem>
                        {modelosUnicos.map(mod => <SelectItem key={mod} value={mod}>{mod}</SelectItem>)}
                    </SelectContent>
                </Select>

                <Select value={filtroCor} onValueChange={setFiltroCor}>
                    <SelectTrigger className="w-full md:w-[180px] h-10 border-slate-200 dark:border-slate-700">
                        <PaintBucket className="w-4 h-4 mr-2 text-slate-500"/>
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
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <Table>
                        <TableHeader className="bg-slate-50 dark:bg-slate-950/50">
                            <TableRow>
                                <TableHead>Identificação</TableHead>
                                <TableHead>Detalhes Visuais</TableHead>
                                <TableHead>Histórico</TableHead>
                                <TableHead>Origem</TableHead>
                                <TableHead className="text-right">Expedição</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {motosFiltradas.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-12 text-slate-400">
                                        <Warehouse className="w-12 h-12 mx-auto mb-3 opacity-20"/>
                                        Nenhuma moto encontrada com os filtros atuais.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                motosFiltradas.map((moto) => (
                                    <TableRow key={moto.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 group transition-colors">
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-900 dark:text-white">{moto.modelo}</span>
                                                <Badge variant="outline" className="w-fit mt-1 font-mono text-[10px] text-slate-500 border-slate-300">
                                                    {moto.sku}
                                                </Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full border-2 border-white shadow-sm flex items-center justify-center bg-slate-100 dark:bg-slate-800 relative z-0 before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-tr before:from-black/10 before:to-transparent" style={{backgroundColor: getHexColor(moto.cor)}}>
                                                    {/* Dot Visual */}
                                                </div>
                                                <div className="flex flex-col text-xs">
                                                    <span className="font-bold text-slate-700 dark:text-slate-300">{moto.cor}</span>
                                                    <span className="text-slate-400">Banco: {moto.cor_banco}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center text-xs text-slate-500">
                                                    <Calendar className="w-3 h-3 mr-1"/>
                                                    {new Date(moto.updated_at).toLocaleDateString()}
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
                                                <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400"><User className="w-3 h-3"/> Mont: {moto.montador?.nome.split(' ')[0]}</span>
                                                <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400"><CheckCircle2 className="w-3 h-3 text-green-500"/> QA: {moto.supervisor?.nome.split(' ')[0]}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Dialog open={!!motoDetalhes && motoDetalhes.id === moto.id} onOpenChange={(open) => !open && setMotoDetalhes(null)}>
                                                    <DialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50" onClick={() => handleVerDetalhes(moto)}>
                                                            <FileJson className="w-4 h-4"/>
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent className="max-w-2xl bg-white dark:bg-slate-950 p-0 overflow-hidden shadow-2xl rounded-2xl border border-slate-200/80 dark:border-slate-800">
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
                                                                        <div className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                                                                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                                                                <PaintBucket className="w-3.5 h-3.5 text-slate-450"/> Carenagem
                                                                            </span>
                                                                            <div className="flex items-center gap-2 mt-2">
                                                                                <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-700 shadow-sm" style={{backgroundColor: getHexColor(moto.cor)}}></div>
                                                                                <span className="font-bold text-sm text-slate-850 dark:text-slate-200 capitalize">{moto.cor}</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                                                                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                                                                <PaintBucket className="w-3.5 h-3.5 text-slate-450"/> Banco
                                                                            </span>
                                                                            <p className="font-bold text-sm text-slate-850 dark:text-slate-200 mt-2 capitalize">{moto.cor_banco || 'N/A'}</p>
                                                                        </div>
                                                                        <div className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                                                                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                                                                <Calendar className="w-3.5 h-3.5 text-slate-450"/> Ano Modelo
                                                                            </span>
                                                                            <p className="font-bold text-sm text-slate-850 dark:text-slate-200 mt-2">{moto.ano}</p>
                                                                        </div>
                                                                        <div className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                                                                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                                                                <Tag className="w-3.5 h-3.5 text-slate-455"/> Status
                                                                            </span>
                                                                            <Badge className="bg-emerald-500/10 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border-0 mt-2 text-[10px] w-fit px-2 py-0.5">
                                                                                ESTOQUE
                                                                            </Badge>
                                                                        </div>
                                                                    </div>

                                                                    {/* Fluxo de Rastreabilidade */}
                                                                    <div className="bg-slate-50 dark:bg-slate-900/30 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                                                                        <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">Fluxo de Rastreabilidade</h4>
                                                                        
                                                                        <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-0">
                                                                            {/* Linha conectora de fundo */}
                                                                            <div className="absolute left-[15px] top-4 bottom-4 w-0.5 md:left-4 md:right-4 md:top-4 md:bottom-auto md:w-auto md:h-0.5 bg-slate-200 dark:bg-slate-800 z-0"></div>
                                                                            
                                                                            {/* Step 1: Montagem */}
                                                                            <div className="relative flex md:flex-col items-start md:items-center gap-3 md:gap-2 z-10 w-full md:w-1/4">
                                                                                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border-2 border-emerald-500 flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                                                                                     1
                                                                                </div>
                                                                                <div className="text-left md:text-center">
                                                                                    <p className="font-bold text-xs text-slate-800 dark:text-slate-200">Montagem</p>
                                                                                    <p className="text-[10px] text-slate-505 font-medium">Por: {moto.montador?.nome?.split(' ')[0] || 'N/A'}</p>
                                                                                    <p className="text-[9px] text-slate-400">{new Date(moto.created_at).toLocaleDateString()}</p>
                                                                                </div>
                                                                            </div>

                                                                            {/* Step 2: Controle QA */}
                                                                            <div className="relative flex md:flex-col items-start md:items-center gap-3 md:gap-2 z-10 w-full md:w-1/4">
                                                                                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border-2 border-emerald-500 flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                                                                                     2
                                                                                </div>
                                                                                <div className="text-left md:text-center">
                                                                                    <p className="font-bold text-xs text-slate-800 dark:text-slate-200">Controle QA</p>
                                                                                    <p className="text-[10px] text-slate-550 font-medium">Por: {moto.supervisor?.nome?.split(' ')[0] || 'N/A'}</p>
                                                                                </div>
                                                                            </div>

                                                                            {/* Step 3: Etiquetagem */}
                                                                            <div className="relative flex md:flex-col items-start md:items-center gap-3 md:gap-2 z-10 w-full md:w-1/4">
                                                                                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border-2 border-emerald-500 flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                                                                                     3
                                                                                </div>
                                                                                <div className="text-left md:text-center">
                                                                                    <p className="font-bold text-xs text-slate-800 dark:text-slate-200">Etiquetagem</p>
                                                                                    <p className="text-[10px] text-slate-550 font-medium">Etiqueta Aplicada</p>
                                                                                </div>
                                                                            </div>

                                                                            {/* Step 4: Estoque */}
                                                                            <div className="relative flex md:flex-col items-start md:items-center gap-3 md:gap-2 z-10 w-full md:w-1/4">
                                                                                <div className="w-8 h-8 rounded-full bg-blue-600 text-white border-2 border-blue-500 flex items-center justify-center font-bold text-xs shadow-md shadow-blue-500/20 shrink-0">
                                                                                     4
                                                                                </div>
                                                                                <div className="text-left md:text-center">
                                                                                    <p className="font-bold text-xs text-blue-600 dark:text-blue-400">Em Estoque</p>
                                                                                    <p className="text-[10px] text-slate-500 font-medium truncate max-w-[120px]">{moto.localizacao || 'Pátio de Estoque'}</p>
                                                                                    <p className="text-[9px] text-slate-400">{new Date(moto.updated_at).toLocaleDateString()}</p>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Histórico de Qualidade */}
                                                                    <div className="space-y-4">
                                                                        <h4 className="text-xs font-black text-slate-400 dark:text-slate-550 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-1.5">
                                                                            <Wrench className="w-4 h-4 text-slate-400"/> Histórico de Qualidade & Reparos
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
                                                                            <div className="bg-blue-500/5 border border-blue-500/10 text-slate-700 dark:text-slate-300 p-4 rounded-xl space-y-2">
                                                                                <div className="flex items-center gap-2 text-xs font-bold text-blue-650 dark:text-blue-400 uppercase tracking-wider">
                                                                                    <Wrench className="w-4 h-4"/> Último Reparo Concluído
                                                                                </div>
                                                                                <p className="text-xs text-slate-650 dark:text-slate-350 leading-relaxed bg-white dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/80">
                                                                                    "{motoDetalhes.observacoes || "Sem observações detalhadas registradas."}"
                                                                                </p>
                                                                                <div className="text-[10px] text-slate-405">
                                                                                    Técnico Responsável: <strong className="text-slate-600 dark:text-slate-300">{motoDetalhes.tecnico_reparo}</strong>
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {historicoAvarias.length > 0 ? (
                                                                            <div className="space-y-3">
                                                                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Histórico Detalhado de Falhas</p>
                                                                                <div className="space-y-2.5 max-h-[200px] overflow-y-auto pr-1">
                                                                                    {historicoAvarias.map((av, idx) => (
                                                                                        <div key={idx} className="bg-red-500/5 dark:bg-red-500/5 p-3.5 rounded-xl border border-red-500/10 dark:border-red-500/10 text-sm">
                                                                                            <div className="flex justify-between items-start mb-1.5">
                                                                                                <span className="font-bold text-red-650 dark:text-red-400 capitalize text-[10px] bg-red-500/10 dark:bg-red-500/20 px-2 py-0.5 rounded-md">
                                                                                                    {av.tipo_avaria.replace('avaria_', '').replace('_', ' ')}
                                                                                                </span>
                                                                                                <span className="text-[10px] text-slate-400">{new Date(av.created_at).toLocaleDateString()}</span>
                                                                                            </div>
                                                                                            <p className="text-xs text-slate-650 dark:text-slate-350 italic">"{av.descricao_problema}"</p>
                                                                                            
                                                                                            {av.descricao_solucao && (
                                                                                                <div className="mt-2.5 pt-2 border-t border-red-500/10 dark:border-red-500/10">
                                                                                                    <p className="text-xs text-emerald-650 dark:text-emerald-450 leading-relaxed">
                                                                                                        <strong className="font-bold">Solução Aplicada:</strong> {av.descricao_solucao}
                                                                                                    </p>
                                                                                                </div>
                                                                                            )}
                                                                                            {av.data_resolucao && (
                                                                                                <div className="mt-2 text-[10px] text-emerald-650 dark:text-emerald-450 flex items-center gap-1.5">
                                                                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500"/> Resolvido por <strong className="text-emerald-700 dark:text-emerald-350">{av.tecnico_nome}</strong> em {new Date(av.data_resolucao).toLocaleDateString()}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            !motoDetalhes?.rework_count && !motoDetalhes?.tecnico_reparo && (
                                                                                <div className="text-center py-8 text-slate-400 dark:text-slate-550 bg-slate-50 dark:bg-slate-900/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                                                                                    <CheckCircle2 className="w-10 h-10 mx-auto mb-2.5 text-emerald-500/50"/>
                                                                                    <p className="font-bold text-sm text-slate-705 dark:text-slate-300">Veículo de Primeira Linha</p>
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
                                                                             <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                                                                                  Ao reverter a moto para a etapa de Etiquetagem, ela sairá do Estoque Disponível e voltará para a fila de impressão. A sua localização será alterada para <strong>Pátio Montada (Aguardando Etiqueta)</strong>.
                                                                             </p>
                                                                        </div>
                                                                    </div>

                                                                    {/* Formulário de Reversão */}
                                                                    <div className="space-y-4">
                                                                         <div className="space-y-2">
                                                                              <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                                                                   Selecione o Motivo da Reversão
                                                                              </label>
                                                                              <Select value={reverterMotivo} onValueChange={setReverterMotivo}>
                                                                                   <SelectTrigger className="w-full h-11 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
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
                                                                                   <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                                                                        Especifique o Motivo
                                                                                   </label>
                                                                                   <Input 
                                                                                        placeholder="Digite o motivo detalhado..."
                                                                                        value={reverterMotivoCustom}
                                                                                        onChange={e => setReverterMotivoCustom(e.target.value)}
                                                                                        className="h-11 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                                                                                   />
                                                                              </div>
                                                                         )}

                                                                         {/* Declaração de Reversão */}
                                                                         <label className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-500/10 bg-amber-500/5 cursor-pointer select-none">
                                                                              <input 
                                                                                   type="checkbox"
                                                                                   checked={declaracaoReverter}
                                                                                   onChange={(e) => setDeclaracaoReverter(e.target.checked)}
                                                                                   className="mt-1 w-4 h-4 rounded text-amber-655 focus:ring-amber-500 border-slate-350 dark:border-slate-700"
                                                                              />
                                                                              <span className="text-xs font-medium text-slate-650 dark:text-slate-300 leading-normal">
                                                                                   Confirmo que esta moto deve retornar para a etapa de Etiquetagem e todas as áreas operacionais correspondentes serão notificadas desta alteração.
                                                                              </span>
                                                                         </label>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Footer com Ação de Reversão */}
                                                        <DialogFooter className="p-4 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center w-full gap-2 sm:gap-0">
                                                            {!isRevertingConfirm ? (
                                                                <>
                                                                    <Button 
                                                                        variant="outline" 
                                                                        onClick={() => setIsRevertingConfirm(true)}
                                                                        className="text-amber-600 border-amber-200 hover:bg-amber-50 dark:border-amber-900/40 dark:hover:bg-amber-950/40 font-bold flex items-center gap-2 h-10 mr-auto"
                                                                    >
                                                                        <RotateCcw className="w-4 h-4"/>
                                                                        Reverter para Etiquetagem
                                                                    </Button>
                                                                    <Button variant="ghost" onClick={() => setMotoDetalhes(null)} className="h-10">
                                                                        Fechar
                                                                    </Button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Button 
                                                                        variant="ghost" 
                                                                        onClick={() => setIsRevertingConfirm(false)}
                                                                        className="h-10 text-slate-550 dark:text-slate-400 font-bold"
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
                                                                                       : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600'
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

                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-amber-600 hover:bg-amber-50" onClick={() => handleAbrirEditar(moto)} title="Editar Moto">
                                                    <Pencil className="w-4 h-4"/>
                                                </Button>
                                                
                                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs font-bold" onClick={() => setMotoSaida(moto)}>
                                                    <Truck className="w-3 h-3 mr-2"/> EXPEDIR
                                                </Button>
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
        <Dialog open={!!motoSaida} onOpenChange={(open) => !open && setMotoSaida(null)}>
            <DialogContent>
                <DialogHeader><DialogTitle>Confirmar Expedição</DialogTitle></DialogHeader>
                <div className="py-4">
                    <p>Deseja dar baixa na moto <strong>{motoSaida?.modelo}</strong>?</p>
                    <div className="mt-2 bg-slate-100 p-2 rounded text-sm font-mono text-slate-600">{motoSaida?.sku}</div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setMotoSaida(null)}>Cancelar</Button>
                    <Button onClick={handleDarBaixa} className="bg-emerald-600 text-white">Confirmar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Modal de Edição QoL */}
        <Dialog open={!!motoEditando} onOpenChange={(open) => !open && setMotoEditando(null)}>
            <DialogContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                <DialogHeader>
                    <DialogTitle className="text-amber-600 flex items-center gap-2">
                        <Pencil className="w-5 h-5"/> Editar Informações da Moto
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                        <p className="text-xs text-slate-400 uppercase font-bold">Chassi (VIN / SKU)</p>
                        <p className="font-mono text-lg font-bold tracking-widest text-slate-800 dark:text-slate-100">{motoEditando?.sku}</p>
                    </div>

                    <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                         <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                              <input 
                                   type="radio" 
                                   checked={!usarCustomModeloEdit} 
                                   onChange={() => setUsarCustomModeloEdit(false)} 
                                   className="text-blue-600 focus:ring-blue-500"
                              />
                              Selecionar modelo do catálogo
                         </label>
                         <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                              <input 
                                   type="radio" 
                                   checked={usarCustomModeloEdit} 
                                   onChange={() => setUsarCustomModeloEdit(true)} 
                                   className="text-blue-600 focus:ring-blue-500"
                              />
                              Digitar modelo manualmente
                         </label>
                    </div>

                    {!usarCustomModeloEdit ? (
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase">Modelo do Catálogo</label>
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
                            <label className="text-xs font-bold text-slate-400 uppercase">Modelo Personalizado</label>
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
                            <label className="text-xs font-bold text-slate-400 uppercase">Cor da Carenagem</label>
                            <Input 
                                 placeholder="Ex: Vermelha..." 
                                 value={corEdit} 
                                 onChange={e => setCorEdit(e.target.value)} 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase">Cor do Banco</label>
                            <Input 
                                 placeholder="Ex: Preto..." 
                                 value={corBancoEdit} 
                                 onChange={e => setCorBancoEdit(e.target.value)} 
                            />
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
    </RoleGuard>
  );
}