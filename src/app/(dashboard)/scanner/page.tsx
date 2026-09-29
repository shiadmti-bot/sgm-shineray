"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/sgm/PageHeader";
import { EmptyState } from "@/components/sgm/EmptyState";
import { Led } from "@/components/sgm/Led";
import { Painel } from "@/components/sgm/Painel";
import { PlacaChassi } from "@/components/sgm/PlacaChassi";
import { StatusBadge } from "@/components/sgm/StatusBadge";
import { useZxing } from "react-zxing";
import { ScanBarcode, ArrowRight, CheckCircle2, Loader2, Camera, XCircle, History, AlertTriangle, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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

interface Metadados {
  ano: string;
  fabrica: string;
  origem?: string;
}

interface RegistroEntrada {
  sku: string;
  modelo: string;
  ano?: string | null;
}

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
  const [ultimoRegistro, setUltimoRegistro] = useState<RegistroEntrada | null>(null);
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Estados para QoL de Modelo Desconhecido
  const [modalModeloDesconhecidoOpen, setModalModeloDesconhecidoOpen] = useState(false);
  const [chassiPendente, setChassiPendente] = useState("");
  const [metadadosPendentes, setMetadadosPendentes] = useState<Metadados | null>(null);
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

    } catch (err) {
      console.error("Erro scanner:", err);
      toast.error("Erro ao registrar entrada."); 
      setLoading(false);
      setCodigo("");
    }
  };

  const registrarMotoNoBanco = async (chassi: string, modelo: string, metadados: Metadados | null) => {
    setLoading(true);
    try {
      // 3. Registro na Fila
      const { data: novaMoto, error: erroInsert } = await supabase
        .from('motos')
        .insert({
          sku: chassi,
          modelo: modelo,
          ano: metadados?.ano ?? null,
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

      await registrarLog('ENTRADA_ESTOQUE', chassi, { modelo, ano: metadados?.ano, fabrica: metadados?.fabrica, origem: metadados?.origem || 'manual' });
      registrarLeitura(chassi, modelo, true, 'Adicionada à fila');

      // 4. Resultado na tela
      setUltimoRegistro({ sku: novaMoto.sku, modelo: novaMoto.modelo, ano: novaMoto.ano });

      toast.success("Entrada Registrada!", {
        description: `${modelo} enviada para montagem.`
      });

      // Efeito Sonoro
      tocarSom('sucesso');

    } catch (err) {
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

  const registradas = leituras.filter(l => l.ok).length;

  return (
      <div className="flex flex-col gap-6 pb-16">
        <PageHeader
          titulo="Entrada"
          descricao={<>Bipe o chassi de cada caixa recebida no CD. A moto entra no fim da fila da Montagem (E2) como <strong className="font-semibold text-foreground">Aguardando montagem</strong>.</>}
          acoes={
            <span className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium">
              <Led estado={loading ? "processo" : cameraAtiva ? "processo" : "bom"} piscando={loading} />
              {loading ? "Registrando…" : cameraAtiva ? "Lendo pela câmera" : "Leitor pronto"}
            </span>
          }
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-5">
            <Painel titulo="Leitura do chassi" codigo="E1" icone={ScanBarcode}>
              <form onSubmit={handleManualSubmit} className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                  placeholder="Chassi (17 caracteres)"
                  aria-label="Chassi"
                  className="h-14 bg-background font-mono text-lg uppercase tracking-[0.18em]"
                  disabled={loading || cameraAtiva}
                  maxLength={17}
                />
                <Button type="submit" variant="grafite" disabled={loading || codigo.length < 5} className="h-14 w-16" aria-label="Registrar entrada">
                  {loading ? <Loader2 className="animate-spin" /> : <ArrowRight className="size-5" />}
                </Button>
              </form>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-sutil">
                <span>Com a pistola USB é só bipar: o campo já fica selecionado.</span>
                <span className="font-mono tabular-nums">{codigo.length}/17</span>
              </div>
            </Painel>

            <Painel
              titulo="Câmera do tablet"
              icone={Camera}
              semRecuo
              acoes={cameraAtiva ? (
                <Button variant="outline" size="sm" onClick={() => setCameraAtiva(false)}>
                  <XCircle /> Desligar
                </Button>
              ) : undefined}
            >
              {cameraAtiva ? (
                <div className="relative aspect-video bg-sidebar lg:aspect-[4/3]">
                  <video ref={ref} className="size-full object-cover" />
                  <div className="pointer-events-none absolute inset-8 flex flex-col items-center justify-center rounded-sm border-2 border-white/60">
                    <span className="h-0.5 w-full bg-primary/90" />
                    <span className="mt-2 rounded-sm bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white">ALINHE O CÓDIGO DE BARRAS</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4 p-4">
                  <p className="text-sm text-muted-foreground">Sem pistola? Use a câmera traseira do tablet para ler a etiqueta.</p>
                  <Button variant="outline" onClick={() => setCameraAtiva(true)} className="shrink-0">
                    <Camera /> Ligar câmera
                  </Button>
                </div>
              )}
            </Painel>

            {leituras.length > 0 && (
              <Painel titulo="Leituras desta sessão" icone={History} meta={`${registradas} registrada(s)`} semRecuo>
                <ul className="divide-y">
                  {leituras.map((l, i) => (
                    <li key={`${l.chassi}-${i}`} className="flex items-center gap-2.5 px-4 py-2 text-xs">
                      {l.ok ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Registrada" /> : <AlertTriangle className="size-4 shrink-0 text-destructive" aria-label="Não registrada" />}
                      <span className="font-mono text-foreground">{l.chassi}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{l.modelo} · {l.mensagem}</span>
                      <span className="shrink-0 font-mono text-sutil">{l.hora}</span>
                    </li>
                  ))}
                </ul>
              </Painel>
            )}
          </div>

          <div className="lg:col-span-7">
            {ultimoRegistro ? (
              <Painel
                titulo="Adicionada à fila"
                icone={CheckCircle2}
                className="h-full border-l-[3px] border-l-success"
                acoes={
                  <Button variant="outline" size="sm" onClick={() => setUltimoRegistro(null)}>
                    Ler próxima caixa
                  </Button>
                }
              >
                <div className="space-y-6">
                  <div className="space-y-1">
                    <p className="rotulo text-sutil">Modelo reconhecido</p>
                    <h2 className="text-3xl font-semibold leading-tight md:text-4xl">{ultimoRegistro.modelo}</h2>
                  </div>
                  <PlacaChassi chassi={ultimoRegistro.sku} tamanho="lg" explicar modelo={ultimoRegistro.modelo} />
                  <dl className="grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-3">
                    <div>
                      <dt className="rotulo text-sutil">Ano-modelo</dt>
                      <dd className="mt-1.5 text-lg font-semibold">{ultimoRegistro.ano || "—"}</dd>
                    </div>
                    <div>
                      <dt className="rotulo text-sutil">Etapa</dt>
                      <dd className="mt-1.5"><StatusBadge status="aguardando_montagem" /></dd>
                    </div>
                    <div>
                      <dt className="rotulo text-sutil">Próximo passo</dt>
                      <dd className="mt-1.5 flex items-center gap-2 text-sm font-medium"><span className="codigo-estacao">E2</span> Montagem</dd>
                    </div>
                  </dl>
                </div>
              </Painel>
            ) : (
              <EmptyState
                icone={ScanBarcode}
                titulo="Pronto para receber"
                descricao="Cada caixa bipada vira uma moto na fila de montagem."
                passos={[
                  "Bipe a etiqueta do chassi na caixa (17 caracteres, só letras e números).",
                  "O sistema confere se o chassi já foi registrado e reconhece o modelo pelo código VDS (posições 4 a 9).",
                  "Se o modelo não for reconhecido, você escolhe na lista antes de confirmar.",
                  "A moto entra no fim da fila da Montagem (E2).",
                ]}
                className="h-full"
              />
            )}
          </div>
        </div>

        {/* MODAL RESOLUÇÃO MODELO DESCONHECIDO */}
        <Dialog open={modalModeloDesconhecidoOpen} onOpenChange={setModalModeloDesconhecidoOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                         <TriangleAlert className="size-5 text-warning"/> Chassi não reconhecido
                    </DialogTitle>
                    <DialogDescription>
                         O chassi escaneado não foi associado a nenhum modelo automaticamente. Selecione ou digite o modelo correspondente.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                    {chassiPendente && <PlacaChassi chassi={chassiPendente} tamanho="md" explicar />}

                    <div className="flex items-center gap-4 border-b pb-3">
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
                            <label className="rotulo text-sutil">Modelo do catálogo</label>
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
                            <label className="rotulo text-sutil">Modelo personalizado</label>
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
                    >
                         Confirmar Entrada
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

      </div>
  );
}