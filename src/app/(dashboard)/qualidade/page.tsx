"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Check, X, Search, AlertTriangle, FileCheck, Bike, ClipboardCheck, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

// (Removido o import do ScrollArea para usar rolagem nativa mais segura)

type Moto = {
  id: string;
  modelo: string;
  sku: string;
  status: string;
  montador?: string;
  created_at: string;
};

const checklistItens = [
  { id: "freios", label: "Freios Dianteiro/Traseiro calibrados" },
  { id: "eletrica", label: "Parte Elétrica (Farol, Piscas, Buzina)" },
  { id: "torque", label: "Torque dos Parafusos (Rodas e Motor)" },
  { id: "pneus", label: "Calibragem dos Pneus" },
  { id: "visual", label: "Inspeção Visual (Arranhões/Carenagem)" },
  { id: "oleo", label: "Nível de Óleo do Motor" },
  { id: "corrente", label: "Tensão da Corrente" },
];

export default function QualidadePage() {
  const [motos, setMotos] = useState<Moto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  
  const [itemSelecionado, setItemSelecionado] = useState<Moto | null>(null);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [observacao, setObservacao] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function fetchMotos() {
    setLoading(true);
    const { data, error } = await supabase
      .from('motos')
      .select('*')
      .eq('status', 'qualidade')
      .order('created_at', { ascending: true });

    if (error) {
      toast.error("Erro ao carregar lista");
    } else {
      setMotos(data as Moto[]);
    }
    setLoading(false);
  }

  useEffect(() => { fetchMotos(); }, []);

  useEffect(() => {
    if (!modalOpen) {
      setChecklist([]);
      setObservacao("");
      setSaving(false);
    }
  }, [modalOpen]);

  const progresso = Math.round((checklist.length / checklistItens.length) * 100);
  const estaCompleto = checklist.length === checklistItens.length;

  const motosFiltradas = motos.filter(m => 
    m.modelo.toLowerCase().includes(filtro.toLowerCase()) || 
    m.sku.toLowerCase().includes(filtro.toLowerCase())
  );

  const handleCheck = (id: string) => {
    setChecklist(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const handleMarcarTodos = () => {
    if (checklist.length === checklistItens.length) setChecklist([]);
    else setChecklist(checklistItens.map(i => i.id));
  };

  const handleFinalizarInspecao = async (aprovado: boolean) => {
    if (!itemSelecionado) return;
    if (aprovado && !estaCompleto) {
      toast.error("Complete o checklist.");
      return;
    }
    if (!aprovado && !observacao) {
      toast.error("Observação Obrigatória para reprovar.");
      return;
    }

    setSaving(true);
    try {
      const novoStatus = aprovado ? 'estoque' : 'montagem';
      const { error } = await supabase
        .from('motos')
        .update({ status: novoStatus, observacao: observacao, checklists: checklist })
        .eq('id', itemSelecionado.id);

      if (error) throw error;

      toast(aprovado ? "Aprovado!" : "Reprovado!", {
        description: aprovado ? "Enviado para Estoque." : "Devolvido para Montagem.",
        style: { backgroundColor: aprovado ? "#ecfdf5" : "#fef2f2", borderColor: aprovado ? "#10b981" : "#ef4444", color: aprovado ? "#065f46" : "#991b1b" }
      });

      setMotos(prev => prev.filter(m => m.id !== itemSelecionado.id));
      setModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Qualidade</h1>
          <p className="text-slate-500">Inspeção final e liberação.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Input 
            placeholder="Buscar SKU..." 
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="w-full md:w-[250px]" 
          />
          <Button variant="outline" size="icon" onClick={fetchMotos} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
           <div className="col-span-full py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : motosFiltradas.length === 0 ? (
            <div className="col-span-full text-center py-12 text-slate-400 border-2 border-dashed rounded-lg bg-slate-50">
                <ClipboardCheck className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>Nenhuma inspeção pendente.</p>
            </div>
        ) : (
          motosFiltradas.map((moto) => (
            <Card key={moto.id} className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-yellow-400 group">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <Badge variant="outline">{moto.sku}</Badge>
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Aguardando</Badge>
                </div>
                <CardTitle className="mt-2 flex items-center gap-2 text-lg">
                  <Bike className="h-5 w-5 text-slate-500" />
                  {moto.modelo}
                </CardTitle>
                <CardDescription>Entrada: {new Date(moto.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</CardDescription>
              </CardHeader>
              <CardContent>
                <Dialog open={modalOpen && itemSelecionado?.id === moto.id} onOpenChange={(open) => {
                    setModalOpen(open);
                    if(open) setItemSelecionado(moto);
                }}>
                  <DialogTrigger asChild>
                    <Button className="w-full group-hover:bg-primary group-hover:text-white transition-colors" onClick={() => setItemSelecionado(moto)}>
                      <FileCheck className="mr-2 h-4 w-4" /> Inspecionar
                    </Button>
                  </DialogTrigger>
                  
                  {/* --- MODAL COM ROLAGEM NATIVA --- */}
                  {/* Definimos uma altura fixa máxima de 85vh para sobrar espaço nas bordas */}
                  <DialogContent className="flex flex-col w-[95vw] sm:max-w-2xl max-h-[85vh] p-0 gap-0 overflow-hidden rounded-lg bg-white">
                    
                    {/* 1. CABEÇALHO FIXO */}
                    <DialogHeader className="p-4 sm:p-6 pb-2 shrink-0 border-b z-10 bg-white">
                      <DialogTitle className="flex items-center justify-between text-lg sm:text-xl">
                         <div className="flex items-center gap-2">
                           <ClipboardCheck className="text-primary h-5 w-5" />
                           <span className="truncate max-w-[150px] sm:max-w-md">{moto.sku}</span>
                         </div>
                      </DialogTitle>
                      
                      <DialogDescription asChild>
                        <div className="text-sm text-muted-foreground mt-1">
                          <div className="flex justify-between items-center mt-2">
                            <span>{checklist.length}/{checklistItens.length} itens</span>
                            <Button variant="ghost" size="sm" className="h-auto py-1 text-xs text-primary" onClick={handleMarcarTodos}>
                              {estaCompleto ? "Desmarcar" : "Marcar Todos"}
                            </Button>
                          </div>
                          <Progress value={progresso} className="h-2 mt-2" />
                        </div>
                      </DialogDescription>
                    </DialogHeader>

                    {/* 2. CONTEÚDO COM SCROLL (overflow-y-auto) */}
                    {/* Aqui está o segredo: div nativa que ocupa o espaço que sobra (flex-1) e rola internamente */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          {checklistItens.map((item) => (
                            <div 
                              key={item.id} 
                              className={`flex items-start space-x-3 p-3 rounded-lg border bg-white transition-all duration-200 cursor-pointer ${checklist.includes(item.id) ? 'border-green-500 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}
                              onClick={() => handleCheck(item.id)}
                            >
                              <Checkbox 
                                id={item.id} 
                                checked={checklist.includes(item.id)}
                                className="mt-1 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                              />
                              <div className="grid gap-1 leading-snug">
                                <Label htmlFor={item.id} className="text-sm font-medium cursor-pointer text-slate-900">
                                  {item.label}
                                </Label>
                                <p className="text-xs text-slate-500">Verificar conformidade.</p>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="pt-2 pb-2">
                          <Label htmlFor="obs" className="flex items-center gap-2 mb-2 text-sm font-semibold">
                            <AlertTriangle className="w-4 h-4 text-yellow-500" />
                            Observações (Se Reprovar)
                          </Label>
                          <Textarea 
                            id="obs" 
                            placeholder="Descreva o defeito..." 
                            value={observacao}
                            onChange={(e) => setObservacao(e.target.value)}
                            className="bg-white min-h-[80px]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 3. RODAPÉ FIXO (Sempre visível embaixo) */}
                    <DialogFooter className="p-4 sm:p-6 border-t shrink-0 flex flex-col sm:flex-row gap-3 sm:gap-0 bg-white">
                      <Button 
                        variant="destructive" 
                        className="w-full sm:w-1/3 order-2 sm:order-1"
                        disabled={saving}
                        onClick={() => handleFinalizarInspecao(false)}
                      >
                        {saving ? <Loader2 className="animate-spin" /> : "REPROVAR"}
                      </Button>
                      
                      <Button 
                        className="w-full sm:w-2/3 bg-green-600 hover:bg-green-700 disabled:opacity-50 order-1 sm:order-2"
                        onClick={() => handleFinalizarInspecao(true)}
                        disabled={!estaCompleto || saving} 
                      >
                        {saving ? <Loader2 className="animate-spin" /> : (estaCompleto ? "APROVAR E ESTOCAR" : `Faltam ${checklistItens.length - checklist.length}`)}
                      </Button>
                    </DialogFooter>

                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}