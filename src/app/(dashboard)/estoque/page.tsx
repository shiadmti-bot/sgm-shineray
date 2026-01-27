"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  Search, Filter, MapPin, Tag, Package, Printer, History, User, Ban, 
  UserCheck, Timer, CheckCircle2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Função Helper para formatar duração
const formatarDuracao = (inicio: string | null, fim: string | null) => {
    if (!inicio || !fim) return "--:--";
    const diff = new Date(fim).getTime() - new Date(inicio).getTime();
    const horas = Math.floor(diff / 3600000);
    const minutos = Math.floor((diff % 3600000) / 60000);
    return horas > 0 ? `${horas}h ${minutos}m` : `${minutos} min`;
};

type MotoEstoque = {
  id: string;
  modelo: string;
  sku: string;
  status: string;
  localizacao: string;
  created_at: string;
  updated_at: string;
  inicio_montagem: string | null;
  fim_montagem: string | null;
  cor: string | null;
  ano: string | null;
  detalhes_avaria: string | null;
  montador: { nome: string } | null;
  supervisor: { nome: string } | null; // Quem aprovou
};

export default function EstoquePage() {
  const [loading, setLoading] = useState(true);
  const [motos, setMotos] = useState<MotoEstoque[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("aprovado");

  useEffect(() => {
    fetchEstoque();
  }, [filtroStatus]);

  async function fetchEstoque() {
    setLoading(true);
    
    let query = supabase
      .from('motos')
      .select(`
        *,
        montador:funcionarios!montador_id(nome),
        supervisor:funcionarios!supervisor_id(nome)
      `)
      .order('updated_at', { ascending: false });

    if (filtroStatus === 'aprovado') {
        query = query.eq('status', 'aprovado');
    } else if (filtroStatus === 'processo') {
        query = query.in('status', ['aguardando_montagem', 'em_producao', 'em_analise', 'retrabalho_montagem']);
    } else if (filtroStatus === 'avaria') {
        query = query.in('status', ['avaria_mecanica', 'avaria_pintura', 'avaria_estrutura', 'avaria_pecas']);
    }

    const { data, error } = await query;

    if (error) {
        toast.error("Erro ao carregar estoque.");
    } else {
        setMotos(data as MotoEstoque[]);
    }
    setLoading(false);
  }

  const motosFiltradas = motos.filter(moto => {
    const termo = busca.toLowerCase();
    return (
      moto.modelo.toLowerCase().includes(termo) || 
      moto.sku.toLowerCase().includes(termo) ||
      (moto.localizacao && moto.localizacao.toLowerCase().includes(termo))
    );
  });

  const handleImprimirEtiqueta = (moto: MotoEstoque) => {
      window.print(); 
      toast.success(`Enviado para impressora: ${moto.sku}`);
  };

  const getStatusStyle = (status: string) => {
      switch(status) {
          case 'aprovado': return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
          case 'aguardando_montagem': return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
          case 'em_producao': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
          case 'em_analise': return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800';
          case 'retrabalho_montagem': return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800';
          default: return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
      }
  };

  return (
    <RoleGuard allowedRoles={['gestor', 'master', 'supervisor']}>
      <div className="space-y-6 animate-in fade-in duration-500 pb-20">
        
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Estoque & Rastreio</h1>
          <p className="text-slate-500 dark:text-slate-400">Gerenciamento global de ativos e situação de pátio.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-center bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
           <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Buscar por chassi, modelo ou cor..." 
                className="pl-10 h-11 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
           </div>
           
           <div className="flex items-center gap-2 w-full md:w-auto">
               <span className="text-sm font-medium text-slate-500 whitespace-nowrap hidden md:block">Mostrar:</span>
               <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                  <SelectTrigger className="w-full md:w-[220px] h-11 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                     <div className="flex items-center text-slate-700 dark:text-slate-300">
                        <Filter className="w-4 h-4 mr-2" />
                        <SelectValue />
                     </div>
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                     <SelectItem value="aprovado">✅ Aprovadas (Prontas)</SelectItem>
                     <SelectItem value="processo">⚙️ Em Produção (WIP)</SelectItem>
                     <SelectItem value="avaria">🚨 Avarias / Bloqueadas</SelectItem>
                     <SelectItem value="todos">🌍 Tudo</SelectItem>
                  </SelectContent>
               </Select>
           </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-500">
            <Package className="w-4 h-4" />
            <span>Exibindo <strong>{motosFiltradas.length}</strong> registros</span>
        </div>

        {loading ? (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1,2,3].map(i => <Skeleton key={i} className="h-64 w-full rounded-2xl bg-slate-200 dark:bg-slate-800" />)}
           </div>
        ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {motosFiltradas.length === 0 ? (
                 <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400">
                    <Package className="w-16 h-16 mb-4 opacity-20" />
                    <p>Nenhum registro encontrado neste filtro.</p>
                 </div>
              ) : (
                 motosFiltradas.map((moto) => (
                    <Card key={moto.id} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-slate-700 transition-all group overflow-hidden">
                       
                       <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                           moto.status === 'aprovado' ? 'bg-green-500' :
                           moto.status.includes('avaria') ? 'bg-red-500' :
                           'bg-blue-500'
                       }`} />

                       <CardHeader className="pb-3 pl-6">
                          <div className="flex justify-between items-start">
                             <div className="space-y-1">
                                <CardTitle className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                    {moto.modelo}
                                </CardTitle>
                                <div className="flex flex-wrap gap-2">
                                    <Badge variant="outline" className="border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-normal text-[10px]">
                                        {moto.ano || '2026'}
                                    </Badge>
                                    <Badge variant="secondary" className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px]">
                                        {formatarDuracao(moto.inicio_montagem, moto.fim_montagem)} de montagem
                                    </Badge>
                                </div>
                             </div>
                             
                             <Badge className={`border-0 uppercase text-[10px] ${getStatusStyle(moto.status)}`}>
                                {moto.status.replace('_', ' ')}
                             </Badge>
                          </div>
                       </CardHeader>
                       
                       <CardContent className="space-y-4 pl-6">
                          {/* Detalhes Técnicos Ricos */}
                          <div className="space-y-2 text-sm bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-100 dark:border-slate-800 transition-colors">
                             <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
                                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                    <Tag className="w-3 h-3" />
                                    <span>Chassi / SKU</span>
                                </div>
                                <span className="font-mono font-medium text-slate-700 dark:text-slate-200 tracking-wider">
                                    {moto.sku}
                                </span>
                             </div>
                             
                             <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                    <MapPin className="w-3 h-3" />
                                    <span>Local</span>
                                </div>
                                <strong className="text-slate-900 dark:text-white">{moto.localizacao || "Fábrica"}</strong>
                             </div>

                             {/* Montador */}
                             <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                    <User className="w-3 h-3" />
                                    <span>Montador</span>
                                </div>
                                <span className="text-slate-700 dark:text-slate-300">{moto.montador?.nome.split(' ')[0] || '-'}</span>
                             </div>

                             {/* NOVO: Aprovador (Supervisor) */}
                             {moto.supervisor && (
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-bold">
                                        <UserCheck className="w-3 h-3" />
                                        <span>Aprovado por</span>
                                    </div>
                                    <span className="text-green-700 dark:text-green-300 font-bold">{moto.supervisor.nome.split(' ')[0]}</span>
                                </div>
                             )}
                          </div>

                          {moto.status.includes('avaria') && moto.detalhes_avaria && (
                             <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg text-red-600 dark:text-red-400 text-xs flex items-start gap-2">
                                <Ban className="w-4 h-4 mt-0.5 shrink-0" />
                                <span className="font-medium">"{moto.detalhes_avaria}"</span>
                             </div>
                          )}

                          <div className="pt-2 flex justify-between items-center border-t border-slate-100 dark:border-slate-800 mt-2">
                             <div className="flex items-center text-xs text-slate-400 gap-1">
                                <History className="w-3 h-3" />
                                {new Date(moto.updated_at).toLocaleDateString()}
                             </div>

                             {moto.status === 'aprovado' && (
                                 <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    className="h-8 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                    onClick={() => handleImprimirEtiqueta(moto)}
                                    title="Reimprimir Etiqueta"
                                 >
                                     <Printer className="w-4 h-4" />
                                 </Button>
                             )}
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