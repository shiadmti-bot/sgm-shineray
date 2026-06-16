"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { useZxing } from "react-zxing";
import { 
  ScanBarcode, ArrowRight, CheckCircle2, Loader2, Camera, XCircle, Hash, PackagePlus, Box 
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { identificarModelo, MODELOS_CADASTRADOS } from "@/lib/model-decoder"; // Importando a nova inteligência
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// --- HELPER: Extração de Ano e Fábrica (Padrão VIN) ---
// O identificarModelo cuida do Nome, este cuida dos metadados
const extrairMetadadosVIN = (vin: string) => {
  if (!vin || vin.length < 10) return { ano: '2026', fabrica: 'Shineray BR' };

  const anoCode = vin.charAt(9);
  const fabricaCode = vin.charAt(10);

  const tabelaAno: Record<string, string> = {
    'R': '2024', 'S': '2025', 'T': '2026', 'V': '2027', 'W': '2028',
    'X': '2029', 'Y': '2030', '1': '2031'
  };
  
  const ano = tabelaAno[anoCode] || "2026"; // Default para T
  const fabrica = fabricaCode === 'S' ? 'Suape (PE)' : 'Importado';

  return { ano, fabrica };
};

export default function ScannerPage() {
  const [loading, setLoading] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [ultimoRegistro, setUltimoRegistro] = useState<any>(null);
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Estados para QoL de Modelo Desconhecido
  const [modalModeloDesconhecidoOpen, setModalModeloDesconhecidoOpen] = useState(false);
  const [chassiPendente, setChassiPendente] = useState("");
  const [metadadosPendentes, setMetadadosPendentes] = useState<any>(null);
  const [modeloSelecionado, setModeloSelecionado] = useState("");
  const [customModelo, setCustomModelo] = useState("");
  const [usarCustomModelo, setUsarCustomModelo] = useState(false);

  // Configuração da Câmera (Zxing)
  const { ref } = useZxing({
    paused: !cameraAtiva,
    onResult(result) {
      const lido = result.getText();
      setCodigo(lido);
      setCameraAtiva(false);
      processarChassi(lido);
    },
    onError() { 
        // Silently ignore errors during scanning frames
    }
  });

  // Foco automático no input quando a câmera fecha
  useEffect(() => {
    if (!cameraAtiva) inputRef.current?.focus();
  }, [cameraAtiva, loading, ultimoRegistro]);

  const processarChassi = async (chassiLido: string) => {
    const chassi = chassiLido.toUpperCase().trim();

    // Validação de Vin (Chassis) - Deve ter 17 caracteres
    if (chassi.length !== 17) {
        if (chassi.length > 5 && chassi.length < 15) {
             toast.error("Isso parece um MOTOR!", { description: "Por favor, escaneie o código do CHASSI (17 dígitos)." });
        } else {
             toast.warning(`Código inválido (${chassi.length} caracteres)`, { description: "O chassi deve ter exatamente 17 dígitos." });
        }
        return;
    }

    setLoading(true);
    setUltimoRegistro(null);

    try {
      // 1. Decodificação Inteligente (Novo Model Decoder)
      const modeloIdentificado = identificarModelo(chassi);
      const metadados = extrairMetadadosVIN(chassi);

      // 2. Verifica Duplicidade no Supabase
      const { data: existente } = await supabase
        .from('motos')
        .select('id, status, modelo')
        .eq('sku', chassi)
        .maybeSingle();

      if (existente) {
        toast.error(`Moto já registrada!`, {
            description: `Modelo: ${existente.modelo} | Status: ${existente.status.toUpperCase()}`
        });
        setLoading(false);
        setCodigo("");
        return;
      }

      // Se for desconhecido, abre o modal de resolução
      if (modeloIdentificado === "Modelo Desconhecido") {
        setChassiPendente(chassi);
        setMetadadosPendentes(metadados);
        setModeloSelecionado(MODELOS_CADASTRADOS[0] || "");
        setUsarCustomModelo(false);
        setCustomModelo("");
        setModalModeloDesconhecidoOpen(true);
        setLoading(false);
        setCodigo("");
        return;
      }

      await registrarMotoNoBanco(chassi, modeloIdentificado, metadados);

    } catch (err: any) {
      console.error("Erro scanner:", err);
      toast.error("Erro ao registrar entrada."); 
      setLoading(false);
      setCodigo("");
    }
  };

  const registrarMotoNoBanco = async (chassi: string, modelo: string, metadados: any) => {
    setLoading(true);
    try {
      // 3. Registro na Fila
      const { data: novaMoto, error: erroInsert } = await supabase
        .from('motos')
        .insert({
          sku: chassi,
          modelo: modelo,
          ano: metadados.ano,
          localizacao: 'Recebimento / CD', 
          status: 'aguardando_montagem',
          montador_id: null,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (erroInsert) throw erroInsert;

      // 4. Feedback Visual
      setUltimoRegistro({
        ...novaMoto,
        fabrica: metadados.fabrica,
        // Lógica simples de linha baseada no modelo para preencher o visual
        linha_destino: modelo.includes('SCOOTER') ? 'Linha Scooter' : 
                       modelo.includes('ATV') ? 'Linha Off-Road' : 'Linha Geral',
      });
      
      toast.success("Entrada Registrada!", {
        description: `${modelo} enviada para montagem.`
      });

      // Efeito Sonoro (Opcional)
      const audio = new Audio('/beep.mp3'); 
      audio.play().catch(() => {});

    } catch (err: any) {
      console.error("Erro insert:", err);
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
    <RoleGuard allowedRoles={['montador', 'supervisor', 'gestor', 'master']}>
      <div className="h-[calc(100vh-100px)] p-4 max-w-7xl mx-auto flex flex-col animate-in fade-in duration-500">
        
        {/* CABEÇALHO */}
        <div className="flex justify-between items-end mb-6 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
              <PackagePlus className="w-8 h-8 text-blue-600" />
              RECEBIMENTO DE CAIXAS
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Bipagem de entrada no CD. Motos ficarão <strong className="text-blue-500">Aguardando Montagem</strong>.
            </p>
          </div>
          <Badge variant={cameraAtiva ? "destructive" : "outline"} className="animate-pulse">
            {cameraAtiva ? "LENDO..." : "AGUARDANDO"}
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
          
          {/* ESQUERDA: CÂMERA E INPUT */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Box da Câmera */}
            <Card className="overflow-hidden border-2 border-slate-200 dark:border-slate-800 bg-black relative aspect-video lg:aspect-square flex items-center justify-center shadow-inner rounded-2xl">
               {cameraAtiva ? (
                 <>
                   <video ref={ref} className="w-full h-full object-cover" />
                   <div className="absolute inset-0 border-2 border-blue-500/50 m-12 rounded-lg pointer-events-none flex flex-col items-center justify-center">
                      <div className="w-full h-0.5 bg-blue-500/80 animate-pulse mb-2 shadow-[0_0_10px_#3b82f6]"></div>
                      <span className="text-[10px] text-blue-500 font-mono bg-black/60 px-2 rounded">MIRA ATIVA</span>
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
                      <h3 className="text-white font-bold text-lg">Câmera / Tablet</h3>
                      <p className="text-slate-500 text-xs uppercase tracking-wide">Para bipagem móvel</p>
                    </div>
                    <Button onClick={() => setCameraAtiva(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-8 h-12 rounded-full font-bold w-full">
                      ATIVAR
                    </Button>
                 </div>
               )}
            </Card>

            {/* Box do Input Manual */}
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                      <Hash className="w-3 h-3" /> Pistola USB / Manual
                  </p>
                  {loading && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                </div>
                <form onSubmit={handleManualSubmit} className="flex gap-2">
                  <Input 
                    ref={inputRef}
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                    placeholder="Chassi ou SKU..."
                    className="font-mono uppercase tracking-widest text-lg h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:border-blue-500"
                    disabled={loading || cameraAtiva}
                    maxLength={17}
                  />
                  <Button type="submit" disabled={loading || codigo.length < 5} className="h-12 w-16 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800">
                    <ArrowRight />
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* DIREITA: FEEDBACK DO REGISTRO */}
          <div className="lg:col-span-7 h-full">
             {ultimoRegistro ? (
                <Card className="h-full border-l-8 border-l-blue-500 bg-white dark:bg-slate-900 border-y border-r border-slate-200 dark:border-slate-800 shadow-xl relative overflow-hidden animate-in slide-in-from-right duration-500">
                   <div className="absolute -right-10 -bottom-10 opacity-5 pointer-events-none">
                      <Box className="w-80 h-80 text-blue-500" />
                   </div>
                   
                   <CardContent className="p-8 flex flex-col h-full justify-center">
                      <div className="flex items-start justify-between mb-8">
                          <div>
                              <p className="text-sm font-bold text-blue-600 dark:text-blue-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                                  <CheckCircle2 className="w-5 h-5" /> Adicionado à Fila
                              </p>
                              <h2 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white leading-tight">
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
                                  <p className="text-xs text-slate-400 uppercase font-bold mb-1">Status</p>
                                  <Badge className="bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/30">
                                      AGUARDANDO
                                  </Badge>
                              </div>
                              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                                  <p className="text-xs text-slate-400 uppercase font-bold mb-1">Destino Sugerido</p>
                                  <p className="text-lg font-bold text-slate-800 dark:text-white">
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
                              Ler Próxima Caixa
                          </Button>
                      </div>
                   </CardContent>
                </Card>
             ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-slate-50/50 dark:bg-slate-900/20 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                   <div className="w-24 h-24 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 shadow-sm">
                      <ScanBarcode className="w-12 h-12 text-slate-300 dark:text-slate-600" />
                   </div>
                   <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">Pronto para Receber</h3>
                   <p className="text-slate-400 max-w-xs mx-auto mb-8">
                      Aponte para a etiqueta da caixa. O sistema registrará na fila de montagem automaticamente.
                   </p>
                </div>
             )}
          </div>
        </div>

        {/* MODAL RESOLUÇÃO MODELO DESCONHECIDO */}
        <Dialog open={modalModeloDesconhecidoOpen} onOpenChange={setModalModeloDesconhecidoOpen}>
            <DialogContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                <DialogHeader>
                    <DialogTitle className="text-amber-600 flex items-center gap-2">
                         <Box className="w-5 h-5"/> Chassi Não Reconhecido
                    </DialogTitle>
                    <DialogDescription>
                         O chassi escaneado não foi associado a nenhum modelo automaticamente. Selecione ou digite o modelo correspondente.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                    <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                        <p className="text-xs text-slate-400 uppercase font-bold">Chassi Bipado</p>
                        <p className="font-mono text-lg font-bold tracking-widest text-slate-800 dark:text-slate-100">{chassiPendente}</p>
                    </div>

                    <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                         <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                              <input 
                                   type="radio" 
                                   checked={!usarCustomModelo} 
                                   onChange={() => setUsarCustomModelo(false)} 
                                   className="text-blue-600 focus:ring-blue-500"
                              />
                              Selecionar da lista
                         </label>
                         <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                              <input 
                                   type="radio" 
                                   checked={usarCustomModelo} 
                                   onChange={() => setUsarCustomModelo(true)} 
                                   className="text-blue-600 focus:ring-blue-500"
                              />
                              Digitar manualmente
                         </label>
                    </div>

                    {!usarCustomModelo ? (
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase">Modelo do Catálogo</label>
                            <Select onValueChange={setModeloSelecionado} value={modeloSelecionado}>
                                <SelectTrigger className="w-full">
                                     <SelectValue placeholder="Selecione um modelo..."/>
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                     {MODELOS_CADASTRADOS.map(m => (
                                          <SelectItem key={m} value={m}>{m}</SelectItem>
                                     ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase">Modelo Personalizado</label>
                            <Input 
                                 placeholder="Ex: SHI 175 EFI 2026..." 
                                 value={customModelo} 
                                 onChange={e => setCustomModelo(e.target.value)} 
                                 className="uppercase"
                            />
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => setModalModeloDesconhecidoOpen(false)}>Cancelar</Button>
                    <Button 
                         onClick={async () => {
                              const mod = usarCustomModelo ? customModelo.toUpperCase().trim() : modeloSelecionado;
                              if (!mod) return toast.warning("Defina o modelo antes de salvar");
                              
                              setModalModeloDesconhecidoOpen(false);
                              await registrarMotoNoBanco(chassiPendente, mod, metadadosPendentes);
                         }} 
                         className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                         Confirmar Entrada
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

      </div>
    </RoleGuard>
  );
}