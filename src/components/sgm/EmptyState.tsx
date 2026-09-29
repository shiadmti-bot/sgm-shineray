import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Estado vazio didático: diz o que aparece ali e, quando útil, como fazer aparecer (passos).
 */
export function EmptyState({
  icone: Icone,
  titulo,
  descricao,
  passos,
  acao,
  className,
  compacto = false,
}: {
  icone?: LucideIcon;
  titulo: string;
  descricao?: React.ReactNode;
  passos?: string[];
  acao?: React.ReactNode;
  className?: string;
  compacto?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-lg border border-dashed border-foreground/20 bg-card/60",
        compacto ? "p-4" : "p-6",
        className,
      )}
    >
      {Icone && (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background text-sutil">
          <Icone className="size-5" />
        </div>
      )}
      <div className="min-w-0 space-y-2">
        <p className="font-semibold text-foreground">{titulo}</p>
        {descricao && <p className="max-w-xl text-sm text-muted-foreground">{descricao}</p>}
        {passos && passos.length > 0 && (
          <ol className="space-y-1.5 pt-1">
            {passos.map((p, i) => (
              <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm bg-foreground font-mono text-[10px] font-semibold text-background">
                  {i + 1}
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
        )}
        {acao && <div className="pt-1">{acao}</div>}
      </div>
    </div>
  );
}
