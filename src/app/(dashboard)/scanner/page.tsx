"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/sgm/PageHeader";
import { useZxing } from "react-zxing";
import { 
  ScanBarcode, ArrowRight, CheckCircle2, Loader2, Camera, XCircle, Hash, PackagePlus, Box, History, AlertTriangle
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { identificarModelo, listarModelos } from "@/lib/model-decoder"; // Importando a nova inteligência
import { registrarLog } from "@/lib/logger";
import { tocarSom } from "@/lib/sons";
import { useConfigGeral } from "@/lib/config-sistema";
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

interface Leitura {
  chassi: string;
  modelo: string;
  hora: string;
  ok: boolean;
  mensagem: string;
}

export default function ScannerPage() {
  const { config } = useConfigGeral();
  const MODELOS_CADASTRADOS = listarModelos(config.modelosExtras);
  const [leituras, setLeituras] = useState<Leitura[]>([]);
  const ultimaLeituraCamera = useRef<{ codigo: string; em: number }>({ codigo: "", em: 0 });
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
      // A câmera costuma entregar a mesma leitura várias vezes seguidas
      const agora = Date.now();
      if (ultimaLeituraCamera.current.codigo === lido && agora - ultimaLeituraCamera.current.em < 3000) return;
      ultimaLeituraCamera.current = { codigo: lido, em: agora };
      setCodigo(lido);
      setCameraAtiva(false);
      processarChassi(lido, 'camera');
    },
    onError() { 
        // Silently ignore errors during scanning frames
    }
  });

  // Foco automático no input quando a câmera fecha
  useEffect(() => {
    if (!cameraAtiva) inputRef.current?.focus();
  }, [cameraAtiva, loading, ultimoRegistro]);

  const registrarLeitura = (chassi: string, modelo: string, ok: boolean, mensagem: string) => {
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLeituras(prev => [{ chassi, modelo, hora, ok, mensagem }, ...prev].slice(0, 8));
  };

  const processarChassi = async (chassiLido: string, origem: 'camera' | 'manual' = 'manual') => {
    const chassi = chassiLido.toUpperCase().replace(/\s+/g, '').trim();

    // Validação de Vin (Chassis) - Deve ter 17 caracteres
    if (chassi.length !== 17) {
        tocarSom('erro');
        if (chassi.length > 5 && chassi.length < 15) {
             toast.error("Isso parece um MOTOR!", { description: "Por favor, escaneie o código do CHASSI (17 dígitos)." });
        } else {
             toast.warning(`Código inválido (${chassi.length} caracteres)`, { description: "O chassi deve ter exatamente 17 dígitos." });
        }
        return;
    }

    // Símbolos indicam leitura errada (chassi só tem letras e números)
    if (!/^[A-Z0-9]{17}$/.test(chassi)) {
        tocarSom('erro');
        toast.error("Leitura inválida", { description: "O chassi contém símbolos. Limpe a etiqueta e bipe novamente." });
        setCodigo("");
        return;
    }
    if (/[IOQ]/.test(chassi)) {
        toast.warning("Confira o chassi", { description: "Chassis padrão não usam as letras I, O ou Q (podem ser 1 ou 0)." });
    }

    setLoading(true);
    setUltimoRegistro(null);

    try {
      // 1. Decodificação Inteligente (Novo Model Decoder)
      const modeloIdentificado = identificarModelo(chassi, config.modelosExtras);
      const metadados = extrairMetadadosVIN(chassi);

      // 2. Verifica Duplicidade no Supabase
      const { data: existente } = await supabase
        .from('motos')
        .select('id, status, modelo')
        .eq('sku', chassi)
        .maybeSingle();

      if (existente) {
        tocarSom('erro');
        toast.error(`Moto já registrada!`, {
            description: `Modelo: ${existente.modelo} | Status: ${existente.status.toUpperCase()}`
        });
        registrarLeitura(chassi, existente.modelo, false, 'Já registrada');
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
        tocarSom('alerta');
        setLoading(false);
        setCodigo("");
        return;
      }

      await registrarMotoNoBanco(chassi, modeloIdentificado, { ...metadados, origem });

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

      if (erroInsert) {
        // 23505 = chassi já cadastrado (leitura simultânea em outra estação)
        if (erroInsert.code === '23505') {
          tocarSom('erro');
          toast.error("Moto já registrada!", { description: "Este chassi acabou de ser cadastrado por outra estação." });
          registrarLeitura(chassi, modelo, false, 'Já registrada');
          return;
        }
        throw erroInsert;
      }

      await registrarLog('ENTRADA_ESTOQUE', chassi, { modelo, ano: metadados.ano, fabrica: metadados.fabrica, origem: metadados.origem || 'manual' });
      registrarLeitura(chassi, modelo, true, 'Adicionada à fila');

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

      // Efeito Sonoro
      tocarSom('sucesso');

    } catch (err: any) {
      console.error("Erro insert:", err);
      tocarSom('erro');
      registrarLeitura(chassi, modelo, false, 'Erro ao registrar');
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
      <div className="flex min-h-[calc(100vh-160px)] flex-col gap-6 animate-in fade-in duration-500">
        <PageHeader
          icone={PackagePlus}
          titulo="Recebimento de caixas"
          descricao={<>Bipe o chassi na entrada do CD. A moto entra na fila como <strong className="text-foreground">Aguardando montagem</strong>.</>}
          acoes={
            <Badge variant={cameraAtiva ? "destructive" : "outline"} className="h-8 px-3">
              {cameraAtiva ? "Lendo pela câmera…" : "Pronto para ler"}
            </Badge>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
          
          {/* ESQUERDA: CÂMERA E INPUT */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Box da Câmera */}
            <Card className="overflow-hidden border-2 border-border bg-black relative aspect-video lg:aspect-square flex items-center justify-center shadow-inner rounded-2xl">
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
                      <p className="text-muted-foreground text-xs uppercase tracking-wide">Para bipagem móvel</p>
                    </div>
                    <Button onClick={() => setCameraAtiva(true)} className="bg-primary hover:bg-primary/90 text-white px-8 h-12 rounded-full font-bold w-full">
                      ATIVAR
                    </Button>
                 </div>
               )}
            </Card>

            {/* Box do Input Manual */}
            <Card className="bg-card border-border shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
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
                    className="font-mono uppercase tracking-widest text-lg h-12 bg-muted/50 border-border focus:border-blue-500"
                    disabled={loading || cameraAtiva}
                    maxLength={17}
                  />
                  <Button type="submit" disabled={loading || codigo.length < 5} className="h-12 w-16 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800">
                    <ArrowRight />
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Leituras desta sessão */}
            {leituras.length > 0 && (
              <Card className="bg-card border-border shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1 mb-3">
                    <History className="w-3 h-3" /> Últimas leituras ({leituras.filter(l => l.ok).length} registradas)
                  </p>
                  <ul className="space-y-1.5">
                    {leituras.map((l, i) => (
                      <li key={`${l.chassi}-${i}`} className="flex items-center gap-2 text-xs">
                        {l.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                        <span className="font-mono text-foreground/90">{l.chassi}</span>
                        <span className="text-muted-foreground truncate flex-1">{l.modelo} · {l.mensagem}</span>
                        <span className="text-muted-foreground font-mono shrink-0">{l.hora}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          {/* DIREITA: FEEDBACK DO REGISTRO */}
          <div className="lg:col-span-7 h-full">
             {ultimoRegistro ? (
                <Card className="h-full border-l-8 border-l-blue-500 bg-card border-y border-r border-border shadow-xl relative overflow-hidden animate-in slide-in-from-right duration-500">
                   <div className="absolute -right-10 -bottom-10 opacity-5 pointer-events-none">
                      <Box className="w-80 h-80 text-blue-500" />
                   </div>
                   
                   <CardContent className="p-8 flex flex-col h-full justify-center">
                      <div className="flex items-start justify-between mb-8">
                          <div>
                              <p className="text-sm font-bold text-primary uppercase tracking-widest mb-1 flex items-center gap-2">
                                  <CheckCircle2 className="w-5 h-5" /> Adicionado à Fila
                              </p>
                              <h2 className="text-3xl md:text-5xl font-black text-foreground leading-tight">
                                  {ultimoRegistro.modelo}
                              </h2>
                          </div>
                          <div className="text-right">
                              <Badge className="bg-muted text-muted-foreground text-lg px-4 py-1">
                                  {ultimoRegistro.ano}
                              </Badge>
                          </div>
                      </div>

                      <div className="space-y-6 relative z-10">
                          <div className="bg-muted/50 p-4 rounded-xl border border-border">
                              <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Chassi (VIN)</p>
                              <p className="text-2xl font-mono tracking-widest text-foreground/90">
                                  {ultimoRegistro.sku}
                              </p>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                              <div className="bg-muted/50 p-4 rounded-xl border border-border">
                                  <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Status</p>
                                  <Badge className="bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/30">
                                      AGUARDANDO
                                  </Badge>
                              </div>
                              <div className="bg-muted/50 p-4 rounded-xl border border-border">
                                  <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Destino Sugerido</p>
                                  <p className="text-lg font-bold text-foreground">
                                      {ultimoRegistro.linha_destino}
                                  </p>
                              </div>
                          </div>
                      </div>

                      <div className="mt-8 flex justify-end">
                          <Button 
                            variant="outline" 
                            onClick={() => setUltimoRegistro(null)}
                            className="border-border hover:bg-accent"
                          >
                              Ler Próxima Caixa
                          </Button>
                      </div>
                   </CardContent>
                </Card>
             ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-muted/50 rounded-2xl border-2 border-dashed border-border">
                   <div className="w-24 h-24 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 shadow-sm">
                      <ScanBarcode className="w-12 h-12 text-slate-300 dark:text-slate-600" />
                   </div>
                   <h3 className="text-xl font-bold text-foreground/90 mb-2">Pronto para Receber</h3>
                   <p className="text-muted-foreground max-w-xs mx-auto mb-8">
                      Aponte para a etiqueta da caixa. O sistema registrará na fila de montagem automaticamente.
                   </p>
                </div>
             )}
          </div>
        </div>

        {/* MODAL RESOLUÇÃO MODELO DESCONHECIDO */}
        <Dialog open={modalModeloDesconhecidoOpen} onOpenChange={setModalModeloDesconhecidoOpen}>
            <DialogContent className="bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="text-amber-600 flex items-center gap-2">
                         <Box className="w-5 h-5"/> Chassi Não Reconhecido
                    </DialogTitle>
                    <DialogDescription>
                         O chassi escaneado não foi associado a nenhum modelo automaticamente. Selecione ou digite o modelo correspondente.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                    <div className="bg-muted/50 p-3 rounded-lg border border-border">
                        <p className="text-xs text-muted-foreground uppercase font-bold">Chassi Bipado</p>
                        <p className="font-mono text-lg font-bold tracking-widest text-foreground">{chassiPendente}</p>
                    </div>

                    <div className="flex items-center gap-4 border-b border-border pb-3">
                         <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                              <input 
                                   type="radio" 
                                   checked={!usarCustomModelo} 
                                   onChange={() => setUsarCustomModelo(false)} 
                                   className="text-primary focus:ring-ring"
                              />
                              Selecionar da lista
                         </label>
                         <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                              <input 
                                   type="radio" 
                                   checked={usarCustomModelo} 
                                   onChange={() => setUsarCustomModelo(true)} 
                                   className="text-primary focus:ring-ring"
                              />
                              Digitar manualmente
                         </label>
                    </div>

                    {!usarCustomModelo ? (
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted-foreground uppercase">Modelo do Catálogo</label>
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
                            <label className="text-xs font-bold text-muted-foreground uppercase">Modelo Personalizado</label>
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
                    <Button variant="ghost" onClick={() => { setModalModeloDesconhecidoOpen(false); registrarLeitura(chassiPendente, 'Modelo desconhecido', false, 'Cancelada'); }}>Cancelar</Button>
                    <Button 
                         onClick={async () => {
                              const mod = usarCustomModelo ? customModelo.toUpperCase().trim() : modeloSelecionado;
                              if (!mod) return toast.warning("Defina o modelo antes de salvar");
                              
                              setModalModeloDesconhecidoOpen(false);
                              await registrarMotoNoBanco(chassiPendente, mod, metadadosPendentes);
                         }} 
                         className="bg-primary hover:bg-primary/90 text-white"
                    >
                         Confirmar Entrada
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

      </div>
  );
}