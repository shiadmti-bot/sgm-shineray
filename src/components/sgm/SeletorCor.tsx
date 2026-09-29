"use client";

import { Check } from "lucide-react";
import { getHexColor, type CorCatalogo } from "@/lib/constantes";
import { cn } from "@/lib/utils";

/**
 * Escolha de cor por amostras (toque direto, sem abrir lista): cada opção mostra a cor real
 * da peça e o nome do catálogo. Um valor antigo fora do catálogo continua visível e marcado.
 */
export function SeletorCor({
  rotulo,
  cores,
  valor,
  aoEscolher,
  desabilitado = false,
  className,
}: {
  rotulo: string;
  cores: CorCatalogo[];
  valor: string;
  aoEscolher: (nome: string) => void;
  desabilitado?: boolean;
  className?: string;
}) {
  const opcoes = valor && !cores.some((c) => c.nome === valor) ? [...cores, { nome: valor, hex: getHexColor(valor) }] : cores;
  return (
    <fieldset className={cn("space-y-2", className)} disabled={desabilitado}>
      <legend className="rotulo mb-2 flex w-full items-center justify-between text-sutil">
        {rotulo}
        <span className="font-sans text-xs font-medium normal-case tracking-normal text-foreground">{valor || "não escolhida"}</span>
      </legend>
      <div role="radiogroup" aria-label={rotulo} className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {opcoes.map((c) => {
          const selecionada = c.nome === valor;
          return (
            <button
              key={c.nome}
              type="button"
              role="radio"
              aria-checked={selecionada}
              onClick={() => aoEscolher(c.nome)}
              className={cn(
                "flex min-h-12 items-center gap-2.5 rounded-md border bg-card px-2.5 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                selecionada ? "border-foreground font-semibold shadow-[0_0_0_1px_hsl(var(--foreground))]" : "hover:border-foreground/40",
              )}
            >
              <span aria-hidden className="size-6 shrink-0 rounded-[3px] border border-foreground/25" style={{ backgroundColor: c.hex }} />
              <span className="min-w-0 flex-1 leading-tight">{c.descricao || c.nome}</span>
              {selecionada && <Check className="size-4 shrink-0" aria-hidden />}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
