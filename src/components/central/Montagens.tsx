"use client";

import Link from "next/link";
import { PauseCircle, Wrench } from "lucide-react";
import { Painel } from "@/components/sgm/Painel";
import { Iniciais } from "@/components/sgm/Iniciais";
import { Led } from "@/components/sgm/Led";
import { MedidorLinear } from "@/components/sgm/Medidor";
import { EmptyState } from "@/components/sgm/EmptyState";
import { formatarDuracaoMin, minutosDesde } from "@/lib/datas";
import { cn } from "@/lib/utils";

export interface MotoNaLinha {
  id: string;
  modelo: string;
  sku: string;
  inicio_montagem?: string | null;
  updated_at?: string | null;
  montador?: { nome: string } | null;
}

/** Chassi resumido: só o final, com os 4 últimos dígitos (os conferidos na etiqueta) em destaque. */
export function FinalChassi({ chassi, className }: { chassi: string; className?: string }) {
  const vin = chassi.toUpperCase();
  const fim = vin.slice(-4);
  const antes = vin.slice(-8, -4);
  return (
    <span className={cn("font-mono text-xs tracking-wider text-sutil", className)} title={`Chassi ${vin}`}>
      …{antes}
      <span className="border-b-2 border-primary font-semibold text-foreground">{fim}</span>
    </span>
  );
}

function Cartao({
  moto,
  href,
  children,
  destaque,
}: {
  moto: MotoNaLinha;
  href?: string;
  children: React.ReactNode;
  destaque?: "atencao" | "pausa";
}) {
  const classe = cn(
    "relative flex h-full flex-col gap-3 overflow-hidden rounded-md border bg-card p-3.5 transition-colors",
    destaque === "atencao" && "border-warning/70",
    destaque === "pausa" && "pt-5",
    href && "hover:border-foreground/40",
  );
  const conteudo = (
    <>
      {destaque === "pausa" && <span aria-hidden className="faixa-sinalizacao absolute inset-x-0 top-0 h-1.5" />}
      <div className="flex items-center gap-2.5">
        <Iniciais nome={moto.montador?.nome} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{moto.montador?.nome ?? "Sem montador"}</p>
          <p className="truncate text-xs text-muted-foreground">{moto.modelo}</p>
        </div>
      </div>
      {children}
    </>
  );
  return href ? (
    <Link href={href} className={cn(classe, "outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
      {conteudo}
    </Link>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}

/**
 * Montagens em andamento (E2): tempo de cada moto contra a referência configurada
 * e as pausas abertas (faixa zebrada).
 */
export function Montagens({
  ativas,
  pausadas,
  limiteMontagemMin,
  limitePausaMin,
  agora,
  carregando,
  linkProntuario,
  className,
}: {
  ativas: MotoNaLinha[];
  pausadas: MotoNaLinha[];
  limiteMontagemMin: number;
  limitePausaMin: number;
  agora: number;
  carregando: boolean;
  /** Link para o prontuário do chassi (quando o perfil pode ver). */
  linkProntuario?: (chassi: string) => string;
  className?: string;
}) {
  const total = ativas.length + pausadas.length;
  return (
    <Painel
      titulo="Montagens em andamento"
      codigo="E2"
      meta={`Referência: ${limiteMontagemMin} min por moto · pausa longa: ${limitePausaMin} min`}
      className={className}
    >
      {carregando ? (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-36 animate-pulse rounded-md bg-muted" />)}
        </div>
      ) : total === 0 ? (
        <EmptyState
          icone={Wrench}
          titulo="Nenhuma moto sendo montada agora"
          descricao="Quando um montador puxar uma moto da fila na tela Montagem (E2), ela aparece aqui com o tempo correndo."
          compacto
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {ativas.map((m) => {
            const minutos = minutosDesde(m.inicio_montagem, agora);
            const nivel = minutos > limiteMontagemMin ? "atencao" : undefined;
            return (
              <Cartao key={m.id} moto={m} href={linkProntuario?.(m.sku)} destaque={nivel}>
                <div className="flex items-center justify-between gap-2">
                  <FinalChassi chassi={m.sku} />
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Led estado={nivel ?? "processo"} className="size-2" />
                    {nivel ? "Acima da referência" : "Montando"}
                  </span>
                </div>
                <div className="mt-auto space-y-1.5">
                  <MedidorLinear valor={minutos} referencia={limiteMontagemMin} critico={Number.POSITIVE_INFINITY} rotulo={`Tempo de montagem de ${m.modelo}`} />
                  <p className="flex justify-between font-mono text-xs">
                    <span className="font-semibold text-foreground">{formatarDuracaoMin(minutos)}</span>
                    <span className="text-sutil">ref. {limiteMontagemMin} min</span>
                  </p>
                </div>
              </Cartao>
            );
          })}
          {pausadas.map((m) => {
            const minutos = minutosDesde(m.updated_at, agora);
            const longa = minutos > limitePausaMin;
            return (
              <Cartao key={m.id} moto={m} href={linkProntuario?.(m.sku)} destaque="pausa">
                <div className="flex items-center justify-between gap-2">
                  <FinalChassi chassi={m.sku} />
                  <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <PauseCircle className={cn("size-3.5", longa ? "text-destructive" : "text-warning")} aria-hidden />
                    {longa ? "Pausa longa" : "Em pausa"}
                  </span>
                </div>
                <p className="mt-auto flex justify-between font-mono text-xs">
                  <span className="font-semibold text-foreground">parada há {formatarDuracaoMin(minutos)}</span>
                  <span className="text-sutil">limite {limitePausaMin} min</span>
                </p>
              </Cartao>
            );
          })}
        </div>
      )}
    </Painel>
  );
}
