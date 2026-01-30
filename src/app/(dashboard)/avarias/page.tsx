"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { Wrench, AlertOctagon, CheckCircle2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { registrarLog } from "@/lib/logger";

export default function AvariasPage() {
  const [motos, setMotos] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [motoAtiva, setMotoAtiva] = useState<any>(null);
  
  const [tecnico, setTecnico] = useState("");
  const [solucao, setSolucao] = useState("");

  useEffect(() => {
    fetchAvarias();
  }, []);

  async function fetchAvarias() {
    const { data } = await supabase
      .from('motos')
      .select(`*, montador:funcionarios!motos_montador_id_fkey(nome)`)
      .like('status', 'avaria_%') // Pega tudo que começa com avaria_
      .order('updated_at', { ascending: false });
    
    if (data) setMotos(data);
  }

  const handleReparo = async () => {
    if (!tecnico || !solucao) return toast.warning("Preencha Técnico e Solução");

    // 1. Fecha o histórico
    await supabase.from('historico_avarias').update({
        tecnico_nome: tecnico,
        descricao_solucao: solucao,
        data_resolucao: new Date().toISOString(),
        status_ticket: 'resolvido'
    }).eq('moto_id', motoAtiva.id).eq('status_ticket', 'pendente');

    // 2. Devolve para Qualidade
    await supabase.from('motos').update({
        status: 'em_analise',
        localizacao: 'Pátio Qualidade (Retorno Avaria)',
        tecnico_reparo: tecnico,
        detalhes_avaria: null,
        observacoes: `REPARO (${tecnico}): ${solucao}`
    }).eq('id', motoAtiva.id);

    await registrarLog('REPARO_OFICINA', motoAtiva.sku, { tecnico, solucao });
    toast.success("Reparo realizado! Enviada para reinspeção.");
    setModalOpen(false);
    fetchAvarias();
  };

  return (
    <RoleGuard allowedRoles={['supervisor', 'gestor', 'master']}>
      <div className="space-y-6 animate-in fade-in">
        <h1 className="text-3xl font-black text-red-600 flex items-center gap-3">
           <Wrench className="w-8 h-8" /> Pátio de Avarias
        </h1>
        <p className="text-slate-500">Gestão detalhada de motos segregadas para manutenção.</p>

        <div className="grid grid-cols-1 gap-4">
            {motos.length === 0 ? <p className="text-slate-400">Pátio limpo.</p> : motos.map(moto => (
                <Card key={moto.id} className="border-l-8 border-l-red-600 bg-red-50/20">
                    <CardContent className="p-6 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <AlertOctagon className="text-red-600 w-6 h-6"/>
                                <h3 className="text-xl font-bold">{moto.modelo}</h3>
                            </div>
                            <div className="space-y-1 text-sm">
                                <p><strong>Chassi:</strong> {moto.sku}</p>
                                <p><strong>Problema:</strong> <span className="text-red-600 font-bold uppercase">{moto.detalhes_avaria}</span></p>
                                <p className="text-slate-500">Origem: {moto.montador?.nome}</p>
                            </div>
                        </div>
                        <Button onClick={() => { setMotoAtiva(moto); setTecnico(""); setSolucao(""); setModalOpen(true); }} className="bg-slate-900 text-white h-12 px-6">
                            <Wrench className="mr-2 w-4 h-4"/> REALIZAR REPARO
                        </Button>
                    </CardContent>
                </Card>
            ))}
        </div>

        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
            <DialogContent>
                <DialogHeader><DialogTitle>Registro de Manutenção</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                    <Input placeholder="Nome do Técnico" value={tecnico} onChange={e => setTecnico(e.target.value)} />
                    <Input placeholder="O que foi feito? (Peça trocada, ajuste...)" value={solucao} onChange={e => setSolucao(e.target.value)} />
                </div>
                <DialogFooter>
                    <Button onClick={handleReparo} className="bg-green-600 hover:bg-green-700 text-white w-full">CONCLUIR SERVIÇO</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}