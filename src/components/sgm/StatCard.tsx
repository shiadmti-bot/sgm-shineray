import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Led, type EstadoLed } from "./Led";

export type Tom = "neutro" | "primario" | "sucesso" | "alerta" | "perigo" | "info";

const LED_DO_TOM: Record<Tom, EstadoLed> = {
  neutro: "neutro",
  primario: "processo",
  sucesso: "bom",
  alerta: "atencao",
  perigo: "critico",
  info: "processo",
};

const BORDA_DESTAQUE: Record<Tom, string> = {
  neutro: "before:bg-sutil",
  primario: "before:bg-info",
  sucesso: "before:bg-success",
  alerta: "before:bg-warning",
  perigo: "before:bg-destructive",
  info: "before:bg-info",
};

/**
 * Leitura de instrumento: rótulo técnico com lâmpada de estado, valor e observação.
 * `destacar` acende a faixa superior (fora do normal).
 */
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
  destacar?: boolean;
  carregando?: boolean;
  href?: string;
  className?: string;
}) {
  const conteudo = (
    <div
      className={cn(
        "relative flex h-full flex-col gap-2 overflow-hidden rounded-lg border bg-card px-4 pb-3.5 pt-4 transition-colors",
        destacar && ["before:absolute before:inset-x-0 before:top-0 before:h-[3px]", BORDA_DESTAQUE[tom]],
        href && "hover:border-foreground/25",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <Led estado={LED_DO_TOM[tom]} piscando={destacar && (tom === "perigo" || tom === "alerta")} />
          <span className="rotulo truncate text-muted-foreground">{rotulo}</span>
        </span>
        {Icone && <Icone className="size-4 shrink-0 text-sutil" />}
      </div>
      {carregando ? (
        <div className="h-8 w-14 animate-pulse rounded-sm bg-muted" />
      ) : (
        <p className="text-[28px] font-semibold leading-none tracking-tight text-foreground">{valor}</p>
      )}
      {dica && <p className="text-xs leading-snug text-sutil">{dica}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {conteudo}
    </Link>
  ) : (
    conteudo
  );
}
