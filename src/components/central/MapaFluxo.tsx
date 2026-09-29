"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUp, ArrowUpDown, CornerDownLeft, OctagonAlert, TriangleAlert, Workflow } from "lucide-react";
import { Painel } from "@/components/sgm/Painel";
import { Led, type EstadoLed } from "@/components/sgm/Led";
import { cn } from "@/lib/utils";

export interface EstacaoFluxo {
  codigo: string;
  titulo: string;
  /** Quantidade de motos na estação agora. */
  valor: number;
  /** O que o número significa ("na fila", "em montagem"...). */
  unidade: string;
  estado: EstadoLed;
  /** Situação fora do normal, em texto (acompanha a lâmpada). */
  alerta?: string;
  /** Link da tela (só quando o perfil pode abri-la). */
  href?: string;
  explicacao: string;
  entra: string;
  sai: string;
  /** Desvio do fluxo principal (avarias, retrabalho). */
  desvio?: boolean;
}

const TEXTO_ESTADO: Record<EstadoLed, string> = {
  bom: "Normal",
  atencao: "Atenção",
  serio: "Atenção",
  critico: "Crítico",
  processo: "Em processo",
  neutro: "Vazia",
  desligado: "Vazia",
};

const FAIXA_ESTADO: Partial<Record<EstadoLed, string>> = {
  atencao: "before:bg-warning",
  serio: "before:bg-serio",
  critico: "before:bg-destructive",
};

function IconeAlerta({ estado, className }: { estado: EstadoLed; className?: string }) {
  if (estado === "critico") return <OctagonAlert className={cn("size-3.5 shrink-0 text-destructive", className)} aria-hidden />;
  if (estado === "atencao" || estado === "serio") return <TriangleAlert className={cn("size-3.5 shrink-0 text-warning", className)} aria-hidden />;
  return null;
}

function CodigoEstacao({ estacao }: { estacao: EstacaoFluxo }) {
  return (
    <span className={cn("codigo-estacao", estacao.desvio && "border border-dashed border-foreground/40 bg-transparent text-foreground")}>
      {estacao.codigo}
    </span>
  );
}

/** Esteira entre duas estações: tracejado que corre quando há motos seguindo adiante. */
function Esteira({ ativa, vertical = false, className }: { ativa: boolean; vertical?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(vertical ? "esteira-vertical w-[2px]" : "esteira h-[2px]", !ativa && "esteira-parada opacity-50", className)}
    />
  );
}

/** Ligação tracejada entre uma estação e o desvio logo abaixo dela. */
function Desvio({ cor, icone: Icone, texto }: { cor: string; icone: typeof ArrowUp; texto: string }) {
  return (
    <div aria-hidden className="relative h-9">
      <span className={cn("absolute left-1/2 top-0 h-full -translate-x-1/2 border-l-2 border-dashed", cor)} />
      <span className="absolute left-[calc(50%+8px)] top-1/2 flex -translate-y-1/2 items-center gap-1 whitespace-nowrap text-[11px] text-sutil">
        <Icone className="size-3" /> {texto}
      </span>
    </div>
  );
}

interface PropsEstacao {
  estacao: EstacaoFluxo;
  selecionada: boolean;
  aoSelecionar: () => void;
}

const rotuloAcessivel = (e: EstacaoFluxo) =>
  `${e.codigo} ${e.titulo}: ${e.valor} ${e.unidade}. ${TEXTO_ESTADO[e.estado]}${e.alerta ? `, ${e.alerta}` : ""}`;

const classeSelecao = (selecionada: boolean) =>
  selecionada ? "border-foreground shadow-[0_0_0_1px_hsl(var(--foreground))]" : "hover:border-foreground/40";

