import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Cabeçalho padrão das telas: ícone, título, descrição e ações à direita. */
export function PageHeader({
  titulo,
  descricao,
  icone: Icone,
  acoes,
  className,
}: {
  titulo: string;
  descricao?: React.ReactNode;
  icone?: LucideIcon;
  acoes?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between print:hidden", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icone && (
          <div className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
            <Icone className="size-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{titulo}</h1>
          {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}
        </div>
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}
