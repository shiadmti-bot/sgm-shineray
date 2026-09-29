"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import {
  ArrowRight, BellRing, Boxes, Camera, ChevronLeft, Delete, Eye, EyeOff, History, KeyRound, Loader2, LogIn, ShieldCheck, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Iniciais } from "@/components/sgm/Iniciais";
import { cn } from "@/lib/utils";
import { entrar, sair, useHidratado, useSessao, type ModoLogin } from "@/lib/auth";
import { caminhoInternoSeguro, telaInicial } from "@/lib/rbac/rotas";

const MAX_TENTATIVAS = 5;
const BLOQUEIO_MS = 30_000;
const CHAVE_LEMBRAR = "sgm_lembrar_usuario";

const MENSAGENS_MOTIVO: Record<string, string> = {
  expirada: "Sua sessão terminou (limite de 12 horas). Entre novamente.",
  inativo: "Seu acesso foi desativado. Procure o gestor responsável.",
  saiu: "Você saiu do sistema.",
};

const NOVIDADES = [
  { icone: ShieldCheck, texto: "Perfis de acesso personalizáveis" },
  { icone: History, texto: "Prontuário completo de cada chassi" },
  { icone: Boxes, texto: "Inventário do pátio por leitura" },
  { icone: Camera, texto: "Fotos nas avarias e na qualidade" },
  { icone: BellRing, texto: "Central de notificações" },
];

