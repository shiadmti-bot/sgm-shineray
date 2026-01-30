"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { Printer, ArrowRight, ScanBarcode, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { registrarLog } from "@/lib/logger";

export default function EtiquetagemPage() {
  const [motos, setMotos] = useState<any[]>([]);

  useEffect(() => {
    fetchMotos();
    const interval = setInterval(fetchMotos, 10000);
    return () => clearInterval(interval);
  }, []);

  async function fetchMotos() {
    const { data } = await supabase
      .from('motos')
      .select(`*, montador:funcionarios!motos_montador_id_fkey(nome)`)
      .eq('status', 'aguardando_etiqueta')
      .order('updated_at', { ascending: true }); // FIFO (Primeira que entra, primeira que sai)
    if (data) setMotos(data);
  }

  const handleImprimir = (moto: any) => {
    const janelaImpressao = window.open('', '', 'width=400,height=300');
    if (janelaImpressao) {
        janelaImpressao.document.write(`
            <html>
            <body style="font-family: sans-serif; text-align: center; padding: 5px;">
                <div style="border: 1px solid black; padding: 10px; width: 300px; margin: 0 auto;">
                    <h2 style="margin: 0; font-size: 18px;">SHINERAY DO BRASIL</h2>
                    <h1 style="font-size: 28px; margin: 10px 0;">${moto.modelo}</h1>
                    <p style="margin: 5px 0;">COR: <strong>${moto.cor}</strong> | ANO: <strong>${moto.ano}</strong></p>
                    <div style="margin: 15px 0;">
                        <svg id="barcode"></svg> 
                        <div style="font-size: 12px; letter-spacing: 2px;">* ${moto.sku} *</div>
                    </div>
                    <p style="font-size: 10px; margin-top: 10px;">
                        Montado por: ${moto.montador?.nome?.split(' ')[0]}<br/>
                        ${new Date().toLocaleString()}
                    </p>
                </div>
            </body>
            </html>
        `);
        janelaImpressao.document.close();
        janelaImpressao.print();
        
        // Confirmação simplificada
        if(confirm("Etiqueta impressa corretamente? Enviar para ESTOQUE?")) {
            moverParaEstoque(moto);
        }
    }
  };

  const moverParaEstoque = async (moto: any) => {
    const { error } = await supabase.from('motos').update({
        status: 'estoque',
        localizacao: 'Pátio de Estoque (Liberado)',
        updated_at: new Date().toISOString()
    }).eq('id', moto.id);

    if (!error) {
        toast.success("Moto enviada para o Estoque!");
        await registrarLog('IMPRESSAO_ETIQUETA', moto.sku);
        fetchMotos();
    }
  };

  return (
    <RoleGuard allowedRoles={['supervisor', 'gestor', 'master', 'montador']}>
      <div className="space-y-6 animate-in fade-in">
        <div className="flex flex-col">
            <h1 className="text-3xl font-black text-blue-600 flex items-center gap-3">
               <Tag className="w-8 h-8" /> Central de Etiquetagem
            </h1>
            <p className="text-slate-500">Motos aprovadas aguardando identificação final.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {motos.length === 0 ? (
                <div className="col-span-full text-center py-20 text-slate-400 border-2 border-dashed rounded-xl">
                    <Printer className="w-12 h-12 mx-auto mb-2 opacity-20"/>
                    <p>Nenhuma moto aguardando etiqueta.</p>
                </div>
            ) : (
                motos.map(moto => (
                    <Card key={moto.id} className="bg-white dark:bg-slate-900 border-blue-200 dark:border-blue-900 shadow-lg hover:shadow-xl transition-all">
                        <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
                            <div className="w-full">
                                <Badge variant="outline" className="mb-2 font-mono">{moto.sku}</Badge>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white leading-tight">{moto.modelo}</h3>
                            </div>
                            
                            <div className="w-full bg-slate-50 dark:bg-slate-950 p-3 rounded-lg text-xs space-y-1 border border-slate-100 dark:border-slate-800">
                                <div className="flex justify-between"><span>Cor:</span> <strong>{moto.cor}</strong></div>
                                <div className="flex justify-between"><span>Banco:</span> <strong>{moto.cor_banco}</strong></div>
                                <div className="flex justify-between"><span>Montador:</span> <strong>{moto.montador?.nome.split(' ')[0]}</strong></div>
                            </div>

                            <Button onClick={() => handleImprimir(moto)} className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-600/20">
                                <Printer className="mr-2 w-5 h-5"/> IMPRIMIR
                            </Button>
                        </CardContent>
                    </Card>
                ))
            )}
        </div>
      </div>
    </RoleGuard>
  );
}