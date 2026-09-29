"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Bell, LogOut, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Search, Sparkles, Sun, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Iniciais } from "@/components/sgm/Iniciais";
import { sair, useHidratado, useUsuarioLogado } from "@/lib/auth";
import { rotaDoCaminho } from "@/lib/rbac/rotas";
import { EVENTO_ABRIR_BUSCA } from "./BuscaRapida";
import { SinoNotificacoes } from "./SinoNotificacoes";
import { EVENTO_ABRIR_NOVIDADES } from "./NovidadesV2";

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
  const { theme, setTheme } = useTheme();
  const rota = rotaDoCaminho(pathname);

  const sairDoSistema = async () => {
    await sair();
    router.replace("/login?motivo=saiu");
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 sm:px-5 print:hidden">
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

      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold leading-tight">{rota?.titulo ?? "SGM"}</p>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">{rota?.descricao ?? "Sistema de Gestão de Montagem"}</p>
      </div>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_BUSCA))}
        className="hidden h-10 w-60 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent md:flex xl:w-72"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate whitespace-nowrap text-left">Buscar chassi ou tela</span>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium">Ctrl K</kbd>
      </button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_BUSCA))} aria-label="Buscar">
        <Search className="size-5" />
      </Button>

      {usuario && <SinoNotificacoes />}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex items-center gap-2 rounded-full p-0.5 outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring" aria-label="Menu da conta">
            <Iniciais nome={usuario?.nome} />
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
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Tema</DropdownMenuLabel>
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
                className={`flex flex-col items-center gap-1 rounded-md py-2 text-xs ${hidratado && theme === valor ? "bg-accent font-semibold text-foreground" : "text-muted-foreground hover:bg-accent/60"}`}
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
