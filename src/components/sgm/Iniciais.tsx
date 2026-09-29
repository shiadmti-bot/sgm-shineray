import { cn } from "@/lib/utils";

/** Iniciais do nome (ignora partes entre parênteses e símbolos: "Délcio Farias (TI)" → "DF"). */
export function iniciais(nome?: string | null): string {
  const palavras = String(nome || "")
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (palavras.length === 0) return "?";
  const primeira = palavras[0][0] ?? "";
  const ultima = palavras.length > 1 ? palavras[palavras.length - 1][0] ?? "" : palavras[0][1] ?? "";
  return (primeira + ultima).toUpperCase();
}

/** Crachá com as iniciais (gerado localmente: nenhum nome sai para serviços externos). */
export function Iniciais({ nome, className }: { nome?: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 select-none items-center justify-center rounded-md border border-foreground/15 bg-foreground/[0.06] font-rotulo text-sm font-semibold tracking-wide text-foreground",
        className,
      )}
    >
      {iniciais(nome)}
    </span>
  );
}
