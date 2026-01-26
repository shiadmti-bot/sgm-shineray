"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  Search, Filter, MapPin, Calendar, Tag, Package, CheckCircle2, AlertTriangle 
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type MotoEstoque = {
  id: string;
  modelo: string;
  sku: string;
  status: 'estoque' | 'reprovado' | 'montagem' | 'qualidade' | 'enviado';
  localizacao: string;
  created_at: string;
  preco: number;
  observacoes: string | null;
  cor: string | null;
  ano: string | null;
};

export default function EstoquePage() {
  const [loading, setLoading] = useState(true);
  const [motos, setMotos] = useState<MotoEstoque[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  useEffect(() => {
    fetchEstoque();
  }, []);

  async function fetchEstoque() {
    setLoading(true);
    const { data } = await supabase
      .from('motos')
      .select('*')
      .in('status', ['estoque', 'reprovado', 'enviado']) 
      .order('created_at', { ascending: false });

    if (data) setMotos(data as MotoEstoque[]);
    setLoading(false);
  }

  const motosFiltradas = motos.filter(moto => {
    const termo = busca.toLowerCase();
    const matchTexto = 
      moto.modelo.toLowerCase().includes(termo) || 
      moto.sku.toLowerCase().includes(termo) ||
      (moto.localizacao && moto.localizacao.toLowerCase().includes(termo)) ||
      (moto.cor && moto.cor.toLowerCase().includes(termo));
    
    const matchStatus = filtroStatus === "todos" 
      ? true 
      : filtroStatus === "ok" 
        ? (moto.status === 'estoque' || moto.status === 'enviado')
        : moto.status === 'reprovado';

    return matchTexto && matchStatus;
  });

  const totalEstoque = motos.length;
  const totalOK = motos.filter(m => m.status === 'estoque' || m.status === 'enviado').length;
  const totalAvaria = motos.filter(m => m.status === 'reprovado').length;

  return (
    <RoleGuard allowedRoles={['gestor', 'master']}>
      <div className="space-y-6 animate-in fade-in duration-500 pb-10">
        
        {/* Cabeçalho */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Estoque de Motos</h1>
          <p className="text-slate-500 dark:text-slate-400">Visão geral do pátio e produtos finalizados.</p>
        </div>

        {/* KPIs - Adaptados para Light/Dark */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
             <div className="absolute right-0 top-0 h-full w-1 bg-blue-500"/>
             <CardContent className="p-6 flex justify-between items-center">
                <div>
                   <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">Total em Estoque</p>
                   <h2 className="text-4xl font-black mt-2 text-slate-900 dark:text-white">{totalEstoque}</h2>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl">
                   <Package className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
             </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
             <div className="absolute right-0 top-0 h-full w-1 bg-green-500"/>
             <CardContent className="p-6 flex justify-between items-center">
                <div>
                   <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">Aprovadas (OK)</p>
                   <h2 className="text-4xl font-black mt-2 text-green-600 dark:text-green-500">{totalOK}</h2>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-xl">
                   <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-500" />
                </div>
             </CardContent>
          </Card>

          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
             <div className="absolute right-0 top-0 h-full w-1 bg-amber-500"/>
             <CardContent className="p-6 flex justify-between items-center">
                <div>
                   <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">Com Avarias</p>
                   <h2 className="text-4xl font-black mt-2 text-amber-600 dark:text-amber-500">{totalAvaria}</h2>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl">
                   <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-500" />
                </div>
             </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <div className="flex flex-col md:flex-row gap-4 items-center bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
           <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Buscar por modelo, cor, chassi ou local..." 
                className="pl-10 h-11 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-500 transition-colors"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
           </div>
           <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-full md:w-[200px] h-11 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                 <div className="flex items-center text-slate-500 dark:text-slate-400">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Status" />
                 </div>
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                 <SelectItem value="todos">Todos</SelectItem>
                 <SelectItem value="ok">Apenas OK</SelectItem>
                 <SelectItem value="avaria">Com Avaria</SelectItem>
              </SelectContent>
           </Select>
        </div>

        {/* Grid de Cards */}
        {loading ? (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1,2,3].map(i => <Skeleton key={i} className="h-64 w-full rounded-2xl bg-slate-200 dark:bg-slate-800" />)}
           </div>
        ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {motosFiltradas.length === 0 ? (
                 <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400">
                    <Package className="w-12 h-12 mb-4 opacity-20" />
                    <p>Nenhuma moto encontrada com estes filtros.</p>
                 </div>
              ) : (
                 motosFiltradas.map((moto) => (
                    <Card key={moto.id} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-slate-700 transition-all group">
                       <CardHeader className="pb-3">
                          <div className="flex justify-between items-start">
                             <div className="space-y-1">
                                <CardTitle className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                    {moto.modelo}
                                </CardTitle>
                                {/* Tags de Cor e Ano */}
                                <div className="flex flex-wrap gap-2">
                                    {moto.cor && (
                                        <Badge variant="secondary" className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-normal">
                                            {moto.cor}
                                        </Badge>
                                    )}
                                    {moto.ano && (
                                        <Badge variant="outline" className="border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-normal">
                                            {moto.ano}
                                        </Badge>
                                    )}
                                </div>
                             </div>
                             
                             {moto.status === 'estoque' || moto.status === 'enviado' ? (
                                <Badge className="bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 border-0">
                                   OK
                                </Badge>
                             ) : (
                                <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 border-0">
                                   {moto.observacoes ? 'AVARIA' : 'REPROVADO'}
                                </Badge>
                             )}
                          </div>
                       </CardHeader>
                       
                       <CardContent className="space-y-4">
                          {/* Detalhes Técnicos */}
                          <div className="space-y-2 text-sm bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-100 dark:border-slate-800 transition-colors">
                             <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                    <Tag className="w-4 h-4" />
                                    <span>SKU</span>
                                </div>
                                <span className="font-mono font-medium text-slate-700 dark:text-slate-200">{moto.sku}</span>
                             </div>
                             
                             <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                    <MapPin className="w-4 h-4" />
                                    <span>Local</span>
                                </div>
                                <strong className="text-slate-900 dark:text-white">{moto.localizacao || "Pátio Geral"}</strong>
                             </div>

                             <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                    <Calendar className="w-4 h-4" />
                                    <span>Entrada</span>
                                </div>
                                <span className="text-slate-700 dark:text-slate-300">{new Date(moto.created_at).toLocaleDateString('pt-BR')}</span>
                             </div>
                          </div>

                          {moto.status === 'reprovado' && moto.observacoes && (
                             <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg text-red-600 dark:text-red-400 text-xs flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span className="font-medium">{moto.observacoes}</span>
                             </div>
                          )}

                          <div className="pt-2 flex justify-between items-end border-t border-slate-100 dark:border-slate-800 mt-2">
                             <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Valor Estimado</span>
                             <span className="text-lg font-bold text-slate-900 dark:text-white">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(moto.preco || 0)}
                             </span>
                          </div>
                       </CardContent>
                    </Card>
                 ))
              )}
           </div>
        )}
      </div>
    </RoleGuard>
  );
}