import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tom = "neutro" | "primario" | "sucesso" | "alerta" | "perigo" | "info";

export const CORES_TOM: Record<Tom, { icone: string; destaque: string }> = {
  neutro: { icone: "bg-muted text-muted-foreground", destaque: "" },
  primario: { icone: "bg-primary/10 text-primary", destaque: "border-primary/40" },
  sucesso: { icone: "bg-success/10 text-success", destaque: "border-success/40" },
  alerta: { icone: "bg-warning/10 text-warning", destaque: "border-warning/50" },
  perigo: { icone: "bg-destructive/10 text-destructive", destaque: "border-destructive/50" },
  info: { icone: "bg-info/10 text-info", destaque: "border-info/40" },
};

/** Indicador numérico padrão (painel, relatórios, inventário). */
export function StatCard({
  rotulo,
  valor,
  icone: Icone,
  tom = "neutro",
  dica,
  destacar = false,
  carregando = false,
  href,
  className,
}: {
  rotulo: string;
  valor: React.ReactNode;
  icone?: LucideIcon;
  tom?: Tom;
  dica?: React.ReactNode;
  /** Borda colorida para chamar atenção (ex.: acima do limite). */
  destacar?: boolean;
  carregando?: boolean;
  href?: string;
  className?: string;
}) {
  const conteudo = (
    <div
      className={cn(
        "flex h-full items-start justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors",
        destacar && CORES_TOM[tom].destaque,
        href && "hover:bg-accent/60",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</p>
        {carregando ? (
          <div className="h-8 w-16 animate-pulse rounded-md bg-muted" />
        ) : (
          <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{valor}</p>
        )}
        {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
      </div>
      {Icone && (
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", CORES_TOM[tom].icone)}>
          <Icone className="size-5" />
        </div>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {conteudo}
    </Link>
  ) : (
    conteudo
  );
}
