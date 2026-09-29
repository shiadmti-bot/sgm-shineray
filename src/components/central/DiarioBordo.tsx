"use client";

import Link from "next/link";
import { ArrowRight, NotebookText } from "lucide-react";
import { Painel } from "@/components/sgm/Painel";
import { estacaoDaAcao, rotuloAcao } from "@/lib/eventos";
import { cn } from "@/lib/utils";
import { FinalChassi } from "./Montagens";

export interface EventoDiario {
  id: string;
  acao: string;
  usuario: string;
  referencia: string;
  created_at: string;
}

const ehChassi = (ref: string) => /^[A-HJ-NPR-Z0-9]{17}$/i.test(ref);
const ehIdentificador = (ref: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);

function textoReferencia(ref: string) {
  if (!ref || ref === "Sistema") return "Sistema";
  if (ehIdentificador(ref)) return "colaborador";
  return ref;
}

/** Diário de bordo: os últimos registros da auditoria, com a estação onde cada um ocorreu. */
export function DiarioBordo({
  eventos,
  carregando,
  linkProntuario,
  hrefAuditoria,
  className,
}: {
  eventos: EventoDiario[];
  carregando: boolean;
  linkProntuario?: (chassi: string) => string;
  hrefAuditoria?: string;
  className?: string;
}) {
  return (
    <Painel
      titulo="Diário de bordo"
      icone={NotebookText}
      meta="Últimos registros"
      semRecuo
      className={className}
      acoes={
        hrefAuditoria && (
          <Link href={hrefAuditoria} className="flex items-center gap-1 text-xs font-semibold text-foreground hover:text-primary">
            Auditoria completa <ArrowRight className="size-3.5" />
          </Link>
        )
      }
    >
      {carregando ? (
        <div className="space-y-2 p-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-8 animate-pulse rounded-sm bg-muted" />)}</div>
      ) : eventos.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nenhum registro visível para o seu perfil.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm sm:min-w-[560px]">
            <thead>
              <tr className="border-b text-left">
                <th scope="col" className="rotulo w-16 px-4 py-2.5 font-semibold text-sutil">Hora</th>
                <th scope="col" className="rotulo w-14 px-2 py-2.5 font-semibold text-sutil">Est.</th>
                <th scope="col" className="rotulo px-2 py-2.5 font-semibold text-sutil">Evento</th>
                <th scope="col" className="rotulo hidden px-2 py-2.5 font-semibold text-sutil sm:table-cell">Quem</th>
                <th scope="col" className="rotulo px-4 py-2.5 text-right font-semibold text-sutil">Referência</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {eventos.map((ev) => {
                const codigo = estacaoDaAcao(ev.acao);
                const chassi = ehChassi(ev.referencia) ? ev.referencia : null;
                return (
                  <tr key={ev.id} className="hover:bg-accent/50">
                    <td className="px-4 py-2 font-mono text-xs tabular-nums text-muted-foreground">
                      {new Date(ev.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-2 py-2">
                      {codigo ? (
                        <span className={cn("codigo-estacao", (codigo === "AV" || codigo === "IN") && "border border-dashed border-foreground/40 bg-transparent text-foreground")}>
                          {codigo}
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-sutil">—</span>
                      )}
                    </td>
                    <td className="max-w-[18rem] px-2 py-2 font-medium">
                      <span className="line-clamp-2">{rotuloAcao(ev.acao)}</span>
                      <span className="block truncate text-xs font-normal text-sutil sm:hidden">{ev.usuario}</span>
                    </td>
                    <td className="hidden max-w-[12rem] truncate px-2 py-2 text-muted-foreground sm:table-cell">{ev.usuario}</td>
                    <td className="px-4 py-2 text-right">
                      {chassi ? (
                        linkProntuario ? (
                          <Link href={linkProntuario(chassi)} className="hover:underline">
                            <FinalChassi chassi={chassi} />
                          </Link>
                        ) : (
                          <FinalChassi chassi={chassi} />
                        )
                      ) : (
                        <span className="text-xs text-sutil">{textoReferencia(ev.referencia)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Painel>
  );
}
