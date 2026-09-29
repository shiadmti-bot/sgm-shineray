import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Painel de instrumento: moldura com faixa de título (rótulo técnico), metadados e ações.
 * É a peça básica das telas da V2 — substitui os "cards" genéricos.
 */
export function Painel({
  titulo,
  codigo,
  icone: Icone,
  meta,
  acoes,
  children,
  className,
  corpoClassName,
  semRecuo = false,
  id,
}: {
  titulo?: React.ReactNode;
  /** Código curto da estação (ex.: E3). */
  codigo?: string;
  icone?: LucideIcon;
  /** Texto auxiliar ao lado do título (ex.: "atualizado às 12:07"). */
  meta?: React.ReactNode;
  acoes?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  corpoClassName?: string;
  /** Corpo sem espaçamento interno (tabelas e listas de borda a borda). */
  semRecuo?: boolean;
  id?: string;
}) {
  const temCabecalho = titulo || acoes || meta;
  return (
    <section id={id} className={cn("flex flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-painel", className)}>
      {temCabecalho && (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b bg-painel-cabecalho px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            {codigo && <span className="codigo-estacao">{codigo}</span>}
            {Icone && <Icone className="size-4 shrink-0 text-sutil" />}
            {titulo && <h2 className="rotulo truncate text-foreground">{titulo}</h2>}
            {meta && <span className="hidden truncate text-xs text-sutil sm:inline">{meta}</span>}
          </div>
          {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
        </header>
      )}
      <div className={cn("flex-1", !semRecuo && "p-4", corpoClassName)}>{children}</div>
    </section>
  );
}
