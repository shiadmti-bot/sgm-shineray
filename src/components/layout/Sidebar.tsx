"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { sair, useUsuarioLogado } from "@/lib/auth";
import { GRUPOS_NAVEGACAO, rotasPermitidas, type RotaSistema } from "@/lib/rbac/rotas";
import { useContagensLinha, type ContagensLinha } from "@/lib/contagens";
import { useConfigGeral } from "@/lib/config-sistema";
import { iniciais } from "@/components/sgm/Iniciais";
import { Led, type EstadoLed } from "@/components/sgm/Led";
import { iconeDaRota } from "./icones";

const GRUPOS_DO_FLUXO = new Set(["Linha de montagem", "Expedição"]);
const DESVIOS = new Set(["AV", "IN"]);

interface Contagem {
  valor: number;
  alerta?: EstadoLed;
  dica: string;
}

function contagemDaRota(href: string, c: ContagensLinha, limiteFilaQA: number): Contagem | null {
  if (!c.atualizadoEm) return null;
  switch (href) {
    case "/scanner":
      return { valor: c.fila, dica: `${c.fila} caixa(s) aguardando montagem` };
    case "/montagem":
      return {
        valor: c.montagem + c.pausadas,
        alerta: c.pausadas > 0 ? "atencao" : undefined,
        dica: `${c.montagem} em montagem · ${c.pausadas} pausada(s)`,
      };
    case "/qualidade":
      return {
        valor: c.qualidade,
        alerta: c.qualidade > limiteFilaQA ? "atencao" : undefined,
        dica: `${c.qualidade} aguardando inspeção (limite ${limiteFilaQA})`,
      };
    case "/avarias":
      return { valor: c.avarias, alerta: c.avarias > 0 ? "critico" : undefined, dica: `${c.avarias} moto(s) no pátio de avarias` };
    case "/etiquetagem":
      return { valor: c.etiqueta, dica: `${c.etiqueta} aguardando etiqueta` };
    case "/estoque":
      return { valor: c.estoque, dica: `${c.estoque} moto(s) em estoque` };
    default:
      return null;
  }
}

/**
 * Menu lateral "Estações": grafite nos dois temas, com o código de cada estação (E1…E5)
 * ligado por um trilho — ensina a ordem do fluxo — e a quantidade de motos em cada uma.
 * `compacto` mostra só códigos e ícones (tablets em paisagem).
 */
