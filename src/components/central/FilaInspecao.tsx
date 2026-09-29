"use client";

import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { Painel } from "@/components/sgm/Painel";
import { Led } from "@/components/sgm/Led";
import { EmptyState } from "@/components/sgm/EmptyState";
import { formatarDuracaoMin, minutosDesde } from "@/lib/datas";
import { FinalChassi } from "./Montagens";

export interface MotoNaFila {
  id: string;
  modelo: string;
  sku: string;
  fim_montagem?: string | null;
}

const VISIVEIS = 6;
/** Espera acima disto acende a lâmpada de atenção (mesma regra do Andon). */
export const ESPERA_QA_ATENCAO_MIN = 30;

/** Fila de inspeção (E3) na ordem de atendimento: a primeira finalizada é a primeira inspecionada. */
export function FilaInspecao({
  fila,
  total,
  limiteFilaQA,
  agora,
  carregando,
  hrefQualidade,
  className,
}: {
  fila: MotoNaFila[];
  total: number;
  limiteFilaQA: number;
  agora: number;
  carregando: boolean;
  hrefQualidade?: string;
  className?: string;
}) {
  const visiveis = fila.slice(0, VISIVEIS);
  const restantes = Math.max(0, total - visiveis.length);
  return (
    <Painel
      titulo="Fila de inspeção"
      codigo="E3"
      meta={`${total} de ${limiteFilaQA} (limite)`}
      className={className}
      semRecuo
    >
      {carregando ? (
        <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-sm bg-muted" />)}</div>
      ) : fila.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icone={ClipboardCheck}
            titulo="Fila de inspeção vazia"
            descricao="Toda moto finalizada na Montagem entra aqui, por ordem de chegada."
            compacto
          />
        </div>
      ) : (
        <>
          <ol className="divide-y">
            {visiveis.map((m, i) => {
              const espera = minutosDesde(m.fim_montagem, agora);
              const longa = espera > ESPERA_QA_ATENCAO_MIN;
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-sm border font-mono text-[11px] font-semibold text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.modelo}</p>
                    <FinalChassi chassi={m.sku} />
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs">
                    <Led estado={longa ? "atencao" : "neutro"} className="size-2" />
                    <span className={longa ? "font-semibold text-foreground" : "text-muted-foreground"}>{formatarDuracaoMin(espera)}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5 text-xs text-sutil">
            <span>{restantes > 0 ? `+${restantes} na fila` : "Tempo = espera desde o fim da montagem"}</span>
            {hrefQualidade && (
              <Link href={hrefQualidade} className="flex items-center gap-1 font-semibold text-foreground hover:text-primary">
                Abrir inspeção <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>
        </>
      )}
    </Painel>
  );
}
