"use client";

import { useState } from "react";
import { useZxing } from "react-zxing";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase"; 
import { ScanBarcode, CheckCircle2, AlertTriangle, RefreshCcw, Loader2, Keyboard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export default function ScannerPage() {
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualCode, setManualCode] = useState("");

  const { ref } = useZxing({
    onResult(result) {
      handleScan(result.getText());
    },
    paused: isProcessing,
    // Removida a propriedade 'options' que causava erro
  });

  const handleScan = async (code: string) => {
    if (isProcessing || !code) return;

    setIsProcessing(true);
    setLastScanned(code);
    setManualCode(""); 

    let modelo = "Desconhecido";
    let sku = code.toUpperCase().trim();

    if (sku.includes("PHOENIX")) modelo = "Phoenix 50cc";
    else if (sku.includes("JEF")) modelo = "JEF 150s";
    else if (sku.includes("WORKER")) modelo = "Worker 125";
    else if (sku.includes("SHI")) modelo = "SHI 175";

    try {
      const { error } = await supabase
        .from('motos')
        .insert([
          { 
            sku: sku, 
            modelo: modelo, 
            status: 'fila', 
            created_at: new Date().toISOString()
          }
        ]);

      if (error) throw error;

      toast.success("Moto Registrada!", {
        description: `${modelo} enviada para a Linha de Montagem.`,
        duration: 4000,
        style: { background: "#ecfdf5", borderColor: "#10b981", color: "#065f46" }
      });

    } catch (err) {
      console.error(err);
      toast.error("Erro ao registrar", {
        description: "Falha de conexão com o banco de dados."
      });
      setLastScanned(null);
    } finally {
      setTimeout(() => setIsProcessing(false), 2000);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.length > 2) {
        handleScan(manualCode);
    } else {
        toast.warning("Código muito curto");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Entrada de Caixas</h1>
          <p className="text-slate-500">Bipe a caixa ou digite o código manualmente.</p>
        </div>
        <Badge variant={isProcessing ? "secondary" : "default"} className="px-4 py-1 text-sm">
          {isProcessing ? "Processando..." : "Sistema Ativo"}
        </Badge>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* LADO ESQUERDO: CÂMERA */}
        <Card className="overflow-hidden border-2 border-slate-200 shadow-md">
            <div className="relative bg-black aspect-square md:aspect-video flex items-center justify-center overflow-hidden">
            <video ref={ref} className="w-full h-full object-cover" />
            
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 md:w-64 md:h-40 border-2 border-primary/70 rounded-lg relative">
                {!isProcessing && (
                    <div className="absolute top-1/2 left-0 w-full h-0.5 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse" />
                )}
                </div>
            </div>
            </div>
        </Card>

        {/* LADO DIREITO: STATUS E MANUAL */}
        <div className="space-y-4">
            {/* INPUT MANUAL */}
            <Card>
                <CardContent className="p-4 pt-6">
                    <form onSubmit={handleManualSubmit} className="flex gap-2">
                        <Input 
                            placeholder="Digite o SKU (ex: PHOENIX-01)..." 
                            value={manualCode}
                            onChange={(e) => setManualCode(e.target.value)}
                            className="uppercase"
                        />
                        <Button type="submit" disabled={isProcessing}>
                            {isProcessing ? <Loader2 className="animate-spin" /> : <Keyboard className="w-4 h-4" />}
                        </Button>
                    </form>
                    <p className="text-xs text-slate-400 mt-2 text-center">Use isso se a câmera falhar.</p>
                </CardContent>
            </Card>

            {/* CARD DE STATUS DE LEITURA */}
            <Card className="h-full bg-slate-50 border-dashed">
                <CardContent className="p-6 h-full flex items-center justify-center">
                {isProcessing ? (
                    <div className="flex flex-col items-center justify-center text-primary">
                        <Loader2 className="h-8 w-8 animate-spin mb-2" />
                        <p>Salvando no Supabase...</p>
                    </div>
                ) : lastScanned ? (
                    <div className="text-center animate-in zoom-in-95">
                        <div className="bg-green-100 p-4 rounded-full inline-block mb-3">
                            <CheckCircle2 className="h-8 w-8 text-green-600" />
                        </div>
                        <p className="text-xs font-semibold text-slate-500 uppercase">Último Registro</p>
                        <p className="text-xl font-mono font-bold text-slate-900 break-all">{lastScanned}</p>
                        <Button variant="link" size="sm" onClick={() => setLastScanned(null)} className="mt-2 text-slate-400">
                            <RefreshCcw className="mr-2 h-3 w-3" /> Ler Próximo
                        </Button>
                    </div>
                ) : (
                    <div className="text-center text-slate-400 flex flex-col items-center gap-2">
                        <ScanBarcode className="h-10 w-10 opacity-20" />
                        <p>Aguardando entrada...</p>
                    </div>
                )}
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}