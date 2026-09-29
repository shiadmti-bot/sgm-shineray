import { cn } from "@/lib/utils";

/** Carregamento no padrão da linha: esteira em movimento + texto. */
export function Carregando({ texto, className }: { texto?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex min-h-[40vh] w-full flex-col items-center justify-center gap-3 text-muted-foreground", className)}
    >
      <div className="relative h-1.5 w-40 overflow-hidden rounded-[1px] bg-foreground/10">
        <span className="esteira absolute inset-0 [--cor-esteira:hsl(var(--primary))]" />
      </div>
      <p className="rotulo text-sutil">{texto ?? "Carregando"}</p>
    </div>
  );
}
