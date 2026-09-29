"use client";

import { Grid3x3 } from "lucide-react";
import { Painel } from "@/components/sgm/Painel";
import { cn } from "@/lib/utils";

const MAX_CORES = 8;
const OUTRAS = "__outras__";

interface MotoMatriz {
  modelo: string;
  cor?: string | null;
}

/** Tom da célula pela quantidade (rampa de um só matiz: quanto mais motos, mais escura). */
function tomDaCelula(valor: number, maximo: number) {
  if (valor === 0) return { fundo: "", texto: "text-sutil" };
  const f = valor / Math.max(1, maximo);
  if (f > 0.8) return { fundo: "bg-foreground/70", texto: "text-background" };
  if (f > 0.6) return { fundo: "bg-foreground/45", texto: "text-foreground" };
  if (f > 0.4) return { fundo: "bg-foreground/25", texto: "text-foreground" };
  if (f > 0.2) return { fundo: "bg-foreground/[0.14]", texto: "text-foreground" };
  return { fundo: "bg-foreground/[0.06]", texto: "text-foreground" };
}

/**
 * Matriz do pátio: unidades por modelo (linhas) e cor (colunas). Cada célula é um filtro:
 * tocar mostra só aquelas motos na lista. Mais de 8 cores: as menos frequentes somam em "Outras".
 */
export function MatrizPatio({
  motos,
  corDaCor,
  modelo,
  cor,
  aoFiltrar,
  className,
}: {
  motos: MotoMatriz[];
  corDaCor: (nome: string) => string;
  /** Filtros ativos ("todos"/"todas" = sem filtro). */
  modelo: string;
  cor: string;
  aoFiltrar: (modelo: string, cor: string) => void;
  className?: string;
}) {
  const porCor = new Map<string, number>();
  const porModelo = new Map<string, number>();
  for (const m of motos) {
    const c = m.cor || "Sem cor";
    porCor.set(c, (porCor.get(c) ?? 0) + 1);
    porModelo.set(m.modelo, (porModelo.get(m.modelo) ?? 0) + 1);
  }
  const coresOrdenadas = [...porCor.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
  const colunas = coresOrdenadas.length > MAX_CORES ? [...coresOrdenadas.slice(0, MAX_CORES - 1), OUTRAS] : coresOrdenadas;
  const visiveis = new Set(colunas);
  const colunaDe = (c: string) => (visiveis.has(c) ? c : OUTRAS);
  const linhas = [...porModelo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([m]) => m);

  const celulas = new Map<string, number>();
  for (const m of motos) {
    const chave = `${m.modelo}|${colunaDe(m.cor || "Sem cor")}`;
    celulas.set(chave, (celulas.get(chave) ?? 0) + 1);
  }
  const maximo = Math.max(1, ...celulas.values());
  const totalColuna = (c: string) =>
    c === OUTRAS ? coresOrdenadas.slice(MAX_CORES - 1).reduce((s, x) => s + (porCor.get(x) ?? 0), 0) : porCor.get(c) ?? 0;
  const nomeColuna = (c: string) => (c === OUTRAS ? "Outras" : c);

  if (motos.length === 0) return null;

  return (
    <Painel
      titulo="Matriz do pátio"
      icone={Grid3x3}
      meta="Unidades por modelo e cor · toque numa célula para filtrar a lista"
      semRecuo
      className={className}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th scope="col" className="rotulo sticky left-0 z-10 border-b bg-card px-4 py-2.5 text-left font-semibold text-sutil">Modelo</th>
              {colunas.map((c) => (
                <th key={c} scope="col" className="border-b px-1 py-2 font-normal">
                  <button
                    type="button"
                    onClick={() => aoFiltrar("todos", cor === c ? "todas" : c)}
                    disabled={c === OUTRAS}
                    className={cn(
                      "mx-auto flex w-full max-w-[96px] flex-col items-center gap-1 rounded-sm px-1 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                      cor === c ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent",
                    )}
                    title={c === OUTRAS ? "Cores menos frequentes" : `Filtrar pela cor ${c}`}
                  >
                    {c !== OUTRAS && (
                      <span aria-hidden className="size-3.5 rounded-[2px] border border-foreground/25" style={{ backgroundColor: corDaCor(c) }} />
                    )}
                    <span className="w-full truncate">{nomeColuna(c)}</span>
                  </button>
                </th>
              ))}
              <th scope="col" className="rotulo border-b px-4 py-2.5 text-right font-semibold text-sutil">Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((mod) => (
              <tr key={mod}>
                <th scope="row" className="sticky left-0 z-10 border-b bg-card px-4 py-1.5 text-left font-medium">
                  <button
                    type="button"
                    onClick={() => aoFiltrar(modelo === mod && cor === "todas" ? "todos" : mod, "todas")}
                    className={cn(
                      "max-w-[220px] truncate rounded-sm px-1.5 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      modelo === mod ? "bg-foreground text-background" : "hover:bg-accent",
                    )}
                    title={`Filtrar pelo modelo ${mod}`}
                  >
                    {mod}
                  </button>
                </th>
                {colunas.map((c) => {
                  const valor = celulas.get(`${mod}|${c}`) ?? 0;
                  const tom = tomDaCelula(valor, maximo);
                  const selecionada = modelo === mod && cor === c;
                  return (
                    <td key={c} className="border-b p-[2px]">
                      <button
                        type="button"
                        disabled={valor === 0 || c === OUTRAS}
                        onClick={() => (selecionada ? aoFiltrar("todos", "todas") : aoFiltrar(mod, c))}
                        aria-label={`${mod}, ${nomeColuna(c)}: ${valor} moto(s)`}
                        title={`${mod} · ${nomeColuna(c)}: ${valor} moto(s)`}
                        className={cn(
                          "flex h-9 w-full items-center justify-center rounded-[3px] font-mono text-sm tabular-nums outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                          tom.fundo,
                          tom.texto,
                          valor > 0 && c !== OUTRAS && "hover:shadow-[inset_0_0_0_2px_hsl(var(--foreground))]",
                          selecionada && "shadow-[inset_0_0_0_2px_hsl(var(--primary))]",
                        )}
                      >
                        {valor > 0 ? valor : "·"}
                      </button>
                    </td>
                  );
                })}
                <td className="border-b px-4 py-1.5 text-right font-mono font-semibold tabular-nums">{porModelo.get(mod)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="rotulo sticky left-0 z-10 bg-card px-4 py-2.5 text-left font-semibold text-sutil">Total</th>
              {colunas.map((c) => (
                <td key={c} className="px-1 py-2.5 text-center font-mono text-sm font-semibold tabular-nums">{totalColuna(c)}</td>
              ))}
              <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold tabular-nums">{motos.length}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5 text-[11px] text-sutil">
        <span>Menos</span>
        {["bg-foreground/[0.06]", "bg-foreground/[0.14]", "bg-foreground/25", "bg-foreground/45", "bg-foreground/70"].map((f) => (
          <span key={f} aria-hidden className={cn("h-3 w-6 rounded-[2px]", f)} />
        ))}
        <span>Mais motos</span>
        <span className="ml-auto">O quadrado ao lado do nome é a cor da peça.</span>
      </div>
    </Painel>
  );
}
