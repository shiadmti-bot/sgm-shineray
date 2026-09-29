"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { ArrowRight, ChevronLeft, Delete, Eye, EyeOff, KeyRound, Loader2, LogIn, Wrench } from "lucide-react";
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

const ESTACOES = [
  { codigo: "E1", titulo: "Entrada", texto: "Leitura do chassi na chegada da caixa." },
  { codigo: "E2", titulo: "Montagem", texto: "Checklist, cores e tempo de cada moto." },
  { codigo: "E3", titulo: "Qualidade", texto: "Inspeção final: aprova, devolve ou segrega." },
  { codigo: "AV", titulo: "Avarias", texto: "Reparo e nova inspeção.", desvio: true },
  { codigo: "E4", titulo: "Etiquetagem", texto: "Etiqueta impressa e envio ao estoque." },
  { codigo: "E5", titulo: "Estoque", texto: "Pátio de prontas, expedição e inventário." },
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
      {/* Painel da linha: ensina o fluxo antes mesmo de entrar */}
      <aside className="fundo-tecnico-escuro relative hidden w-[44%] max-w-[640px] flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex xl:p-12">
        <div className="flex items-center gap-3">
          <Image src="/shineray-logo.png" alt="SGM by Sabel" width={48} height={48} className="size-12 rounded-full ring-1 ring-white/15" priority />
          <div className="leading-tight">
            <p className="flex items-center gap-2">
              <span className="font-rotulo text-xl font-bold tracking-wide text-white">SGM</span>
              <span className="rounded-[2px] bg-primary px-1 font-mono text-[11px] font-semibold text-white">V2</span>
            </p>
            <p className="text-xs text-sidebar-muted">Sistema de Gestão de Montagem · Shineray by Sabel</p>
          </div>
        </div>

        <div className="space-y-7">
          <div className="space-y-2">
            <p className="rotulo text-sidebar-muted">O caminho de cada moto</p>
            <p className="max-w-md text-2xl font-semibold leading-snug text-white">
              Da caixa recebida à moto expedida, cada chassi passa por cinco estações.
            </p>
          </div>
          <ol className="relative space-y-1">
            <span aria-hidden className="absolute bottom-4 left-[19px] top-4 w-px bg-white/15" />
            {ESTACOES.map((e) => (
              <li key={e.codigo} className={cn("relative flex items-start gap-4 py-2", e.desvio && "pl-8")}>
                <span
                  className={cn(
                    "relative z-10 flex h-7 min-w-10 items-center justify-center rounded-[3px] border bg-sidebar px-1 font-mono text-[11px] font-semibold text-white",
                    e.desvio ? "border-dashed border-white/35" : "border-white/30",
                  )}
                >
                  {e.codigo}
                </span>
                <span className="min-w-0 pt-0.5">
                  <span className="block text-sm font-semibold text-white">{e.titulo}</span>
                  <span className="block text-sm text-sidebar-foreground">{e.texto}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <p className="max-w-md text-xs leading-relaxed text-sidebar-muted">
          Tudo fica no prontuário do chassi: quem montou, quanto tempo levou e por onde a moto passou.
        </p>
      </aside>

      {/* Identificação */}
      <main className="flex flex-1 items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-7">
          <div className="space-y-2">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <Image src="/shineray-logo.png" alt="SGM by Sabel" width={48} height={48} className="size-12 rounded-full" priority />
              <p className="flex items-center gap-2">
                <span className="font-rotulo text-xl font-bold tracking-wide">SGM</span>
                <span className="rounded-[2px] bg-primary px-1 font-mono text-[11px] font-semibold text-primary-foreground">V2</span>
              </p>
            </div>
            <p className="rotulo text-sutil">Acesso ao sistema</p>
            <h1 className="text-[28px] font-semibold leading-tight">Identifique-se</h1>
            <p className="text-sm text-muted-foreground">
              No escritório, use matrícula (ou e-mail) e senha. Nos tablets da linha, use o PIN de 4 números.
            </p>
          </div>

          {motivo && MENSAGENS_MOTIVO[motivo] && (
            <div className="rounded-md border border-l-[3px] border-l-warning bg-card px-4 py-3 text-sm text-foreground">{MENSAGENS_MOTIVO[motivo]}</div>
          )}

          {sessaoAtiva && (
            <div className="space-y-2 rounded-md border bg-card p-4">
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
          <div className="grid grid-cols-2 gap-1 rounded-md border bg-card p-1" role="tablist" aria-label="Forma de acesso">
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
                  "alvo-toque flex items-center justify-center gap-2 rounded-sm font-rotulo text-[15px] font-semibold uppercase tracking-[0.06em] transition-colors",
                  modo === valor ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground",
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
                  className="h-12 bg-card"
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
                    className="h-12 bg-card pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-2 text-muted-foreground hover:text-foreground"
                    aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {mostrarSenha ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </div>
              </div>
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" className="size-4 accent-[hsl(var(--foreground))]" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
                Lembrar meu usuário neste dispositivo
              </label>
              <Button type="submit" className="h-12 w-full text-base font-semibold" disabled={carregando}>
                {carregando ? <Loader2 className="animate-spin" /> : <>Entrar <ArrowRight /></>}
              </Button>
              <p className="text-xs text-sutil">Esqueceu a senha? Peça ao gestor para redefinir na tela Equipe.</p>
            </form>
          ) : (
            <div className="mx-auto w-full max-w-xs space-y-5">
              <ol className="grid grid-cols-2 gap-2 text-xs">
                <li
                  className={cn(
                    "flex items-center gap-2 rounded-sm border px-2.5 py-2",
                    etapaPin === "matricula" ? "border-foreground bg-card font-semibold text-foreground" : "text-sutil",
                  )}
                >
                  <span className="flex size-5 items-center justify-center rounded-[2px] bg-foreground font-mono text-[10px] text-background">1</span>
                  {etapaPin === "pin" ? (
                    <button type="button" onClick={voltarParaMatricula} className="flex min-w-0 items-center gap-1 hover:text-foreground">
                      <ChevronLeft className="size-3.5 shrink-0" /> <span className="truncate font-mono">{matricula}</span>
                    </button>
                  ) : (
                    "Matrícula"
                  )}
                </li>
                <li
                  className={cn(
                    "flex items-center gap-2 rounded-sm border px-2.5 py-2",
                    etapaPin === "pin" ? "border-foreground bg-card font-semibold text-foreground" : "text-sutil",
                  )}
                >
                  <span className="flex size-5 items-center justify-center rounded-[2px] bg-foreground font-mono text-[10px] text-background">2</span>
                  PIN (4 números)
                </li>
              </ol>

              {/* Visor do terminal */}
              <div className="flex h-20 items-center justify-center rounded-md border border-white/10 bg-sidebar px-4 font-mono text-4xl font-semibold tracking-[0.35em] text-white">
                {etapaPin === "matricula" ? (
                  matricula || <span className="text-white/20">0000</span>
                ) : (
                  <span className="flex gap-3" aria-label={`${pin.length} de 4 números digitados`}>
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className={cn("size-4 rounded-[3px]", i < pin.length ? "bg-primary" : "bg-white/15")} />
                    ))}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                  <TeclaNumerica key={n} onClick={() => digitar(n)} disabled={carregando}>{n}</TeclaNumerica>
                ))}
                <div />
                <TeclaNumerica onClick={() => digitar("0")} disabled={carregando}>0</TeclaNumerica>
                <TeclaNumerica onClick={apagar} disabled={carregando} aria-label="Apagar">
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
              <p className="text-center text-xs text-sutil">Também funciona pelo teclado: números, Enter para avançar e Esc para voltar.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const assinarNada = () => () => {};

function TeclaNumerica({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-16 items-center justify-center rounded-md border border-b-[3px] border-foreground/15 border-b-foreground/30 bg-card font-mono text-2xl font-semibold text-foreground transition-all hover:bg-accent active:translate-y-px active:border-b disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
