"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Bell, GraduationCap, LogOut, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, ScanBarcode, Sparkles, Sun, UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Iniciais } from "@/components/sgm/Iniciais";
import { Led } from "@/components/sgm/Led";
import { definirModoGuia, useModoGuia } from "@/components/sgm/Guia";
import { sair, useHidratado, useUsuarioLogado } from "@/lib/auth";
import { rotaDoCaminho } from "@/lib/rbac/rotas";
import { cn } from "@/lib/utils";
import { EVENTO_ABRIR_BUSCA } from "./BuscaRapida";
import { SinoNotificacoes } from "./SinoNotificacoes";
import { EVENTO_ABRIR_NOVIDADES } from "./NovidadesV2";

function assinarRede(f: () => void) {
  window.addEventListener("online", f);
  window.addEventListener("offline", f);
  return () => {
    window.removeEventListener("online", f);
    window.removeEventListener("offline", f);
  };
}

/** Relógio da linha (atualiza a cada 15 s). */
function Relogio() {
  const hidratado = useHidratado();
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  if (!hidratado) return <div className="hidden w-[84px] xl:block" />;
  return (
    <div className="hidden flex-col items-end leading-tight xl:flex" title={agora.toLocaleString("pt-BR")}>
      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
        {agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="text-[11px] text-sutil first-letter:uppercase">
        {agora.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).replace(/\./g, "")}
      </span>
    </div>
  );
}

export function Header({
  aoAbrirMenu,
  compacto,
  aoAlternarCompacto,
}: {
  aoAbrirMenu: () => void;
  compacto: boolean;
  aoAlternarCompacto: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const usuario = useUsuarioLogado();
  const hidratado = useHidratado();
  const guia = useModoGuia();
  const online = useSyncExternalStore(assinarRede, () => navigator.onLine, () => true);
  const { theme, setTheme } = useTheme();
  const rota = rotaDoCaminho(pathname);

  const sairDoSistema = async () => {
    await sair();
    router.replace("/login?motivo=saiu");
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:gap-3 sm:px-5 print:hidden">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={aoAbrirMenu} aria-label="Abrir menu">
        <Menu className="size-5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hidden lg:inline-flex"
        onClick={aoAlternarCompacto}
        aria-label={compacto ? "Expandir menu" : "Recolher menu"}
        title={compacto ? "Expandir menu" : "Recolher menu"}
      >
        {compacto ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {rota?.codigo && <span className="codigo-estacao hidden sm:inline-flex">{rota.codigo}</span>}
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight">{rota?.titulo ?? "SGM"}</p>
          <p className="hidden truncate text-xs text-sutil sm:block">{rota?.descricao ?? "Sistema de Gestão de Montagem"}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_BUSCA))}
        className="hidden h-10 w-64 items-center gap-2.5 rounded-md border border-foreground/15 bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/30 md:flex xl:w-80"
        title="Bipe o código do chassi com o leitor ou digite parte dele"
      >
        <ScanBarcode className="size-[18px] text-foreground" />
        <span className="flex-1 truncate whitespace-nowrap text-left">Bipe o chassi ou busque uma tela</span>
        <kbd className="rounded-[3px] border bg-card px-1.5 py-0.5 font-mono text-[10px] font-medium text-sutil">Ctrl K</kbd>
      </button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_BUSCA))} aria-label="Buscar chassi">
        <ScanBarcode className="size-5" />
      </Button>

      <div className="hidden items-center gap-3 border-l pl-3 xl:flex">
        <Relogio />
        <span className="flex items-center gap-1.5 text-xs text-sutil" title={online ? "Conectado ao servidor" : "Sem conexão"}>
          <Led estado={online ? "bom" : "critico"} piscando={!online} className="size-2" />
          {online ? "Online" : "Offline"}
        </span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className={cn("h-9 gap-1.5 px-2.5", hidratado && guia && "bg-info/10 text-info hover:bg-info/15 hover:text-info")}
        aria-pressed={hidratado ? guia : undefined}
        onClick={() => definirModoGuia(!guia)}
        title={guia ? "Desligar as dicas explicativas" : "Ligar as dicas explicativas de cada tela"}
      >
        <GraduationCap className="size-[18px]" />
        <span className="hidden font-rotulo text-[13px] font-semibold uppercase tracking-[0.06em] md:inline">Guia</span>
      </Button>

      {usuario && <SinoNotificacoes />}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2.5 rounded-md py-1 pl-1 pr-1 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring lg:pr-2.5"
            aria-label="Menu da conta"
          >
            <Iniciais nome={usuario?.nome} />
            <span className="hidden min-w-0 text-left lg:block">
              <span className="block max-w-36 truncate text-sm font-semibold leading-tight">{usuario?.nome}</span>
              <span className="rotulo block pt-0.5 text-[10px] text-sutil">{usuario?.perfil?.nome ?? "Sem perfil"}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-normal">
            <p className="truncate text-sm font-semibold">{usuario?.nome ?? "—"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {usuario?.perfil?.nome ?? "Sem perfil"}
              {usuario?.matricula ? ` · matrícula ${usuario.matricula}` : ""}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/perfil"><UserRound /> Meu perfil</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/notificacoes"><Bell /> Notificações</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => window.dispatchEvent(new Event(EVENTO_ABRIR_NOVIDADES))}>
            <Sparkles /> Novidades da V2
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="rotulo text-sutil">Tema</DropdownMenuLabel>
          <div className="grid grid-cols-3 gap-1 px-1 pb-1">
            {([
              { valor: "light", rotulo: "Claro", icone: Sun },
              { valor: "dark", rotulo: "Escuro", icone: Moon },
              { valor: "system", rotulo: "Auto", icone: Monitor },
            ] as const).map(({ valor, rotulo, icone: Icone }) => (
              <button
                key={valor}
                type="button"
                onClick={() => setTheme(valor)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-sm py-2 text-xs",
                  hidratado && theme === valor ? "bg-foreground font-semibold text-background" : "text-muted-foreground hover:bg-accent",
                )}
              >
                <Icone className="size-4" /> {rotulo}
              </button>
            ))}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={sairDoSistema} className="text-destructive focus:text-destructive">
            <LogOut /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
