"use client";

import { CheckCircle2, Target } from "lucide-react";
import { Painel } from "@/components/sgm/Painel";
import { MedidorSegmentado } from "@/components/sgm/Medidor";
import { formatarDuracaoMin, minutosDesde } from "@/lib/datas";
import { cn } from "@/lib/utils";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Intervalo médio (min) entre finalizações consecutivas; precisa de pelo menos duas. */
function intervaloMedio(finalizacoes: string[]): number | null {
  if (finalizacoes.length < 2) return null;
  const tempos = finalizacoes.map((f) => new Date(f).getTime()).sort((a, b) => a - b);
  return (tempos[tempos.length - 1] - tempos[0]) / (tempos.length - 1) / 60000;
}

/** Finalizações agrupadas por hora cheia, da primeira hora com produção até a hora atual. */
function porHora(finalizacoes: string[], agora: number) {
  if (finalizacoes.length === 0) return [];
  const contagem = new Map<number, number>();
  let primeira = 23;
  for (const f of finalizacoes) {
    const h = new Date(f).getHours();
    contagem.set(h, (contagem.get(h) ?? 0) + 1);
    primeira = Math.min(primeira, h);
  }
  const atual = new Date(agora).getHours();
  const ultima = Math.max(atual, ...contagem.keys());
  return Array.from({ length: ultima - primeira + 1 }, (_, i) => {
    const h = primeira + i;
    return { hora: h, total: contagem.get(h) ?? 0, parcial: h === atual };
  });
}

function Leitura({ rotulo, valor, detalhe }: { rotulo: string; valor: React.ReactNode; detalhe?: React.ReactNode }) {
  return (
    <div className="min-w-0 border-l pl-3">
      <p className="rotulo text-sutil">{rotulo}</p>
      <p className="mt-1.5 truncate text-xl font-semibold leading-none text-foreground">{valor}</p>
      {detalhe && <p className="mt-1 truncate text-xs text-sutil">{detalhe}</p>}
    </div>
  );
}

/**
 * Produção do dia: número principal contra a meta (medidor em segmentos, 1 segmento = 1 moto),
 * leituras de apoio e o ritmo por hora.
 */
export function ProducaoHoje({
  montadas,
  meta,
  entradas,
  expedidas,
  finalizacoes,
  agora,
  carregando,
  className,
}: {
  montadas: number;
  meta: number;
  entradas: number;
  expedidas: number;
  /** Horários de fim de montagem de hoje (ISO). */
  finalizacoes: string[];
  agora: number;
  carregando: boolean;
  className?: string;
}) {
  const percentual = Math.round((montadas / Math.max(meta, 1)) * 100);
  const atingida = montadas >= meta;
  const ultima = finalizacoes.length ? finalizacoes[finalizacoes.length - 1] : null;
  const media = intervaloMedio(finalizacoes);
  const horas = porHora(finalizacoes, agora);
  const maximo = Math.max(1, ...horas.map((h) => h.total));
  const rotuloHora = (h: number) => `${String(h).padStart(2, "0")}h`;

  return (
    <Painel titulo="Produção de hoje" icone={Target} meta={`Meta diária: ${meta} motos`} className={className} corpoClassName="flex flex-col">
      <div className="grid flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            {carregando ? (
              <div className="h-14 w-40 animate-pulse rounded-sm bg-muted" />
            ) : (
              <p className="flex items-baseline gap-2 leading-none">
                <span className="text-[56px] font-semibold tracking-tight text-foreground">{montadas}</span>
                <span className="text-2xl font-medium text-sutil">/ {meta}</span>
              </p>
            )}
            <div className="pb-1.5">
              <p className="rotulo text-sutil">Motos montadas</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                {atingida && <CheckCircle2 className="size-4 text-success" aria-hidden />}
                {atingida ? "Meta atingida" : `${percentual}% da meta`}
                {!atingida && !carregando && <span className="font-normal text-sutil">· faltam {meta - montadas}</span>}
              </p>
            </div>
          </div>

          <MedidorSegmentado valor={montadas} total={meta} rotulo="Motos montadas hoje em relação à meta" />
        </div>

        <div className="flex min-h-[184px] flex-col border-t pt-4 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
          <p className="rotulo text-sutil">Finalizações por hora</p>
          {horas.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nenhuma moto finalizada hoje ainda. As barras aparecem com a primeira finalização.</p>
          ) : (
            <>
              <ul className="mt-3 flex flex-1 items-end gap-[2px]" aria-label="Motos finalizadas em cada hora de hoje">
                {horas.map((h) => (
                  <li
                    key={h.hora}
                    tabIndex={0}
                    aria-label={`${rotuloHora(h.hora)}: ${h.total} moto(s)${h.parcial ? " (hora em andamento)" : ""}`}
                    className="group relative flex h-full min-w-0 flex-1 flex-col justify-end outline-none"
                  >
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-sm bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                    >
                      {rotuloHora(h.hora)}–{rotuloHora(h.hora + 1)} · {h.total} moto{h.total === 1 ? "" : "s"}
                      {h.parcial ? " · em andamento" : ""}
                    </span>
                    <span
                      className={cn(
                        "mx-auto w-full max-w-7 rounded-t-[3px] transition-[height] duration-500 group-hover:opacity-80",
                        h.parcial ? "bg-foreground/35" : "bg-foreground/80",
                        h.total === 0 && "h-px bg-foreground/15",
                      )}
                      style={h.total > 0 ? { height: `${Math.max(6, (h.total / maximo) * 100)}%` } : undefined}
                    />
                  </li>
                ))}
              </ul>
              <div className="mt-1.5 flex gap-[2px] border-t pt-1">
                {horas.map((h, i) => (
                  <span key={h.hora} className="min-w-0 flex-1 text-center font-mono text-[10px] text-sutil">
                    {horas.length <= 10 || i % 2 === 0 ? String(h.hora).padStart(2, "0") : ""}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-sutil">
                Pico: {maximo} moto{maximo === 1 ? "" : "s"}/hora · barra clara = hora em andamento
              </p>
            </>
          )}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4 border-t pt-4 md:grid-cols-4">
        <Leitura rotulo="Entradas" valor={entradas} detalhe="caixas registradas (E1)" />
        <Leitura rotulo="Expedidas" valor={expedidas} detalhe="saídas do estoque" />
        <Leitura
          rotulo="Última finalização"
          valor={ultima ? hora(ultima) : "—"}
          detalhe={ultima ? `há ${formatarDuracaoMin(minutosDesde(ultima, agora))}` : "nenhuma hoje"}
        />
        <Leitura
          rotulo="Intervalo médio"
          valor={media === null ? "—" : formatarDuracaoMin(media)}
          detalhe={media === null ? "precisa de 2 finalizações" : "entre uma moto e a próxima"}
        />
      </div>
    </Painel>
  );
}
