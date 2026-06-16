"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { Printer, Tag, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { registrarLog } from "@/lib/logger";

export default function EtiquetagemPage() {
  const [motos, setMotos] = useState<any[]>([]);

  // Estados de Confirmação de Impressão QoL
  const [motoConfirmando, setMotoConfirmando] = useState<any>(null);
  const [digitosConfirmacao, setDigitosConfirmacao] = useState("");
  const [declaracaoLida, setDeclaracaoLida] = useState(false);
  const [enviandoEstoque, setEnviandoEstoque] = useState(false);

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
      .order('updated_at', { ascending: true });
    if (data) setMotos(data);
  }

  // --- ETIQUETA HÍBRIDA (100x150mm) ---
  const handleImprimir = (moto: any) => {
    const janela = window.open('', 'PRINT', 'height=800,width=600');

    if (janela) {
        janela.document.write(`
            <html>
            <head>
                <title>ETIQUETA ${moto.sku}</title>
                <style>
                    @page {
                        size: 100mm 150mm;
                        margin: 0;
                    }
                    body {
                        margin: 0;
                        padding: 0;
                        width: 100mm;
                        height: 150mm;
                        font-family: 'Arial', sans-serif;
                        display: flex;
                        flex-direction: column;
                        box-sizing: border-box;
                        border: 3px solid black; /* Borda externa grossa */
                    }
                    
                    /* ESTRUTURA DE SEÇÕES */
                    .section {
                        width: 100%;
                        border-bottom: 2px solid black;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        text-align: center;
                        overflow: hidden;
                        padding: 2mm;
                        box-sizing: border-box;
                    }
                    
                    /* AJUSTE DE ALTURAS (Total ~150mm) */
                    .sec-header { height: 15mm; background-color: #000; color: #fff; }
                    .sec-model { height: 35mm; }
                    .sec-colors { height: 25mm; }
                    .sec-barcode { height: 40mm; }
                    .sec-chassi { height: 15mm; background-color: #f0f0f0; } /* Destaque leve */
                    .sec-footer { height: 20mm; border-bottom: none; }

                    /* TIPOGRAFIA */
                    .header-title { font-size: 20px; font-weight: 900; letter-spacing: 4px; }
                    .header-sub { font-size: 8px; text-transform: uppercase; letter-spacing: 1px; }
                    
                    .label-small { font-size: 9px; font-weight: bold; text-transform: uppercase; margin-bottom: 2px; }
                    
                    .model-val { font-size: 34px; font-weight: 900; line-height: 1; text-transform: uppercase; }
                    
                    /* GRID DE CORES */
                    .colors-grid { display: grid; grid-template-columns: 1fr 1px 1fr; width: 100%; height: 100%; align-items: center; }
                    .v-line { background: black; height: 80%; }
                    .color-box { display: flex; flex-direction: column; }
                    .color-val { font-size: 18px; font-weight: bold; }

                    /* CÓDIGO DE BARRAS */
                    #barcode { width: 95%; height: 85%; }

                    /* CHASSI (VIN) EM DESTAQUE */
                    .chassi-val { font-size: 22px; font-family: monospace; font-weight: 900; letter-spacing: 2px; }

                    /* RODAPÉ TÉCNICO */
                    .footer-grid { 
                        display: grid; 
                        grid-template-columns: auto 1fr; 
                        gap: 3px 10px; 
                        width: 100%; 
                        padding: 0 5mm;
                        text-align: left;
                        font-size: 10px;
                    }
                    .ft-label { font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="section sec-header">
                    <div class="header-title">BY SABEL</div>
                    <div class="header-sub">SISTEMA DE GESTÃO DE MONTAGEM</div>
                </div>

                <div class="section sec-model">
                    <span class="label-small">MODELO / VERSÃO</span>
                    <div class="model-val">${moto.modelo}</div>
                </div>

                <div class="section sec-colors">
                    <div class="colors-grid">
                        <div class="color-box">
                            <span class="label-small">COR CARENAGEM</span>
                            <span class="color-val">${moto.cor}</span>
                        </div>
                        <div class="v-line"></div>
                        <div class="color-box">
                            <span class="label-small">COR BANCO</span>
                            <span class="color-val">${moto.cor_banco}</span>
                        </div>
                    </div>
                </div>

                <div class="section sec-barcode">
                    <svg id="barcode"></svg>
                </div>

                <div class="section sec-chassi">
                    <span class="label-small" style="font-size: 7px; margin-bottom: 0;">NÚMERO DO CHASSI (VIN)</span>
                    <div class="chassi-val">${moto.sku}</div>
                </div>

                <div class="section sec-footer">
                    <div class="footer-grid">
                        <span class="ft-label">DATA:</span> <span>${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</span>
                        <span class="ft-label">MONTADOR:</span> <span>${moto.montador?.nome?.toUpperCase()}</span>
                        <span class="ft-label">ANO FAB:</span> <span>${moto.ano}</span>
                        <span class="ft-label">DESTINO:</span> <span>ESTOQUE PRINCIPAL</span>
                    </div>
                </div>

                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.0/dist/JsBarcode.all.min.js"></script>
                <script>
                    try {
                        JsBarcode("#barcode", "${moto.sku}", {
                            format: "CODE128",
                            lineColor: "#000",
                            width: 3,        /* Largura da barra */
                            height: 80,      /* Altura da barra */
                            displayValue: false, /* Texto escondido (já temos a seção Chassi) */
                            margin: 0
                        });
                    } catch (e) { console.error(e); }

                    setTimeout(() => {
                        window.print();
                        window.close();
                    }, 600);
                </script>
            </body>
            </html>
        `);
        
        janela.document.close();

        setTimeout(() => {
             setMotoConfirmando(moto);
             setDigitosConfirmacao("");
             setDeclaracaoLida(false);
        }, 1000);
    }
  };

  const moverParaEstoque = async (moto: any) => {
    setEnviandoEstoque(true);
    const { error } = await supabase.from('motos').update({
        status: 'estoque',
        localizacao: 'Pátio de Estoque',
        updated_at: new Date().toISOString()
    }).eq('id', moto.id);

    if (!error) {
        toast.success("Enviado para Estoque!");
        await registrarLog('IMPRESSAO_ETIQUETA', moto.sku);
        setMotoConfirmando(null);
        fetchMotos();
    } else {
        toast.error("Erro ao enviar para o estoque.");
    }
    setEnviandoEstoque(false);
  };

  return (
    <RoleGuard allowedRoles={['supervisor', 'gestor', 'master', 'montador']}>
      <div className="space-y-6 animate-in fade-in">
        <div className="flex flex-col">
            <h1 className="text-3xl font-black text-blue-600 flex items-center gap-3">
               <Tag className="w-8 h-8" /> Central de Etiquetagem
            </h1>
            <p className="text-slate-500">Impressão de Etiqueta de Caixa (100mm x 150mm).</p>
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
                                <div className="flex justify-between"><span>Montador:</span> <strong>{moto.montador?.nome.split(' ')[0]}</strong></div>
                            </div>

                            <Button onClick={() => handleImprimir(moto)} className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-600/20">
                                <Printer className="mr-2 w-5 h-5"/> IMPRIMIR (100x150)
                            </Button>
                        </CardContent>
                    </Card>
                ))
            )}
        </div>

        {/* MODAL DE CONFIRMAÇÃO DE IMPRESSÃO */}
        <Dialog open={!!motoConfirmando} onOpenChange={(open) => !open && setMotoConfirmando(null)}>
            <DialogContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-blue-600 flex items-center gap-2 text-xl font-black">
                         <CheckCircle2 className="w-6 h-6"/> Confirmação de Etiqueta
                    </DialogTitle>
                    <DialogDescription>
                         Evite enviar motos ao estoque sem a etiqueta física. Realize a verificação abaixo.
                    </DialogDescription>
                </DialogHeader>

                {motoConfirmando && (
                    <div className="space-y-5 py-4">
                        {/* Info da Moto */}
                        <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                            <h4 className="font-black text-lg text-slate-800 dark:text-white mb-1">{motoConfirmando.modelo}</h4>
                            <p className="font-mono text-sm tracking-wider text-slate-500">Chassi: {motoConfirmando.sku}</p>
                        </div>

                        {/* Declaração Visual */}
                        <label className="flex items-start gap-3 p-3 rounded-lg border border-blue-100 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/20 cursor-pointer select-none">
                            <input 
                                 type="checkbox"
                                 checked={declaracaoLida}
                                 onChange={(e) => setDeclaracaoLida(e.target.checked)}
                                 className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                            />
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                 Confirmo que a etiqueta térmica física foi impressa e fixada à caixa da moto.
                            </span>
                        </label>

                        {/* Validação de Chassi */}
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                 <AlertTriangle className="w-3.5 h-3.5 text-amber-500"/> Digite os 4 últimos dígitos do chassi ({motoConfirmando.sku.slice(-4)})
                            </label>
                            <Input 
                                 placeholder="Ex: 0462"
                                 value={digitosConfirmacao}
                                 onChange={e => setDigitosConfirmacao(e.target.value)}
                                 maxLength={4}
                                 className="font-mono text-center text-lg tracking-widest h-12"
                            />
                        </div>
                    </div>
                )}

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={() => setMotoConfirmando(null)}>Cancelar</Button>
                    <Button 
                         onClick={() => moverParaEstoque(motoConfirmando)}
                         disabled={!declaracaoLida || digitosConfirmacao !== motoConfirmando?.sku.slice(-4) || enviandoEstoque}
                         className={`h-11 font-bold ${
                              declaracaoLida && digitosConfirmacao === motoConfirmando?.sku.slice(-4)
                                   ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20' 
                                   : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600'
                         }`}
                    >
                         {enviandoEstoque ? "Enviando..." : "Confirmar e Enviar ao Estoque"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

      </div>
    </RoleGuard>
  );
}