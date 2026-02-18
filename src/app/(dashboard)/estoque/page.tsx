"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  Warehouse, Search, Filter, Truck, CheckCircle2, FileJson, Calendar, User, PaintBucket, Tag, AlertCircle, Wrench, RotateCcw
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

export default function EstoquePage() {
  const [motos, setMotos] = useState<any[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroModelo, setFiltroModelo] = useState("todos");
  const [filtroCor, setFiltroCor] = useState("todas");
  const [motoSaida, setMotoSaida] = useState<any>(null);
  
  // Estados para Detalhes
  const [motoDetalhes, setMotoDetalhes] = useState<any>(null);
  const [historicoAvarias, setHistoricoAvarias] = useState<any[]>([]);

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

      // Busca histórico de avarias desta moto
      const { data } = await supabase
        .from('historico_avarias')
        .select('*')
        .eq('moto_id', moto.id)
        .order('created_at', { ascending: false });

      if (data) setHistoricoAvarias(data);
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
                                    <div className="w-3 h-3 rounded-full border border-slate-200" style={{backgroundColor: cor === 'Preta' ? '#000' : cor === 'Vermelha' ? '#ef4444' : cor === 'Branca' ? '#fff' : '#94a3b8'}}></div>
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
                                                <div className="w-8 h-8 rounded-full border-2 border-white shadow-sm flex items-center justify-center" style={{backgroundColor: moto.cor === 'Preta' ? '#000' : moto.cor === 'Vermelha' ? '#ef4444' : moto.cor === 'Branca' ? '#f1f5f9' : '#94a3b8'}}>
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
                                                    <DialogContent className="max-w-2xl bg-white dark:bg-slate-950">
                                                        <DialogHeader>
                                                            <DialogTitle className="flex items-center gap-2">
                                                                <FileJson className="w-5 h-5 text-blue-600"/>
                                                                Ficha Técnica: {moto.modelo}
                                                            </DialogTitle>
                                                        </DialogHeader>
                                                        
                                                        <div className="grid grid-cols-2 gap-4 text-sm mt-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                                                            <div className="space-y-1"><p className="text-xs font-bold uppercase text-slate-500">Chassi (VIN)</p><p className="font-mono text-lg font-bold">{moto.sku}</p></div>
                                                            <div className="space-y-1"><p className="text-xs font-bold uppercase text-slate-500">Cores</p><div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full border border-slate-200" style={{backgroundColor: moto.cor === 'Preta' ? '#000' : moto.cor === 'Vermelha' ? '#ef4444' : moto.cor === 'Branca' ? '#fff' : '#94a3b8'}}></div> <p>{moto.cor} / {moto.cor_banco}</p></div></div>
                                                            <div className="space-y-1"><p className="text-xs font-bold uppercase text-slate-500">Local Atual</p><p className="font-medium">{moto.localizacao}</p></div>
                                                            <div className="space-y-1"><p className="text-xs font-bold uppercase text-slate-500">Data de Entrada</p><p>{new Date(moto.created_at).toLocaleString()}</p></div>
                                                            <div className="space-y-1"><p className="text-xs font-bold uppercase text-slate-500">Montador</p><p>{moto.montador?.nome || 'N/A'}</p></div>
                                                            <div className="space-y-1"><p className="text-xs font-bold uppercase text-slate-500">QA Supervisor</p><p>{moto.supervisor?.nome || 'N/A'}</p></div>
                                                        </div>

                                                        {/* Seção de Avarias e Retrabalhos */}
                                                        <div className="mt-4 space-y-3">
                                                            <h4 className="text-sm font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                                                                <Wrench className="w-4 h-4"/> Histórico de Qualidade
                                                            </h4>
                                                            
                                                            {motoDetalhes?.rework_count > 0 && (
                                                                <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-100 dark:border-amber-800 flex items-center gap-3">
                                                                    <RotateCcw className="w-5 h-5 text-amber-600"/>
                                                                    <div className="text-sm">
                                                                        <span className="font-bold text-amber-700 dark:text-amber-400">Retrabalho Registrado</span>
                                                                        <p className="text-slate-600 dark:text-slate-400 text-xs">Esta moto retornou <strong>{motoDetalhes.rework_count}x</strong> para a linha de montagem.</p>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Exibe reparo armazenado na própria moto (Backup ou Legado) */}
                                                            {motoDetalhes?.tecnico_reparo && (
                                                                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800 text-sm">
                                                                    <div className="flex items-center gap-2 mb-1 font-bold text-blue-700 dark:text-blue-400">
                                                                        <Wrench className="w-4 h-4"/> Último Reparo (Oficina)
                                                                    </div>
                                                                    <p className="text-slate-600 dark:text-slate-300">
                                                                        {motoDetalhes.observacoes || "Sem detalhes adicionais."}
                                                                    </p>
                                                                    <div className="mt-2 text-xs text-blue-600 dark:text-blue-500 font-mono">
                                                                        Técnico: {motoDetalhes.tecnico_reparo}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {historicoAvarias.length > 0 ? (
                                                                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                                                                    {historicoAvarias.map((av, idx) => (
                                                                        <div key={idx} className="bg-red-50 dark:bg-red-900/10 p-3 rounded-lg border border-red-100 dark:border-red-900/30 text-sm">
                                                                            <div className="flex justify-between items-start mb-1">
                                                                                <span className="font-bold text-red-700 dark:text-red-400 capitalize">{av.tipo_avaria.replace('avaria_', '').replace('_', ' ')}</span>
                                                                                <span className="text-[10px] text-slate-400">{new Date(av.created_at).toLocaleDateString()}</span>
                                                                            </div>
                                                                            <p className="text-slate-600 dark:text-slate-300">"{av.descricao_problema}"</p>
                                                                            {av.descricao_solucao && (
                                                                                <p className="text-xs text-green-700 dark:text-green-400 mt-1 pl-2 border-l-2 border-green-200 dark:border-green-800">
                                                                                    <strong>Solução:</strong> {av.descricao_solucao}
                                                                                </p>
                                                                            )}
                                                                            {av.data_resolucao && (
                                                                                <div className="mt-2 pt-2 border-t border-red-100 dark:border-red-900/30 flex items-center gap-2 text-xs text-green-700 dark:text-green-500">
                                                                                    <CheckCircle2 className="w-3 h-3"/> Resolvido por {av.tecnico_nome} em {new Date(av.data_resolucao).toLocaleDateString()}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                !motoDetalhes?.rework_count && !motoDetalhes?.tecnico_reparo && (
                                                                    <div className="text-center py-4 text-slate-400 text-sm bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                                                                        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-20"/>
                                                                        Nenhuma avaria ou defeito registrado.
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    </DialogContent>
                                                </Dialog>
                                                
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

      </div>
    </RoleGuard>
  );
}