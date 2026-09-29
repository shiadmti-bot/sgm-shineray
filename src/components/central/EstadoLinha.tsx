"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, CheckCircle2, OctagonAlert, Siren, TriangleAlert } from "lucide-react";
import { Painel } from "@/components/sgm/Painel";
import { Led } from "@/components/sgm/Led";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AlertaAndon {
  nivel: "critico" | "atencao";
  /** Código da estação de origem (E2, E3, AV...). */
  codigo: string;
  texto: string;
  href?: string;
}

const VISIVEIS = 4;

/**
 * Quadro Andon: estado geral da linha (pior sinal aceso) e a lista de chamados.
 * Cada alerta traz ícone + texto; a cor nunca aparece sozinha.
 */
export function EstadoLinha({
  alertas,
  montadoresAtivos,
  pedidosPausa,
  aoAbrirPedidos,
  carregando,
  className,
}: {
  alertas: AlertaAndon[];
  montadoresAtivos: number;
  /** `null` quando o perfil não decide pausas. */
  pedidosPausa: number | null;
  aoAbrirPedidos: () => void;
  carregando: boolean;
  className?: string;
}) {
  const [todos, setTodos] = useState(false);
  const criticos = alertas.filter((a) => a.nivel === "critico").length;
  const atencao = alertas.length - criticos;
  const estado = criticos > 0 ? "critico" : atencao > 0 ? "atencao" : "bom";
  const ordenados = [...alertas].sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "critico" ? -1 : 1));
  const visiveis = todos ? ordenados : ordenados.slice(0, VISIVEIS);

  const titulo = { critico: "Crítico", atencao: "Atenção", bom: "Linha normal" }[estado];
  const resumo =
    alertas.length === 0
      ? "Nenhum sinal aceso no momento."
      : [criticos && `${criticos} crítico${criticos > 1 ? "s" : ""}`, atencao && `${atencao} de atenção`].filter(Boolean).join(" · ");

  return (
    <Painel titulo="Andon da linha" icone={Siren} className={className} corpoClassName="flex flex-col gap-4">
      <div
        className={cn(
          "flex items-center gap-3 rounded-md border px-3.5 py-3",
          estado === "critico" && "border-destructive/50",
          estado === "atencao" && "border-warning/60",
        )}
      >
        {carregando ? (
          <div className="h-10 w-full animate-pulse rounded-sm bg-muted" />
        ) : (
          <>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-sidebar">
              <Led estado={estado} piscando={estado === "critico"} className="size-4 rounded-[3px]" />
            </span>
            <div className="min-w-0">
              <p className="font-rotulo text-xl font-bold uppercase leading-none tracking-[0.06em] text-foreground">{titulo}</p>
              <p className="mt-1 text-xs text-sutil">{resumo}</p>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="border-l pl-3">
          <p className="rotulo text-sutil">Montadores ativos</p>
          <p className="mt-1.5 text-xl font-semibold leading-none">{carregando ? "—" : montadoresAtivos}</p>
          <p className="mt-1 text-xs text-sutil">montando ou em pausa</p>
        </div>
        {pedidosPausa !== null && (
          <div className="border-l pl-3">
            <p className="rotulo text-sutil">Pedidos de pausa</p>
            <p className="mt-1.5 flex items-center gap-2 text-xl font-semibold leading-none">
              {carregando ? "—" : pedidosPausa}
              {pedidosPausa > 0 && <BellRing className="size-4 text-warning" aria-hidden />}
            </p>
            {pedidosPausa > 0 ? (
              <button type="button" onClick={aoAbrirPedidos} className="mt-1 text-xs font-semibold text-foreground underline underline-offset-2 hover:text-primary">
                Decidir agora
              </button>
            ) : (
              <p className="mt-1 text-xs text-sutil">nenhum aguardando</p>
            )}
          </div>
        )}
      </div>

      {!carregando && alertas.length === 0 && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          Fluxo estável: nenhuma montagem acima do tempo de referência, nenhuma pausa longa, fila de inspeção dentro do limite e pátio de avarias vazio.
        </p>
      )}

      {alertas.length > 0 && (
        <ul className="space-y-1.5">
          {visiveis.map((a, i) => {
            const Icone = a.nivel === "critico" ? OctagonAlert : TriangleAlert;
            const corpo = (
              <span
                className={cn(
                  "flex items-start gap-2.5 rounded-sm border border-l-[3px] bg-card px-2.5 py-2 text-sm",
                  a.nivel === "critico" ? "border-l-destructive" : "border-l-warning",
                  a.href && "hover:bg-accent",
                )}
              >
                <Icone className={cn("mt-0.5 size-4 shrink-0", a.nivel === "critico" ? "text-destructive" : "text-warning")} aria-hidden />
                <span className="min-w-0 flex-1 text-foreground">
                  <span className="sr-only">{a.nivel === "critico" ? "Crítico: " : "Atenção: "}</span>
                  {a.texto}
                </span>
                <span className="codigo-estacao shrink-0">{a.codigo}</span>
                {a.href && <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-sutil" aria-hidden />}
              </span>
            );
            return (
              <li key={`${a.codigo}-${i}`}>
                {a.href ? <Link href={a.href} className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">{corpo}</Link> : corpo}
              </li>
            );
          })}
        </ul>
      )}
      {alertas.length > VISIVEIS && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setTodos((v) => !v)}>
          {todos ? "Mostrar menos" : `Ver todos os ${alertas.length} sinais`}
        </Button>
      )}
    </Painel>
  );
}