/** Estação em bloco (telas largas): plaqueta com código e lâmpada, nome, quantidade e sinal. */
function BlocoEstacao({ estacao, selecionada, aoSelecionar }: PropsEstacao) {
  const faixa = FAIXA_ESTADO[estacao.estado];
  return (
    <button
      type="button"
      onClick={aoSelecionar}
      onFocus={aoSelecionar}
      aria-pressed={selecionada}
      aria-label={rotuloAcessivel(estacao)}
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-md border bg-card text-left outline-none transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring",
        estacao.desvio && "border-dashed border-foreground/30",
        faixa && ["before:absolute before:inset-x-0 before:top-0 before:h-[3px]", faixa],
        classeSelecao(selecionada),
      )}
    >
      <span className="flex h-9 items-center justify-between gap-2 border-b bg-painel-cabecalho px-2.5">
        <CodigoEstacao estacao={estacao} />
        <span className="flex items-center gap-1.5">
          <Led estado={estacao.estado} piscando={estacao.estado === "critico"} />
          <span className="rotulo text-[10px] text-muted-foreground">{TEXTO_ESTADO[estacao.estado]}</span>
        </span>
      </span>
      <span className="flex flex-1 flex-col gap-1 px-3 pb-3 pt-2.5">
        <span className="truncate text-sm font-semibold text-foreground">{estacao.titulo}</span>
        <span className="pt-1 text-[32px] font-semibold leading-none text-foreground">{estacao.valor}</span>
        <span className="truncate text-xs text-sutil">{estacao.unidade}</span>
      </span>
      {estacao.alerta && (
        <span className="flex items-start gap-1.5 border-t px-2.5 py-2 text-xs leading-snug text-foreground">
          <IconeAlerta estado={estacao.estado} className="mt-px" />
          <span className="line-clamp-2">{estacao.alerta}</span>
        </span>
      )}
    </button>
  );
}

/** Estação em linha (tablets e celulares): código, nome e sinal à esquerda; quantidade e lâmpada à direita. */
function LinhaEstacao({ estacao, selecionada, aoSelecionar }: PropsEstacao) {
  return (
    <button
      type="button"
      onClick={aoSelecionar}
      aria-pressed={selecionada}
      aria-label={rotuloAcessivel(estacao)}
      className={cn(
        "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border bg-card px-3 py-2.5 text-left outline-none transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring",
        estacao.desvio && "border-dashed border-foreground/30",
        estacao.estado === "critico" && "border-l-[3px] border-l-destructive",
        (estacao.estado === "atencao" || estacao.estado === "serio") && "border-l-[3px] border-l-warning",
        classeSelecao(selecionada),
      )}
    >
      <CodigoEstacao estacao={estacao} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">{estacao.titulo}</span>
        <span className="block truncate text-xs text-sutil">{estacao.unidade}</span>
        {estacao.alerta && (
          <span className="mt-1 flex items-start gap-1.5 text-xs leading-snug text-foreground">
            <IconeAlerta estado={estacao.estado} className="mt-px" />
            <span>{estacao.alerta}</span>
          </span>
        )}
      </span>
      <span className="flex items-center gap-2.5">
        <span className="text-2xl font-semibold leading-none text-foreground">{estacao.valor}</span>
        <Led estado={estacao.estado} piscando={estacao.estado === "critico"} />
      </span>
    </button>
  );
}

function Legenda() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-sutil">
      <span className="flex items-center gap-1.5">
        <span className="esteira esteira-parada inline-block h-[2px] w-6" /> esteira: corre quando há motos seguindo
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-0 w-6 border-t-2 border-dashed border-foreground/40" /> desvio do fluxo principal
      </span>
    </p>
  );
}

/**
 * Mapa do fluxo da moto: E1 → E2 → E3 → E4 → E5 → expedição, com os desvios (retrabalho e avarias).
 * Tocar numa estação mostra a ficha dela: o que acontece ali, de onde a moto vem e para onde vai.
 */
