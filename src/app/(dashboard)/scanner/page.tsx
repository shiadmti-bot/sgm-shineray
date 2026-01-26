"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { useZxing } from "react-zxing";
import { 
  ScanBarcode, ArrowRight, CheckCircle2, Loader2, Camera, XCircle, Hash, Factory, Wrench 
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

// --- LÓGICA DE DECODIFICAÇÃO VIN (SHINERAY) ---
const decodificarChassiShineray = (vin: string) => {
  if (!vin || vin.length !== 17) return null;

  const vds = vin.substring(3, 9); // Modelo
  const anoCode = vin.charAt(9);   // Ano
  const fabricaCode = vin.charAt(10); // Fábrica

  // Decodificação de Ano
  const tabelaAno: Record<string, string> = {
    'R': '2024', 'S': '2025', 'T': '2026', 'V': '2027', 'W': '2028',
    'X': '2029', 'Y': '2030', '1': '2031'
  };
  const ano = tabelaAno[anoCode] || "Desconhecido";

  // Identificação de Modelo
  let modeloNome = "Modelo Novo / Genérico";
  let linhaSugerida = "Linha Geral";

  if (vds.includes("175")) { modeloNome = "SHI 175 EFI"; linhaSugerida = "Linha Trail (A)"; }
  else if (vds.includes("50")) { modeloNome = "Phoenix 50"; linhaSugerida = "Linha CUB (B)"; }
  else if (vds.includes("125")) { modeloNome = "Worker 125"; linhaSugerida = "Linha Street (C)"; }
  else if (vds.includes("XY")) { modeloNome = "XY 50"; linhaSugerida = "Linha CUB (B)"; }

  return {
    wmi: vin.substring(0, 3),
    vds,
    ano,
    fabrica: fabricaCode === 'S' ? 'Suape (PE)' : 'Importado',
    modeloEstimado: modeloNome,
    linhaSugerida
  };
};

export default function ScannerPage() {
  const [loading, setLoading] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [ultimoRegistro, setUltimoRegistro] = useState<any>(null);
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { ref } = useZxing({
    paused: !cameraAtiva,
    onResult(result) {
      const lido = result.getText();
      setCodigo(lido);
      setCameraAtiva(false);
      processarChassi(lido);
    },
    onError() {}
  });

  useEffect(() => {
    if (!cameraAtiva) inputRef.current?.focus();
  }, [cameraAtiva, loading, ultimoRegistro]);

  const processarChassi = async (chassiLido: string) => {
    const chassi = chassiLido.toUpperCase().trim();

    // 1. Validação
    if (chassi.length !== 17) {
      toast.warning("Código inválido! O VIN deve ter 17 caracteres.");
      return;
    }

    setLoading(true);
    setUltimoRegistro(null);

    try {
      // 2. Decodificação
      const dadosVIN = decodificarChassiShineray(chassi);
      if (!dadosVIN) throw new Error("Erro na decodificação do VIN");

      // 3. Verificação de Duplicidade
      const { data: existente } = await supabase
        .from('motos')
        .select('id, status')
        .eq('sku', chassi)
        .maybeSingle();

      if (existente) {
        toast.error(`ERRO: Este chassi já está registrado (Status: ${existente.status})`);
        setLoading(false);
        setCodigo("");
        return;
      }

      // 4. Registro no Banco (CORRIGIDO: VAI PARA MONTAGEM)
      const userStr = localStorage.getItem('sgm_user');
      const user = userStr ? JSON.parse(userStr) : null;

      const { data: novaMoto, error: erroInsert } = await supabase
        .from('motos')
        .insert({
          sku: chassi,
          modelo: dadosVIN.modeloEstimado,
          ano: dadosVIN.ano,
          localizacao: 'Fila de Montagem', // Local físico atual
          status: 'montagem', // <--- STATUS CORRIGIDO: Inicia o fluxo
          montador_id: null, // Ainda não tem montador (está na fila)
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (erroInsert) throw erroInsert;

      // 5. Sucesso e Feedback Visual
      setUltimoRegistro({
        ...novaMoto,
        linha_destino: dadosVIN.linhaSugerida,
      });
      
      toast.success("Enviado para Fila de Montagem!");
      const audio = new Audio('/beep.mp3'); 
      audio.play().catch(() => {});

    } catch (err) {
      console.error(err);
      toast.error("Erro ao registrar entrada.");
    } finally {
      setLoading(false);
      setCodigo("");
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(codigo) processarChassi(codigo);
  };

  return (
    <RoleGuard allowedRoles={['gestor', 'master', 'mecanico']}>
      <div className="h-[calc(100vh-100px)] p-4 max-w-7xl mx-auto flex flex-col animate-in fade-in duration-500">
        
        {/* Header */}
        <div className="flex justify-between items-end mb-6 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
              <ScanBarcode className="w-8 h-8 text-blue-600" />
              ENTRADA DE CHASSI
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Inicia o ciclo de produção. O veículo entrará na fila de <strong>Montagem</strong>.
            </p>
          </div>
          <Badge variant={cameraAtiva ? "destructive" : "outline"} className="animate-pulse">
            {cameraAtiva ? "CÂMERA ATIVA ●" : "AGUARDANDO LEITURA"}
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
          
          {/* LADO ESQUERDO: INPUT */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <Card className="overflow-hidden border-2 border-slate-200 dark:border-slate-800 bg-black relative aspect-video lg:aspect-square flex items-center justify-center shadow-inner rounded-2xl">
               {cameraAtiva ? (
                 <>
                   <video ref={ref} className="w-full h-full object-cover" />
                   <div className="absolute inset-0 border-2 border-blue-500/50 m-12 rounded-lg pointer-events-none flex flex-col items-center justify-center">
                      <div className="w-full h-0.5 bg-blue-500/80 animate-pulse mb-2 shadow-[0_0_10px_#3b82f6]"></div>
                      <span className="text-[10px] text-blue-500 font-mono bg-black/60 px-2 rounded">SCANNER ATIVO</span>
                   </div>
                   <Button variant="destructive" size="icon" className="absolute top-4 right-4 rounded-full" onClick={() => setCameraAtiva(false)}>
                      <XCircle className="w-6 h-6" />
                   </Button>
                 </>
               ) : (
                 <div className="text-center p-6 space-y-4">
                    <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mx-auto text-slate-600 border border-slate-800">
                       <Camera className="w-10 h-10" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-lg">Scanner de Câmera</h3>
                      <p className="text-slate-500 text-xs uppercase tracking-wide">Para tablets e celulares</p>
                    </div>
                    <Button onClick={() => setCameraAtiva(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-8 h-12 rounded-full font-bold shadow-lg shadow-blue-900/20 w-full">
                      ATIVAR CÂMERA
                    </Button>
                 </div>
               )}
            </Card>

            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                      <Hash className="w-3 h-3" /> Digitação / Leitor USB
                  </p>
                  {loading && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                </div>
                <form onSubmit={handleManualSubmit} className="flex gap-2">
                  <Input 
                    ref={inputRef}
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                    placeholder="99H..."
                    className="font-mono uppercase tracking-widest text-lg h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:border-blue-500"
                    disabled={loading || cameraAtiva}
                    maxLength={17}
                  />
                  <Button type="submit" disabled={loading || codigo.length < 17} className="h-12 w-16 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800">
                    <ArrowRight />
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* LADO DIREITO: RESULTADO / FEEDBACK */}
          <div className="lg:col-span-7 h-full">
             {ultimoRegistro ? (
                <Card className="h-full border-l-8 border-l-blue-500 bg-white dark:bg-slate-900 border-y border-r border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden animate-in slide-in-from-right duration-500">
                   <div className="absolute -right-10 -bottom-10 opacity-5 pointer-events-none">
                      <Factory className="w-80 h-80 text-blue-500" />
                   </div>
                   
                   <CardContent className="p-8 flex flex-col h-full justify-center">
                      <div className="flex items-start justify-between mb-8">
                          <div>
                              <p className="text-sm font-bold text-blue-600 dark:text-blue-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                                  <CheckCircle2 className="w-5 h-5" /> Iniciado com Sucesso
                              </p>
                              <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white leading-tight">
                                  {ultimoRegistro.modelo}
                              </h2>
                          </div>
                          <div className="text-right">
                              <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-lg px-4 py-1">
                                  {ultimoRegistro.ano}
                              </Badge>
                          </div>
                      </div>

                      <div className="space-y-6 relative z-10">
                          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                              <p className="text-xs text-slate-400 uppercase font-bold mb-1">Chassi (VIN)</p>
                              <p className="text-2xl font-mono tracking-widest text-slate-700 dark:text-slate-300">
                                  {ultimoRegistro.sku}
                              </p>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                                  <p className="text-xs text-slate-400 uppercase font-bold mb-1">Origem</p>
                                  <p className="text-lg font-bold text-slate-800 dark:text-white">
                                      {ultimoRegistro.localizacao}
                                  </p>
                              </div>
                              <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-200 dark:border-blue-900/30">
                                  <p className="text-xs text-blue-500 uppercase font-bold mb-1 flex items-center gap-1">
                                      <Wrench className="w-3 h-3" /> Próxima Etapa
                                  </p>
                                  <p className="text-lg font-black text-blue-700 dark:text-blue-400">
                                      {ultimoRegistro.linha_destino}
                                  </p>
                              </div>
                          </div>
                      </div>

                      <div className="mt-8 flex justify-end">
                          <Button 
                            variant="outline" 
                            onClick={() => setUltimoRegistro(null)}
                            className="border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                              Ler Próximo
                          </Button>
                      </div>
                   </CardContent>
                </Card>
             ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-slate-50/50 dark:bg-slate-900/20 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                   <div className="w-24 h-24 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 shadow-sm">
                      <ScanBarcode className="w-12 h-12 text-slate-300 dark:text-slate-600" />
                   </div>
                   <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">Pronto para Ler</h3>
                   <p className="text-slate-400 max-w-xs mx-auto mb-8">
                      Aponte a câmera para o chassi. O sistema registrará e enviará para a <strong>Montagem</strong> automaticamente.
                   </p>
                   <div className="flex gap-2">
                       <Badge variant="secondary" className="bg-white dark:bg-slate-800">99H = Shineray</Badge>
                       <Badge variant="secondary" className="bg-white dark:bg-slate-800">Anti-Duplicidade</Badge>
                   </div>
                </div>
             )}
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}