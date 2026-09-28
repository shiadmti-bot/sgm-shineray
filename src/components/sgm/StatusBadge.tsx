import { rotuloStatus } from "@/lib/constantes";
import { cn } from "@/lib/utils";

const COR_STATUS: Record<string, string> = {
  aguardando_montagem: "bg-muted text-muted-foreground border-border",
  em_producao: "bg-info/10 text-info border-info/30",
  pausado: "bg-warning/10 text-warning border-warning/30",
  retrabalho_montagem: "bg-destructive/10 text-destructive border-destructive/30",
  em_analise: "bg-violet-500/10 text-violet-600 border-violet-500/30 dark:text-violet-400",
  aguardando_etiqueta: "bg-cyan-500/10 text-cyan-700 border-cyan-500/30 dark:text-cyan-400",
  aprovado: "bg-success/10 text-success border-success/30",
  estoque: "bg-success/10 text-success border-success/30",
  expedido: "bg-secondary text-secondary-foreground border-border",
};

export function corDoStatus(status?: string | null): string {
  if (!status) return COR_STATUS.aguardando_montagem;
  if (status.startsWith("avaria_")) return "bg-orange-500/10 text-orange-600 border-orange-500/30 dark:text-orange-400";
  return COR_STATUS[status] ?? "bg-muted text-muted-foreground border-border";
}

/** Etapa da moto com a cor padrão em todo o sistema. */
export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        corDoStatus(status),
        className,
      )}
    >
      {rotuloStatus(status)}
    </span>
  );
}
