import { cn } from "@/lib/utils";

// Ano-modelo pela 10ª posição do chassi (padrão VIN)
const ANO_VIN: Record<string, string> = { R: "2024", S: "2025", T: "2026", V: "2027", W: "2028", X: "2029", Y: "2030", "1": "2031" };

/** Separa o chassi nas três partes do padrão VIN: WMI (1–3), VDS (4–9) e VIS (10–17). */
export function partesDoChassi(chassi: string) {
  const vin = chassi.toUpperCase();
  if (vin.length !== 17) return null;
  return {
    wmi: vin.slice(0, 3),
    vds: vin.slice(3, 9),
    vis: vin.slice(9),
    ano: ANO_VIN[vin[9]] ?? null,
    codigoAno: vin[9],
    fabrica: vin[10],
    serie: vin.slice(11),
  };
}

const TAMANHOS = {
  sm: { caixa: "h-6 text-xs", aba: "px-1.5 text-[9px]", texto: "px-2 gap-1.5" },
  md: { caixa: "h-7 text-sm", aba: "px-2 text-[10px]", texto: "px-2.5 gap-2" },
  lg: { caixa: "h-12 text-2xl", aba: "px-3 text-xs", texto: "px-4 gap-3" },
} as const;

/**
 * Placa de chassi: o VIN em fonte técnica, dividido nas partes do padrão, com os dígitos
 * finais destacados (os mesmos conferidos na etiqueta). `explicar` mostra o que é cada parte.
 */
export function PlacaChassi({
  chassi,
  tamanho = "md",
  finais = 4,
  explicar = false,
  modelo,
  className,
}: {
  chassi: string;
  tamanho?: keyof typeof TAMANHOS;
  finais?: number;
  explicar?: boolean;
  /** Modelo reconhecido (exibido na explicação do VDS). */
  modelo?: string | null;
  className?: string;
}) {
  const vin = chassi.toUpperCase();
  const partes = partesDoChassi(vin);
  const t = TAMANHOS[tamanho];
  const corpo = vin.slice(0, Math.max(0, vin.length - finais));
  const fim = vin.slice(Math.max(0, vin.length - finais));

  const destaque = (texto: string) => (
    <span className="border-b-2 border-primary font-semibold text-foreground">{texto}</span>
  );

  return (
    <div className={cn("inline-flex flex-col gap-2", className)}>
      <span
        className={cn("inline-flex items-stretch overflow-hidden rounded-sm border border-foreground/25 bg-card font-mono", t.caixa)}
        title={partes ? `Chassi ${vin}` : vin}
      >
        <span className={cn("rotulo flex items-center bg-foreground font-rotulo text-background", t.aba)}>Chassi</span>
        <span className={cn("flex items-center whitespace-nowrap tracking-wider text-foreground/85", t.texto)}>
          {partes ? (
            <>
              <span>{partes.wmi}</span>
              <span>{partes.vds}</span>
              <span>
                {partes.vis.slice(0, 8 - finais)}
                {destaque(partes.vis.slice(8 - finais))}
              </span>
            </>
          ) : (
            <span>
              {corpo}
              {destaque(fim)}
            </span>
          )}
        </span>
      </span>
      {explicar && partes && (
        <dl className="grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-sm border bg-card px-2.5 py-2">
            <dt className="rotulo text-sutil">WMI · posições 1–3</dt>
            <dd className="mt-1 text-muted-foreground"><span className="font-mono font-semibold text-foreground">{partes.wmi}</span> identifica o fabricante.</dd>
          </div>
          <div className="rounded-sm border bg-card px-2.5 py-2">
            <dt className="rotulo text-sutil">VDS · posições 4–9</dt>
            <dd className="mt-1 text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">{partes.vds}</span> é o código do modelo
              {modelo ? <> (<span className="text-foreground">{modelo}</span>)</> : null}. É por ele que a Entrada reconhece a moto.
            </dd>
          </div>
          <div className="rounded-sm border bg-card px-2.5 py-2">
            <dt className="rotulo text-sutil">VIS · posições 10–17</dt>
            <dd className="mt-1 text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">{partes.codigoAno}</span> = ano-modelo{partes.ano ? ` ${partes.ano}` : ""};{" "}
              <span className="font-mono font-semibold text-foreground">{partes.fabrica}</span> = fábrica;{" "}
              <span className="font-mono font-semibold text-foreground">{partes.serie}</span> = número de série. Os {finais} últimos dígitos são os conferidos na etiqueta.
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
