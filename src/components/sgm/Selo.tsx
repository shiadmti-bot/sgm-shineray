import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Led, type EstadoLed } from "./Led";

/** Etiqueta pequena de situação: lâmpada (opcional) + texto na tinta do tema. */
export function Selo({
  estado,
  icone: Icone,
  children,
  className,
}: {
  estado?: EstadoLed;
  icone?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-sm border bg-card px-1.5 py-0.5 text-xs font-medium text-foreground", className)}>
      {estado && <Led estado={estado} className="size-2" />}
      {Icone && <Icone className="size-3 text-sutil" aria-hidden />}
      {children}
    </span>
  );
}
