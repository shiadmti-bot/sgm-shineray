import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Estado vazio padrão: ícone, mensagem e ação opcional. */
export function EmptyState({
  icone: Icone,
  titulo,
  descricao,
  acao,
  className,
  compacto = false,
}: {
  icone?: LucideIcon;
  titulo: string;
  descricao?: React.ReactNode;
  acao?: React.ReactNode;
  className?: string;
  compacto?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed text-center",
        compacto ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
        className,
      )}
    >
      {Icone && (
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icone className="size-6" />
        </div>
      )}
      <div className="space-y-1">
        <p className="font-semibold text-foreground">{titulo}</p>
        {descricao && <p className="mx-auto max-w-md text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {acao}
    </div>
  );
}
