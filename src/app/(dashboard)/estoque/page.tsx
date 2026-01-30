"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { 
  Warehouse, Search, Filter, Truck, CheckCircle2, FileJson, Calendar, User, PaintBucket
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { registrarLog } from "@/lib/logger";

export default function EstoquePage() {
  const [motos, setMotos] = useState<any[]>([]);
  const [busca, setBusca] = useState("");
  const [motoSaida, setMotoSaida] = useState<any>(null); // Para o modal de saída

  useEffect(() => {
    fetchEstoque();
  }, []);

  async function fetchEstoque() {
    // Busca TUDO relacionado à moto (Montador, Supervisor, Histórico de Avarias se houver)
    const { data } = await supabase
      .from('motos')
      .select(`
        *,
        montador:funcionarios!motos_montador_id_fkey(nome),
        supervisor:funcionarios!motos_supervisor_id_fkey(nome)
      `)
      .eq('status', 'estoque')
      .order('updated_at', { ascending: false }); // As mais recentes no topo
    
    if (data) setMotos(data);
  }

  const handleDarBaixa = async () => {
    if (!motoSaida) return;

    // Ação de "Venda" ou "Transferência" -> Arquiva a moto (status = expedido)
    const { error } = await supabase.from('motos').update({
        status: 'expedido',
        localizacao: 'Expedido / Vendido',
        updated_at: new Date().toISOString()
    }).eq('id', motoSaida.id);

    if (!error) {
        toast.success("Saída registrada! Moto removida do estoque ativo.");
        await registrarLog('SAIDA_ESTOQUE', motoSaida.sku, { destino: 'Expedição' }); // Adicione SAIDA_ESTOQUE no logger.ts se quiser, ou use OUTRO
        setMotoSaida(null);
        fetchEstoque();
    }
  };

  const motosFiltradas = motos.filter(m => 
    m.sku.toLowerCase().includes(busca.toLowerCase()) || 
    m.modelo.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <RoleGuard allowedRoles={['gestor', 'master', 'supervisor']}>
      <div className="space-y-6 animate-in fade-in pb-20">
        
        <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-black text-emerald-600 flex items-center gap-3">
               <Warehouse className="w-8 h-8" /> Estoque Disponível
            </h1>
            <p className="text-slate-500">Motos prontas para faturamento e envio ({motos.length} unidades).</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
             <div className="relative flex-1 md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                    placeholder="Buscar chassi ou modelo..." 
                    className="pl-10" 
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                />
             </div>
          </div>
        </div>

        {/* VIEW EM TABELA (PARA VER DETALHES COMPLETOS) */}
        <Card>
            <CardContent className="p-0">
                <div className="rounded-md border border-slate-200 dark:border-slate-800">
                    <Table>
                        <TableHeader className="bg-slate-50 dark:bg-slate-900">
                            <TableRow>
                                <TableHead>Chassi (VIN)</TableHead>
                                <TableHead>Modelo</TableHead>
                                <TableHead>Cor</TableHead>
                                <TableHead>Entrada Estoque</TableHead>
                                <TableHead>Detalhes</TableHead>
                                <TableHead className="text-right">Ação</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {motosFiltradas.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-10 text-slate-400">
                                        Estoque vazio ou nenhum resultado.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                motosFiltradas.map((moto) => (
                                    <TableRow key={moto.id}>
                                        <TableCell className="font-mono font-bold text-slate-700 dark:text-slate-200">
                                            {moto.sku}
                                        </TableCell>
                                        <TableCell>{moto.modelo}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col text-xs">
                                                <span className="font-bold">{moto.cor}</span>
                                                <span className="text-slate-400">Banco: {moto.cor_banco}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Calendar className="w-3 h-3 text-slate-400"/>
                                                {new Date(moto.updated_at).toLocaleDateString()}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {/* MODAL DE DETALHES COMPLETOS */}
                                            <Dialog>
                                                <DialogTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                        <FileJson className="w-4 h-4 text-blue-500" />
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent className="max-w-lg">
                                                    <DialogHeader>
                                                        <DialogTitle>Ficha Técnica Digital</DialogTitle>
                                                    </DialogHeader>
                                                    <div className="grid grid-cols-2 gap-4 py-4 text-sm">
                                                        <div className="space-y-1">
                                                            <p className="text-xs font-bold text-slate-500 uppercase">Modelo</p>
                                                            <p className="font-bold">{moto.modelo}</p>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-xs font-bold text-slate-500 uppercase">Chassi</p>
                                                            <p className="font-mono">{moto.sku}</p>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-xs font-bold text-slate-500 uppercase">Montagem</p>
                                                            <p className="flex items-center gap-1"><User className="w-3 h-3"/> {moto.montador?.nome || 'N/A'}</p>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-xs font-bold text-slate-500 uppercase">Inspeção QA</p>
                                                            <p className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500"/> {moto.supervisor?.nome || 'N/A'}</p>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-xs font-bold text-slate-500 uppercase">Histórico</p>
                                                            <div className="flex gap-2">
                                                                {moto.rework_count > 0 ? (
                                                                    <Badge variant="destructive">Teve {moto.rework_count} Retrabalhos</Badge>
                                                                ) : (
                                                                    <Badge className="bg-green-100 text-green-700">Aprovada de 1ª</Badge>
                                                                )}
                                                                {moto.tecnico_reparo && <Badge variant="outline">Passou na Oficina</Badge>}
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="text-xs font-bold text-slate-500 uppercase">Local Atual</p>
                                                            <p>{moto.localizacao}</p>
                                                        </div>
                                                    </div>
                                                </DialogContent>
                                            </Dialog>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button 
                                                size="sm" 
                                                className="bg-slate-900 text-white hover:bg-emerald-600"
                                                onClick={() => setMotoSaida(moto)}
                                            >
                                                <Truck className="w-4 h-4 mr-2" /> Expedir
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>

        {/* MODAL DE CONFIRMAÇÃO DE SAÍDA */}
        <Dialog open={!!motoSaida} onOpenChange={(open) => !open && setMotoSaida(null)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Registrar Saída de Estoque</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <p className="text-slate-600 mb-4">
                        Você está prestes a dar baixa na moto <strong>{motoSaida?.modelo}</strong> (Chassi: {motoSaida?.sku}).
                    </p>
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded text-amber-800 text-sm">
                        ⚠️ Esta ação removerá a moto da lista de estoque ativo e a marcará como "Expedido/Vendido".
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setMotoSaida(null)}>Cancelar</Button>
                    <Button onClick={handleDarBaixa} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        Confirmar Saída
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

      </div>
    </RoleGuard>
  );
}