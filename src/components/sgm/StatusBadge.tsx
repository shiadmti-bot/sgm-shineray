import { rotuloStatus } from "@/lib/constantes";
import { cn } from "@/lib/utils";

/**
 * Cor da lâmpada de cada etapa da moto.
 * Etapas do fluxo: rampa de um só matiz (quanto mais avançada, mais intensa).
 * Exceções (pausa, retrabalho, avaria): cores de sinalização Andon.
 */
const LED_ETAPA: Record<string, string> = {
  aguardando_montagem: "bg-etapa-1",
  em_producao: "bg-etapa-2",
  em_analise: "bg-etapa-3",
  aguardando_etiqueta: "bg-etapa-4",
  aprovado: "bg-etapa-4",
  estoque: "bg-etapa-5",
  expedido: "bg-sutil",
  pausado: "bg-warning",
  retrabalho_montagem: "bg-serio",
};

export function ledDoStatus(status?: string | null): string {
  if (!status) return "bg-foreground/15";
  if (status.startsWith("avaria_")) return "bg-destructive";
  return LED_ETAPA[status] ?? "bg-foreground/15";
}

/** Mantido para telas antigas: classes de uma etiqueta de etapa. */
export function corDoStatus(status?: string | null): string {
  return cn("border-border bg-card text-foreground", status?.startsWith("avaria_") && "border-destructive/40");
}

/** Etapa da moto: lâmpada + nome (a cor nunca aparece sozinha). */
export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border bg-card px-2 py-0.5 text-xs font-medium text-foreground",
        status?.startsWith("avaria_") && "border-destructive/40",
        className,
      )}
    >
      <span aria-hidden className={cn("size-2 shrink-0 rounded-[2px]", ledDoStatus(status))} />
      {rotuloStatus(status)}
    </span>
  );
}
