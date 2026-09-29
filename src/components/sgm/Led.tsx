import { cn } from "@/lib/utils";

/** Estados de sinalização (Andon) — sempre acompanhados de texto ou ícone. */
export type EstadoLed = "bom" | "atencao" | "serio" | "critico" | "processo" | "neutro" | "desligado";

export const COR_LED: Record<EstadoLed, string> = {
  bom: "bg-success",
  atencao: "bg-warning",
  serio: "bg-serio",
  critico: "bg-destructive",
  processo: "bg-info",
  neutro: "bg-sutil",
  desligado: "bg-foreground/15",
};

/** Lâmpada de sinalização quadrada (padrão de painel industrial). */
export function Led({
  estado = "neutro",
  piscando = false,
  className,
}: {
  estado?: EstadoLed;
  piscando?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-[2px]", COR_LED[estado], piscando && "led-piscando", className)}
    />
  );
}