function lerLembrado(): string {
  try {
    return localStorage.getItem(CHAVE_LEMBRAR) || "";
  } catch {
    return "";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const hidratado = useHidratado();
  const { status, usuario } = useSessao();

  const [modo, setModo] = useState<ModoLogin>("senha");
  const modoRef = useRef<ModoLogin>("senha");
  const [carregando, setCarregando] = useState(false);

  // Senha (o usuário lembrado só é lido no navegador, depois da hidratação)
  const lembrado = useSyncExternalStore(assinarNada, lerLembrado, () => "");
  const [identificadorDigitado, setIdentificador] = useState<string | null>(null);
  const identificador = identificadorDigitado ?? lembrado;
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrarEscolhido, setLembrar] = useState<boolean | null>(null);
  const lembrar = lembrarEscolhido ?? Boolean(lembrado);

  // PIN
  const [etapaPin, setEtapaPin] = useState<"matricula" | "pin">("matricula");
  const [matricula, setMatricula] = useState("");
  const [pin, setPin] = useState("");

  // Proteção local contra tentativa e erro (o servidor também limita)
  const [falhas, setFalhas] = useState(0);
  const [bloqueadoAte, setBloqueadoAte] = useState(0);

  const parametros = hidratado ? new URLSearchParams(window.location.search) : null;
  const motivo = parametros?.get("motivo") ?? null;
  const voltar = caminhoInternoSeguro(parametros?.get("voltar"));

  const irParaSistema = useCallback(
    (destinoPadrao: string, trocarSenha: boolean) => {
      router.replace(trocarSenha ? "/trocar-senha" : voltar || destinoPadrao);
    },
    [router, voltar],
  );

  const bloqueado = () => {
    if (Date.now() < bloqueadoAte) {
      toast.error(`Muitas tentativas. Aguarde ${Math.ceil((bloqueadoAte - Date.now()) / 1000)}s.`);
      return true;
    }
    return false;
  };

  const contarFalha = () => {
    const total = falhas + 1;
    if (total >= MAX_TENTATIVAS) {
      setBloqueadoAte(Date.now() + BLOQUEIO_MS);
      setFalhas(0);
      toast.error("Acesso bloqueado por 30 segundos após várias tentativas.");
    } else {
      setFalhas(total);
    }
  };

  const executarLogin = useCallback(
    async (id: string, segredo: string, modoLogin: ModoLogin) => {
      setCarregando(true);
      const resultado = await entrar(id, segredo, modoLogin);
      setCarregando(false);
      if (!resultado.ok) {
        toast.error(resultado.erro);
        return false;
      }
      setFalhas(0);
      toast.success(`Bem-vindo(a), ${resultado.usuario.nome.split(" ")[0]}!`);
      irParaSistema(telaInicial(resultado.usuario), resultado.usuario.trocarSenha);
      return true;
    },
    [irParaSistema],
  );

  const enviarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = identificador.trim();
    if (!id || !senha) return toast.warning("Preencha usuário e senha.");
    if (bloqueado()) return;
    try {
      if (lembrar) localStorage.setItem(CHAVE_LEMBRAR, id);
      else localStorage.removeItem(CHAVE_LEMBRAR);
    } catch {
      /* ignore */
    }
    const ok = await executarLogin(id, senha, "senha");
    if (!ok) {
      contarFalha();
      setSenha("");
    }
  };

  // Teclado numérico (tela e teclado físico). Refs: dígitos digitados muito rápido (ou por leitor)
  // não podem se perder entre uma renderização e outra.
  const matriculaRef = useRef("");
  const pinRef = useRef("");
  const etapaRef = useRef<"matricula" | "pin">("matricula");
  const ocupadoRef = useRef(false);
  const definirMatricula = (v: string) => { matriculaRef.current = v; setMatricula(v); };
  const definirPin = (v: string) => { pinRef.current = v; setPin(v); };
  const definirEtapa = (v: "matricula" | "pin") => { etapaRef.current = v; setEtapaPin(v); };

  const enviarPin = async (pinFinal: string) => {
    if (Date.now() < bloqueadoAte) {
      toast.error(`Muitas tentativas. Aguarde ${Math.ceil((bloqueadoAte - Date.now()) / 1000)}s.`);
      definirPin("");
      return;
    }
    ocupadoRef.current = true;
    const ok = await executarLogin(matriculaRef.current, pinFinal, "pin");
    ocupadoRef.current = false;
    if (!ok) {
      definirPin("");
      contarFalha();
    }
  };

  const digitar = (n: string) => {
    if (ocupadoRef.current) return;
    if (etapaRef.current === "matricula") {
      if (matriculaRef.current.length < 10) definirMatricula(matriculaRef.current + n);
    } else if (pinRef.current.length < 4) {
      const novo = pinRef.current + n;
      definirPin(novo);
      if (novo.length === 4) enviarPin(novo);
    }
  };

  const apagar = () => {
    if (ocupadoRef.current) return;
    if (etapaRef.current === "matricula") definirMatricula(matriculaRef.current.slice(0, -1));
    else definirPin(pinRef.current.slice(0, -1));
  };

  const avancar = () => {
    if (ocupadoRef.current || etapaRef.current !== "matricula") return;
    if (matriculaRef.current.length < 1) return toast.warning("Digite a matrícula.");
    definirEtapa("pin");
  };

  const voltarParaMatricula = () => {
    definirEtapa("matricula");
    definirPin("");
  };

  // O teclado físico sempre chama a versão mais recente das ações
  const acoesTeclado = useRef({ digitar, apagar, avancar, voltarParaMatricula });
  useEffect(() => {
    acoesTeclado.current = { digitar, apagar, avancar, voltarParaMatricula };
  });

  // Registrado uma única vez: nenhuma tecla se perde logo após trocar para o modo PIN
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (modoRef.current !== "pin" || e.ctrlKey || e.metaKey || e.altKey) return;
      const acoes = acoesTeclado.current;
      const tratada = /^[0-9]$/.test(e.key) || e.key === "Backspace" || e.key === "Enter" || e.key === "Escape";
      // Sem isso, o Enter também "clica" o botão em foco (ex.: a aba PIN), zerando a matrícula
      if (tratada) e.preventDefault();
      if (/^[0-9]$/.test(e.key)) acoes.digitar(e.key);
      else if (e.key === "Backspace") acoes.apagar();
      else if (e.key === "Enter") acoes.avancar();
      else if (e.key === "Escape" && etapaRef.current === "pin") acoes.voltarParaMatricula();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  const trocarModo = (novo: ModoLogin) => {
    modoRef.current = novo;
    setModo(novo);
    definirEtapa("matricula");
    definirMatricula("");
    definirPin("");
    setSenha("");
  };

  const sessaoAtiva = status === "autenticado" && usuario;

  return (
    <div className="flex min-h-screen bg-background">
      {/* Ambientação */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-zinc-950 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-32 -top-32 size-[28rem] rounded-full bg-red-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-red-900/30 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <Image src="/shineray-logo.png" alt="SGM by Sabel" width={56} height={56} className="size-14 rounded-full" priority />
          <div className="leading-tight">
            <p className="text-lg font-bold">SGM</p>
            <p className="text-xs text-white/60">Shineray by Sabel</p>
          </div>
          <span className="ml-2 rounded-full border border-white/15 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-white/80">V2</span>
        </div>
        <div className="relative space-y-6">
          <h1 className="text-5xl font-black leading-[1.05] tracking-tight">
            Gestão de montagem,
            <br />
            <span className="text-red-500">do recebimento à expedição.</span>
          </h1>
          <ul className="space-y-3 text-white/80">
            {NOVIDADES.map(({ icone: Icone, texto }) => (
              <li key={texto} className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">
                  <Icone className="size-4 text-red-400" />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/40">Shineray by Sabel · Sistema de Gestão de Montagem</p>
      </div>

      {/* Formulários */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <Image src="/shineray-logo.png" alt="SGM by Sabel" width={72} height={72} className="mb-6 size-[72px] rounded-full lg:hidden" priority />
            <h2 className="text-3xl font-bold tracking-tight">Entrar</h2>
            <p className="text-sm text-muted-foreground">Use sua matrícula (ou e-mail) e senha. Na linha de montagem, use o PIN.</p>
          </div>

          {motivo && MENSAGENS_MOTIVO[motivo] && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">{MENSAGENS_MOTIVO[motivo]}</div>
          )}

          {sessaoAtiva && (
            <div className="space-y-2 rounded-xl border bg-card p-4">
              <button
                type="button"
                onClick={() => irParaSistema(telaInicial(usuario), usuario.trocarSenha)}
                className="flex w-full items-center gap-3 text-left"
              >
                <Iniciais nome={usuario.nome} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">Continuar como {usuario.nome}</p>
                  <p className="text-xs text-muted-foreground">{usuario.perfil?.nome ?? "Sem perfil"} · sessão ativa neste dispositivo</p>
                </div>
                <LogIn className="size-5 text-primary" />
              </button>
              <button
                type="button"
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => sair("troca_de_usuario")}
              >
                Não é você? Sair e entrar com outro usuário
              </button>
            </div>
          )}

          {/* Alternância Senha / PIN */}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Forma de acesso">
            {([
              { valor: "senha", rotulo: "Senha", icone: KeyRound },
              { valor: "pin", rotulo: "PIN da linha", icone: Wrench },
            ] as const).map(({ valor, rotulo, icone: Icone }) => (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={modo === valor}
                onClick={() => trocarModo(valor)}
                className={cn(
                  "alvo-toque flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors",
                  modo === valor ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icone className="size-4" /> {rotulo}
              </button>
            ))}
          </div>

          {modo === "senha" ? (
            <form onSubmit={enviarSenha} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="usuario">Matrícula ou e-mail</Label>
                <Input
                  id="usuario"
                  autoComplete="username"
                  autoCapitalize="none"
                  placeholder="Ex.: 2001 ou nome@empresa.com"
                  value={identificador}
                  onChange={(e) => setIdentificador(e.target.value)}
                  className="h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senha">Senha</Label>
                <div className="relative">
                  <Input
                    id="senha"
                    type={mostrarSenha ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    className="h-12 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:text-foreground"
                    aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {mostrarSenha ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </div>
              </div>
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" className="size-4 accent-[hsl(var(--primary))]" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
                Lembrar meu usuário neste dispositivo
              </label>
              <Button type="submit" className="h-12 w-full text-base font-semibold" disabled={carregando}>
                {carregando ? <Loader2 className="animate-spin" /> : <>Entrar <ArrowRight /></>}
              </Button>
              <p className="text-center text-xs text-muted-foreground">Esqueceu a senha? Peça ao gestor para redefinir na tela Equipe.</p>
            </form>
          ) : (
            <div className="mx-auto w-full max-w-xs space-y-6">
              <div className="flex items-center justify-between">
                {etapaPin === "pin" ? (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
                    onClick={voltarParaMatricula}
                  >
                    <ChevronLeft className="size-4" /> Matrícula {matricula}
                  </button>
                ) : (
                  <span className="text-sm font-medium text-muted-foreground">1. Digite sua matrícula</span>
                )}
                {etapaPin === "pin" && <span className="text-sm font-medium text-muted-foreground">2. PIN</span>}
              </div>

              <div className="flex h-20 items-center justify-center rounded-2xl bg-zinc-950 font-mono text-4xl font-bold tracking-[0.4em] text-white shadow-inner">
                {etapaPin === "matricula"
                  ? matricula || <span className="text-white/20">0000</span>
                  : (
                    <span className="flex gap-4">
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className={cn("size-4 rounded-full", i < pin.length ? "bg-red-500" : "bg-white/20")} />
                      ))}
                    </span>
                  )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                  <TeclaNumerica key={n} onClick={() => digitar(n)} disabled={carregando}>{n}</TeclaNumerica>
                ))}
                <div />
                <TeclaNumerica onClick={() => digitar("0")} disabled={carregando}>0</TeclaNumerica>
                <TeclaNumerica onClick={apagar} disabled={carregando} aria-label="Apagar" className="text-primary">
                  <Delete className="size-6" />
                </TeclaNumerica>
              </div>

              {etapaPin === "matricula" ? (
                <Button type="button" className="h-14 w-full text-base font-semibold" onClick={avancar} disabled={!matricula || carregando}>
                  Continuar <ArrowRight />
                </Button>
              ) : (
                <div className="flex h-14 items-center justify-center text-sm text-muted-foreground">
                  {carregando ? <Loader2 className="size-5 animate-spin text-primary" /> : "O acesso é liberado ao digitar o 4º número."}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const assinarNada = () => () => {};

function TeclaNumerica({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-16 items-center justify-center rounded-xl border border-b-4 bg-card text-2xl font-bold text-foreground transition-all hover:bg-accent active:translate-y-0.5 active:border-b disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
