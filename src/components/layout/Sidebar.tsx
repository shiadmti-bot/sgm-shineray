"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { sair, useUsuarioLogado } from "@/lib/auth";
import { GRUPOS_NAVEGACAO, rotasPermitidas, type RotaSistema } from "@/lib/rbac/rotas";
import { Iniciais } from "@/components/sgm/Iniciais";
import { iconeDaRota } from "./icones";

const CHAVE_GRUPOS = "sgm_menu_grupos_fechados";
const EVENTO_GRUPOS = "sgm:menu-grupos";

function lerFechados(): string {
  try {
    return localStorage.getItem(CHAVE_GRUPOS) || "";
  } catch {
    return "";
  }
}

function assinarGrupos(f: () => void) {
  window.addEventListener(EVENTO_GRUPOS, f);
  return () => window.removeEventListener(EVENTO_GRUPOS, f);
}

function alternarGrupo(grupo: string) {
  const atuais = new Set(lerFechados().split("|").filter(Boolean));
  if (atuais.has(grupo)) atuais.delete(grupo);
  else atuais.add(grupo);
  try {
    localStorage.setItem(CHAVE_GRUPOS, [...atuais].join("|"));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENTO_GRUPOS));
}

/** Menu lateral agrupado por área. `compacto` mostra só os ícones (tablets em paisagem). */
export function Sidebar({ compacto = false, aoNavegar }: { compacto?: boolean; aoNavegar?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const usuario = useUsuarioLogado();
  const fechados = new Set(useSyncExternalStore(assinarGrupos, lerFechados, () => "").split("|").filter(Boolean));

  const rotas = rotasPermitidas(usuario).filter((r) => !r.oculta);
  const grupos = GRUPOS_NAVEGACAO.map((g) => ({ grupo: g, rotas: rotas.filter((r) => r.grupo === g) })).filter((g) => g.rotas.length > 0);

  const ativo = (r: RotaSistema) => pathname === r.href || pathname?.startsWith(`${r.href}/`);

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border", compacto ? "justify-center px-2" : "px-5", aoNavegar && "pr-12")}>
        <Link href="/dashboard" onClick={aoNavegar} className="flex min-w-0 flex-1 items-center gap-2.5" aria-label="Início">
          <Image src="/shineray-logo.png" alt="SGM by Sabel" width={36} height={36} className="size-9 shrink-0 rounded-full" priority />
          {!compacto && (
            <>
              <span className="min-w-0 leading-tight">
                <span className="block text-sm font-bold text-foreground">SGM</span>
                <span className="block truncate text-[11px] text-muted-foreground">Shineray by Sabel</span>
              </span>
              <span className="ml-auto rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">V2</span>
            </>
          )}
        </Link>
      </div>

      <nav className={cn("flex-1 space-y-4 overflow-y-auto py-4 scrollbar-hide", compacto ? "px-2" : "px-3")} aria-label="Menu principal">
        {!usuario && (
          <div className="space-y-2 px-2">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-muted" />)}
          </div>
        )}
        {grupos.map(({ grupo, rotas: itens }) => {
          const fechado = !compacto && fechados.has(grupo) && !itens.some(ativo);
          return (
            <div key={grupo} className="space-y-1">
              {compacto ? (
                <div className="mx-auto my-2 h-px w-6 bg-sidebar-border first:hidden" />
              ) : (
                <button
                  type="button"
                  onClick={() => alternarGrupo(grupo)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  aria-expanded={!fechado}
                >
                  {grupo}
                  <ChevronDown className={cn("size-3.5 transition-transform", fechado && "-rotate-90")} />
                </button>
              )}
              {!fechado &&
                itens.map((r) => {
                  const Icone = iconeDaRota(r.href);
                  const selecionado = ativo(r);
                  return (
                    <Link
                      key={r.href}
                      href={r.href}
                      onClick={aoNavegar}
                      title={compacto ? r.titulo : undefined}
                      aria-current={selecionado ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        compacto ? "size-11 justify-center" : "alvo-toque px-3 py-2",
                        selecionado
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      {selecionado && !compacto && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" />}
                      <Icone className={cn("size-[18px] shrink-0", selecionado ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                      {!compacto && <span className="truncate">{r.titulo}</span>}
                    </Link>
                  );
                })}
            </div>
          );
        })}
      </nav>

      {usuario && (
        <div className={cn("shrink-0 border-t border-sidebar-border p-3", compacto && "flex flex-col items-center gap-2")}>
          {compacto ? (
            <>
              <Link href="/perfil" onClick={aoNavegar} title={usuario.nome}>
                <Iniciais nome={usuario.nome} />
              </Link>
              <button
                type="button"
                title="Sair"
                aria-label="Sair"
                className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={async () => { aoNavegar?.(); await sair(); router.replace("/login?motivo=saiu"); }}
              >
                <LogOut className="size-4" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 rounded-xl p-2 hover:bg-accent">
              <Link href="/perfil" onClick={aoNavegar} className="flex min-w-0 flex-1 items-center gap-3">
                <Iniciais nome={usuario.nome} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{usuario.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">{usuario.perfil?.nome ?? "Sem perfil"}</p>
                </div>
              </Link>
              <button
                type="button"
                title="Sair"
                aria-label="Sair"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={async () => { aoNavegar?.(); await sair(); router.replace("/login?motivo=saiu"); }}
              >
                <LogOut className="size-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