export function MapaFluxo({
  principal,
  saida,
  retrabalho,
  avarias,
  className,
}: {
  /** E1…E5, nesta ordem. */
  principal: EstacaoFluxo[];
  /** Expedidas hoje (fim do fluxo). */
  saida: EstacaoFluxo;
  retrabalho: EstacaoFluxo;
  avarias: EstacaoFluxo;
  className?: string;
}) {
  const fluxo = [...principal, saida];
  const todas = [...fluxo, retrabalho, avarias];
  const pior =
    todas.find((e) => e.estado === "critico") ?? todas.find((e) => e.estado === "atencao" || e.estado === "serio") ?? principal[1] ?? principal[0];
  const [codigoSelecionado, setCodigoSelecionado] = useState<string | null>(null);
  const selecionada = todas.find((e) => e.codigo === codigoSelecionado) ?? pior;
  const props = (e: EstacaoFluxo): PropsEstacao => ({
    estacao: e,
    selecionada: selecionada?.codigo === e.codigo,
    aoSelecionar: () => setCodigoSelecionado(e.codigo),
  });
  const indiceQualidade = principal.findIndex((e) => e.codigo === "E3");

  return (
    <Painel titulo="Fluxo da linha" icone={Workflow} meta="Toque numa estação para ver o que acontece nela" className={className}>
      {/* Telas largas: linha horizontal com os desvios embaixo */}
      <div className="hidden xl:block">
        <div className="grid grid-cols-6 gap-6">
          {fluxo.map((e, i) => (
            <div key={e.codigo} className="relative flex">
              <BlocoEstacao {...props(e)} />
              {i < fluxo.length - 1 && (
                <span aria-hidden className="absolute left-full top-[90px] flex w-6 -translate-y-1/2 items-center">
                  <Esteira ativa={e.valor > 0} className="flex-1" />
                  <span className="size-0 border-y-[4px] border-l-[5px] border-y-transparent border-l-sutil" />
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-6 gap-6">
          {/* Retrabalho: devolvido pela E3, volta para a E2 */}
          <div className="col-start-2 flex flex-col">
            <Desvio cor="border-serio" icone={ArrowUp} texto="volta à E2" />
            <BlocoEstacao {...props(retrabalho)} />
          </div>
          {/* Avarias: sai da E3 e volta para a E3 depois do reparo */}
          <div className="col-start-3 flex flex-col">
            <Desvio cor="border-destructive/70" icone={ArrowUpDown} texto="sai e volta à E3" />
            <BlocoEstacao {...props(avarias)} />
          </div>
          <div className="col-span-3 col-start-4 flex items-end pb-1">
            <Legenda />
          </div>
        </div>
      </div>

      {/* Tablets e celulares: lista na ordem do fluxo */}
      <ol className="xl:hidden" aria-label="Estações na ordem do fluxo">
        {fluxo.map((e, i) => (
          <li key={e.codigo}>
            <LinhaEstacao {...props(e)} />
            {i === indiceQualidade && (
              <div className="ml-[25px] space-y-2 border-l-2 border-dashed border-foreground/25 pl-4 pt-2">
                <p className="text-[11px] text-sutil">Desvios da E3: retrabalho volta à E2 · avaria volta à E3 depois do reparo</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <LinhaEstacao {...props(retrabalho)} />
                  <LinhaEstacao {...props(avarias)} />
                </div>
              </div>
            )}
            {i < fluxo.length - 1 && (
              <span aria-hidden className="ml-[25px] flex h-4">
                <Esteira ativa={e.valor > 0} vertical />
              </span>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-3 xl:hidden">
        <Legenda />
      </div>

      {selecionada && (
        <div
          className="mt-5 grid gap-4 rounded-md border bg-background/60 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-start"
          aria-live="polite"
        >
          <div className="min-w-0 space-y-1.5">
            <p className="flex flex-wrap items-center gap-2">
              <CodigoEstacao estacao={selecionada} />
              <span className="font-semibold">{selecionada.titulo}</span>
              <span className="flex items-center gap-1.5 text-xs text-sutil">
                <Led estado={selecionada.estado} className="size-2" /> {TEXTO_ESTADO[selecionada.estado]}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">{selecionada.explicacao}</p>
          </div>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="rotulo text-sutil">Entra</dt>
              <dd className="mt-1 text-foreground">{selecionada.entra}</dd>
            </div>
            <div>
              <dt className="rotulo text-sutil">Sai para</dt>
              <dd className="mt-1 flex items-start gap-1.5 text-foreground">
                {selecionada.desvio ? <CornerDownLeft className="mt-0.5 size-3.5 shrink-0 text-sutil" /> : <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-sutil" />}
                {selecionada.sai}
              </dd>
            </div>
          </dl>
          {selecionada.href && (
            <Link
              href={selecionada.href}
              className="inline-flex h-9 items-center gap-2 self-start justify-self-start rounded-md bg-foreground px-3.5 text-sm font-medium text-background hover:bg-foreground/85"
            >
              Abrir {selecionada.codigo} <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      )}
    </Painel>
  );
}
