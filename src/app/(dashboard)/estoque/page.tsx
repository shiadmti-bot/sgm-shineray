"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { 
  Search, 
  MoreHorizontal, 
  FileDown, 
  Truck, 
  PackageCheck, 
  AlertCircle,
  Loader2,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Moto = {
  id: string;
  sku: string;
  modelo: string;
  status: string;
  created_at: string;
  montador?: string;
};

export default function EstoquePage() {
  const [motos, setMotos] = useState<Moto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");

  // Busca dados reais do Supabase
  async function fetchEstoque() {
    setLoading(true);
    const { data, error } = await supabase
      .from('motos')
      .select('*')
      .in('status', ['estoque', 'reservado', 'enviado']) // Traz tudo que já saiu da fábrica
      .order('created_at', { ascending: false }); // Mais recentes primeiro

    if (error) {
      console.error(error);
      toast.error("Erro ao carregar estoque");
    } else {
      setMotos(data as Moto[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchEstoque();
  }, []);

  // Função para mudar status (Ex: Enviar para loja)
  const handleStatusChange = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from('motos')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      toast.error("Erro ao atualizar status");
    } else {
      toast.success("Status atualizado!", { description: `Item movido para: ${newStatus.toUpperCase()}` });
      fetchEstoque(); // Recarrega a lista
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'estoque': return <Badge className="bg-green-600 hover:bg-green-700">Disponível</Badge>;
      case 'reservado': return <Badge className="bg-yellow-500 hover:bg-yellow-600">Reservado</Badge>;
      case 'enviado': return <Badge variant="secondary" className="text-slate-500">Expedido</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredData = motos.filter((item) =>
    item.modelo.toLowerCase().includes(filtro.toLowerCase()) ||
    item.sku.toLowerCase().includes(filtro.toLowerCase()) ||
    item.status.toLowerCase().includes(filtro.toLowerCase())
  );

  // Cálculos para os Cards de KPI
  const totalDisponivel = motos.filter(i => i.status === 'estoque').length;
  const totalReservado = motos.filter(i => i.status === 'reservado').length;
  const totalEnviado = motos.filter(i => i.status === 'enviado').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Estoque Final</h1>
          <p className="text-slate-500">Gestão de produtos acabados e expedição.</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={fetchEstoque} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" className="gap-2 text-green-700 border-green-200 hover:bg-green-50" onClick={() => toast.info("Funcionalidade futura", { description: "Aqui baixaria o Excel." })}>
            <FileDown className="h-4 w-4" /> Excel
            </Button>
        </div>
      </div>

      {/* Cards de KPI Conectados com Dados Reais */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disponível para Venda</CardTitle>
            <PackageCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDisponivel}</div>
            <p className="text-xs text-muted-foreground">Motos prontas no pátio</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reservadas / Em Trânsito</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalReservado}</div>
            <p className="text-xs text-muted-foreground">Aguardando faturamento</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expedido</CardTitle>
            <Truck className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEnviado}</div>
            <p className="text-xs text-muted-foreground">Histórico total</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Dados */}
      <div className="bg-white border rounded-lg shadow-sm">
        <div className="p-4 border-b flex items-center gap-4">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Filtrar por modelo, SKU ou status..." 
              className="pl-8"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Data</TableHead>
              <TableHead>Modelo / SKU</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">ID Sistema</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
               <TableRow>
                 <TableCell colSpan={5} className="h-24 text-center">
                    <div className="flex justify-center items-center gap-2">
                        <Loader2 className="animate-spin h-5 w-5 text-primary" />
                        <span>Carregando estoque...</span>
                    </div>
                 </TableCell>
               </TableRow>
            ) : filteredData.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                        Nenhum produto encontrado no estoque.
                    </TableCell>
                </TableRow>
            ) : (
                filteredData.map((moto) => (
                <TableRow key={moto.id}>
                    <TableCell className="font-medium text-xs text-slate-500">
                        {new Date(moto.created_at).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell>
                    <div className="flex flex-col">
                        <span className="font-bold text-slate-800">{moto.modelo}</span>
                        <span className="text-xs text-slate-500">{moto.sku}</span>
                    </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(moto.status)}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs font-mono text-slate-400">
                        {moto.id.slice(0, 8)}...
                    </TableCell>
                    <TableCell className="text-right">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Abrir menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Ações</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => navigator.clipboard.writeText(moto.id)}>
                            Copiar ID
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleStatusChange(moto.id, 'reservado')}>
                            Reservar (Faturamento)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(moto.id, 'enviado')} className="text-blue-600">
                            <Truck className="mr-2 h-4 w-4" /> Registrar Saída (Expedição)
                        </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    </TableCell>
                </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}