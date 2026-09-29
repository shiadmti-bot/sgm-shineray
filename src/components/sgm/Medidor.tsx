import { cn } from "@/lib/utils";

const MAX_SEGMENTOS = 60;

/**
 * Medidor em segmentos (como um conta-giros digital): cada segmento é uma unidade (ex.: uma moto).
 * Preenchimento na tinta principal; trilho no mesmo tom, mais claro. Acima de 60 unidades,
 * cada segmento passa a valer mais de uma (a legenda informa).
 */
export function MedidorSegmentado({
  valor,
  total,
  rotulo,
  className,
  altura = "h-5",
  unidade = ["moto", "motos"],
  legenda = true,
}: {
  valor: number;
  total: number;
  rotulo: string;
  className?: string;
  altura?: string;
  /** Nome da unidade de cada segmento (singular, plural). */
  unidade?: [string, string];
  legenda?: boolean;
}) {
  const alvo = Math.max(1, total);
  const porSegmento = Math.ceil(alvo / MAX_SEGMENTOS);
  const segmentos = Math.ceil(alvo / porSegmento);
  const cheios = Math.min(segmentos, Math.floor(Math.max(0, valor) / porSegmento));
  const excedente = Math.max(0, valor - alvo);

  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        role="meter"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={alvo}
        aria-valuenow={Math.min(valor, alvo)}
        className="flex gap-[2px]"
      >
        {Array.from({ length: segmentos }, (_, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-[1px] transition-colors duration-500",
              altura,
              i < cheios ? "bg-foreground" : "bg-foreground/10",
              // marcos a cada 5 unidades ajudam a contar de relance
              (i + 1) % 5 === 0 && i < segmentos - 1 && "mr-[3px]",
            )}
          />
        ))}
      </div>
      {legenda && (
        <p className="text-[11px] text-sutil">
          {porSegmento === 1 ? `Cada segmento = 1 ${unidade[0]}` : `Cada segmento = ${porSegmento} ${unidade[1]}`}
          {excedente > 0 && <span className="font-medium text-foreground"> · meta superada em {excedente}</span>}
        </p>
      )}
    </div>
  );
}

/**
 * Barra fina de medida contra uma referência. A cor indica a severidade:
 * tinta (normal) → atenção → crítico. Trilho no mesmo tom da tinta, mais claro.
 */
export function MedidorLinear({
  valor,
  referencia,
  atencao = 1,
  critico = 1.5,
  rotulo,
  className,
}: {
  valor: number;
  /** Valor considerado 100% (ex.: 90 minutos por moto). */
  referencia: number;
  /** Frações da referência a partir das quais muda a cor. */
  atencao?: number;
  critico?: number;
  rotulo: string;
  className?: string;
}) {
  const ref = Math.max(1, referencia);
  const razao = valor / ref;
  const largura = Math.min(100, razao * 100);
  const cor = razao >= critico ? "bg-destructive" : razao >= atencao ? "bg-warning" : "bg-foreground/80";
  return (
    <div
      role="meter"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={ref}
      aria-valuenow={Math.round(valor)}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-[1px] bg-foreground/10", className)}
    >
      <span className={cn("absolute inset-y-0 left-0 rounded-[1px] transition-[width] duration-700", cor)} style={{ width: `${largura}%` }} />
    </div>
  );
}
