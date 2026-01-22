"use client";

import { useState, useEffect } from "react";
import { Play, Pause, CheckCircle, Clock, AlertCircle, ArrowRight, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase"; // Importando o cliente real
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Tipo igual ao do Banco de Dados
type Moto = {
  id: string;
  modelo: string;
  sku: string;
  status: "fila" | "montagem" | "qualidade" | "estoque";
  tempo_montagem: number; // segundos
  montador?: string;
};

export default function MontagemPage() {
  const [motos, setMotos] = useState<Moto[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTimer, setActiveTimer] = useState<string | null>(null);

  // Busca dados do Supabase ao carregar
  useEffect(() => {
    fetchMotos();
  }, []);

  // Timer: Roda localmente a cada segundo se houver uma moto ativa
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeTimer) {
      interval = setInterval(() => {
        setMotos((prev) =>
          prev.map((moto) =>
            moto.id === activeTimer
              ? { ...moto, tempo_montagem: (moto.tempo_montagem || 0) + 1 }
              : moto
          )
        );
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeTimer]);

  // Função para buscar dados
  async function fetchMotos() {
    setLoading(true);
    const { data, error } = await supabase
      .from('motos')
      .select('*')
      .neq('status', 'estoque') // Traz tudo que NÃO está no estoque final
      .order('created_at', { ascending: true }); // Mais antigas primeiro (FIFO)

    if (error) {
      toast.error("Erro ao carregar motos");
      console.error(error);
    } else {
      setMotos(data as Moto[]);
    }
    setLoading(false);
  }

  // Formata MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Lógica das Ações (Atualiza o Banco)
  const handleAction = async (id: string, action: "start" | "pause" | "finish") => {
    const motoAtual = motos.find(m => m.id === id);
    if (!motoAtual) return;

    try {
      if (action === "start") {
        // Atualiza UI instantaneamente
        setActiveTimer(id);
        setMotos(prev => prev.map(m => m.id === id ? { ...m, status: "montagem" } : m));
        
        // Atualiza Banco
        await supabase.from('motos').update({ status: 'montagem' }).eq('id', id);
        toast.success("Montagem Iniciada");

      } else if (action === "pause") {
        // Para o timer
        setActiveTimer(null);
        
        // Salva o tempo atual no banco para não perder
        await supabase
          .from('motos')
          .update({ tempo_montagem: motoAtual.tempo_montagem })
          .eq('id', id);
        
        toast.info("Montagem Pausada (Tempo Salvo)");

      } else if (action === "finish") {
        // Para o timer e move para qualidade
        setActiveTimer(null);
        setMotos(prev => prev.map(m => m.id === id ? { ...m, status: "qualidade" } : m));

        await supabase
          .from('motos')
          .update({ 
            status: 'qualidade', 
            tempo_montagem: motoAtual.tempo_montagem 
          })
          .eq('id', id);

        toast.success("Enviado para Qualidade", { 
          style: { borderColor: "var(--primary)" }
        });
        
        // Recarrega para garantir sincronia
        fetchMotos();
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar ação");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Linha de Montagem</h1>
          <p className="text-slate-500">Gerencie sua fila de produção em tempo real.</p>
        </div>
        
        <Button variant="outline" onClick={fetchMotos} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Atualizar Lista
        </Button>
      </div>

      <Tabs defaultValue="fila" className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="fila">Fila ({motos.filter(m => m.status === 'fila').length})</TabsTrigger>
          <TabsTrigger value="montagem">Execução ({motos.filter(m => m.status === 'montagem').length})</TabsTrigger>
          <TabsTrigger value="qualidade">Qualidade ({motos.filter(m => m.status === 'qualidade').length})</TabsTrigger>
        </TabsList>

        {/* --- COLUNA: FILA (O que veio do Scanner) --- */}
        <TabsContent value="fila" className="mt-4 space-y-4">
          {motos.filter(m => m.status === 'fila').length === 0 ? (
            <div className="text-center py-10 text-slate-400 border-2 border-dashed rounded-lg">
              <p>Nenhuma moto na fila.</p>
              <p className="text-sm">Vá ao Scanner bipar novas caixas.</p>
            </div>
          ) : (
            motos.filter(m => m.status === 'fila').map((moto) => (
              <Card key={moto.id} className="opacity-90 hover:opacity-100 transition-all hover:shadow-md border-l-4 border-l-slate-300">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <div>
                    <Badge variant="outline" className="mb-1">{moto.sku}</Badge>
                    <CardTitle className="text-lg">{moto.modelo}</CardTitle>
                  </div>
                  <Button size="sm" onClick={() => handleAction(moto.id, "start")}>
                     Iniciar <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </CardHeader>
              </Card>
            ))
          )}
        </TabsContent>

        {/* --- COLUNA: EM EXECUÇÃO (Cronômetro) --- */}
        <TabsContent value="montagem" className="mt-4 space-y-4">
          {motos.filter(m => m.status === 'montagem').map((moto) => (
            <Card key={moto.id} className={`border-l-4 ${activeTimer === moto.id ? 'border-l-green-500 shadow-md ring-1 ring-green-500/20' : 'border-l-blue-500'}`}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <Badge variant="secondary" className="mb-1">{moto.sku}</Badge>
                    <CardTitle className="text-xl text-slate-800">{moto.modelo}</CardTitle>
                  </div>
                  <div className={`text-2xl font-mono font-bold ${activeTimer === moto.id ? 'text-green-600 animate-pulse' : 'text-slate-400'}`}>
                    {formatTime(moto.tempo_montagem || 0)}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
                  <Clock className="w-4 h-4" />
                  <span>Meta: 45 min</span>
                </div>
                {/* Barra de Progresso Visual */}
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                   <div 
                     className="bg-primary h-full transition-all duration-1000" 
                     style={{ width: `${Math.min(((moto.tempo_montagem || 0) / (45 * 60)) * 100, 100)}%` }} 
                   />
                </div>
              </CardContent>
              <CardFooter className="flex gap-2 justify-end pt-2">
                {activeTimer === moto.id ? (
                  <Button variant="outline" onClick={() => handleAction(moto.id, "pause")}>
                    <Pause className="mr-2 h-4 w-4" /> Pausar
                  </Button>
                ) : (
                  <Button onClick={() => handleAction(moto.id, "start")}>
                    <Play className="mr-2 h-4 w-4" /> Continuar
                  </Button>
                )}
                <Button variant="destructive" onClick={() => handleAction(moto.id, "finish")}>
                  Finalizar <CheckCircle className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
          
          {motos.filter(m => m.status === 'montagem').length === 0 && (
             <div className="text-center py-12 text-slate-400">
                <p>Nenhuma moto sendo montada agora.</p>
             </div>
          )}
        </TabsContent>

        {/* --- COLUNA: QUALIDADE (Apenas visualização) --- */}
        <TabsContent value="qualidade" className="mt-4 space-y-4">
           {motos.filter(m => m.status === 'qualidade').map((moto) => (
            <Card key={moto.id} className="bg-slate-50 border-slate-200 opacity-75">
              <CardHeader className="pb-2">
                <div className="flex justify-between">
                    <CardTitle className="text-lg text-slate-600">{moto.modelo}</CardTitle>
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                        <AlertCircle className="w-3 h-3 mr-1" /> Aguardando QC
                    </Badge>
                </div>
              </CardHeader>
              <CardContent>
                  <p className="text-sm text-slate-500">Tempo Final: {formatTime(moto.tempo_montagem || 0)}</p>
                  <p className="text-xs text-slate-400 mt-1">ID: {moto.id.slice(0, 8)}</p>
              </CardContent>
            </Card>
          ))}
          {motos.filter(m => m.status === 'qualidade').length === 0 && (
             <div className="text-center py-12 text-slate-400">
                <p>Nenhuma moto aguardando qualidade.</p>
             </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}