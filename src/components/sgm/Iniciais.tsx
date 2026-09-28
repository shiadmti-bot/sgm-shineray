import { cn } from "@/lib/utils";

const PALETA = [
  "bg-red-500/15 text-red-700 dark:text-red-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
];

export function iniciais(nome?: string | null): string {
  const partes = String(nome || "?").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] ?? "" : partes[0][1] ?? "";
  return (primeira + ultima).toUpperCase();
}

/** Avatar com as iniciais (gerado localmente: nenhum nome sai para serviços externos). */
export function Iniciais({ nome, className }: { nome?: string | null; className?: string }) {
  const indice = Array.from(String(nome || "")).reduce((soma, c) => soma + c.charCodeAt(0), 0) % PALETA.length;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 select-none items-center justify-center rounded-full text-xs font-bold",
        PALETA[indice],
        className,
      )}
    >
      {iniciais(nome)}
    </span>
  );
}