export function Sidebar({ compacto = false, aoNavegar }: { compacto?: boolean; aoNavegar?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const usuario = useUsuarioLogado();
  const contagens = useContagensLinha();
  const { config } = useConfigGeral();

  const rotas = rotasPermitidas(usuario).filter((r) => !r.oculta);
  const grupos = GRUPOS_NAVEGACAO.map((g) => ({ grupo: g, rotas: rotas.filter((r) => r.grupo === g) })).filter((g) => g.rotas.length > 0);
  const ativo = (r: RotaSistema) => pathname === r.href || pathname?.startsWith(`${r.href}/`);

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border", compacto ? "justify-center px-2" : "px-4", aoNavegar && "pr-12")}>
        <Link href="/dashboard" onClick={aoNavegar} className="flex min-w-0 flex-1 items-center gap-2.5" aria-label="Central da linha">
          <Image src="/shineray-logo.png" alt="SGM by Sabel" width={36} height={36} className="size-9 shrink-0 rounded-full ring-1 ring-white/15" priority />
          {!compacto && (
            <span className="min-w-0 leading-tight">
              <span className="flex items-center gap-2">
                <span className="font-rotulo text-lg font-bold tracking-wide text-white">SGM</span>
                <span className="rounded-[2px] bg-primary px-1 font-mono text-[10px] font-semibold text-white">V2</span>
              </span>
              <span className="block truncate text-[11px] text-sidebar-muted">Shineray by Sabel</span>
            </span>
          )}
        </Link>
      </div>

      <nav className={cn("flex-1 overflow-y-auto pb-4 scrollbar-hide", compacto ? "px-2 pt-2" : "px-2")} aria-label="Menu principal">
        {!usuario && (
          <div className="space-y-2 px-2 pt-4">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-9 animate-pulse rounded-sm bg-white/5" />)}
          </div>
        )}
        {grupos.map(({ grupo, rotas: itens }) => {
          const fluxo = GRUPOS_DO_FLUXO.has(grupo);
          return (
            <div key={grupo} className="pt-3">
              {compacto ? (
                <div className="mx-auto mb-2 h-px w-8 bg-sidebar-border" />
              ) : (
                <p className="rotulo px-2.5 pb-2 text-sidebar-muted">{grupo}</p>
              )}
              <div className="relative space-y-0.5">
                {fluxo && !compacto && itens.length > 1 && (
                  <span aria-hidden className="absolute bottom-5 left-[26px] top-5 w-px bg-white/15" />
                )}
                {itens.map((r) => {
                  const selecionado = ativo(r);
                  const contagem = contagemDaRota(r.href, contagens, config.limiteFilaQA);
                  const Icone = iconeDaRota(r.href);
                  const desvio = r.codigo ? DESVIOS.has(r.codigo) : false;
                  return (
                    <Link
                      key={r.href}
                      href={r.href}
                      onClick={aoNavegar}
                      title={compacto ? `${r.codigo ? `${r.codigo} · ` : ""}${r.titulo}${contagem ? ` — ${contagem.dica}` : ""}` : contagem?.dica}
                      aria-current={selecionado ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center rounded-sm text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/40",
                        compacto ? "h-11 justify-center" : "h-10 gap-3 pl-2.5 pr-2.5",
                        selecionado ? "bg-sidebar-accent text-white" : "text-sidebar-foreground hover:bg-white/[0.04] hover:text-white",
                      )}
                    >
                      {selecionado && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-[1px] bg-primary" />}
                      <span className="relative z-10 flex w-8 shrink-0 justify-center">
                        {r.codigo ? (
                          <span
                            className={cn(
                              "flex h-6 min-w-8 items-center justify-center rounded-[3px] border px-1 font-mono text-[10px] font-semibold",
                              selecionado
                                ? "border-primary bg-primary text-white"
                                : cn("bg-sidebar text-white/75 group-hover:text-white", desvio ? "border-dashed border-white/35" : "border-white/25"),
                            )}
                          >
                            {r.codigo}
                          </span>
                        ) : (
                          <Icone className={cn("size-[18px]", selecionado ? "text-white" : "text-sidebar-muted group-hover:text-white")} />
                        )}
                        {compacto && contagem?.alerta && <Led estado={contagem.alerta} className="absolute -right-0.5 -top-0.5 size-2" />}
                      </span>
                      {!compacto && (
                        <>
                          <span data-rotulo className={cn("min-w-0 flex-1 truncate", selecionado ? "font-semibold" : "font-medium")}>{r.titulo}</span>
                          {contagem && (
                            <span className="flex items-center gap-1.5">
                              {contagem.alerta && <Led estado={contagem.alerta} piscando={contagem.alerta === "critico"} className="size-2" />}
                              <span className={cn("font-mono text-xs tabular-nums", contagem.valor > 0 ? "text-white/85" : "text-white/35")}>
                                {contagem.valor}
                              </span>
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {usuario && (
        <div className={cn("shrink-0 border-t border-sidebar-border p-2", compacto && "flex flex-col items-center gap-1")}>
          <div className={cn("flex items-center gap-2.5 rounded-sm p-1.5", !compacto && "hover:bg-white/[0.04]")}>
            <Link href="/perfil" onClick={aoNavegar} className="flex min-w-0 flex-1 items-center gap-2.5" title={compacto ? usuario.nome : undefined}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/[0.06] font-rotulo text-sm font-semibold tracking-wide text-white">
                {iniciais(usuario.nome)}
              </span>
              {!compacto && (
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">{usuario.nome}</span>
                  <span className="rotulo block truncate pt-1 text-[10px] text-sidebar-muted">{usuario.perfil?.nome ?? "Sem perfil"}</span>
                </span>
              )}
            </Link>
            {!compacto && (
              <button
                type="button"
                title="Sair"
                aria-label="Sair"
                className="flex size-9 shrink-0 items-center justify-center rounded-sm text-sidebar-muted hover:bg-white/[0.06] hover:text-white"
                onClick={async () => { aoNavegar?.(); await sair(); router.replace("/login?motivo=saiu"); }}
              >
                <LogOut className="size-4" />
              </button>
            )}
          </div>
          {compacto && (
            <button
              type="button"
              title="Sair"
              aria-label="Sair"
              className="flex size-9 items-center justify-center rounded-sm text-sidebar-muted hover:bg-white/[0.06] hover:text-white"
              onClick={async () => { await sair(); router.replace("/login?motivo=saiu"); }}
            >
              <LogOut className="size-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
