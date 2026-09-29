"use client";

import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { rotaDoCaminho, TOTAL_ESTACOES } from "@/lib/rbac/rotas";

/**
 * Cabeçalho de estação: código (E1…E5), grupo e posição no fluxo, título e ações.
 * O código e o grupo vêm da tabela de rotas; `icone` é aceito por compatibilidade.
 */
export function PageHeader({
  titulo,
  descricao,
  acoes,
  className,
  codigo,
  sobretitulo,
}: {
  titulo: string;
  descricao?: React.ReactNode;
  icone?: LucideIcon;
  acoes?: React.ReactNode;
  className?: string;
  codigo?: string;
  sobretitulo?: string;
}) {
  const rota = rotaDoCaminho(usePathname());
  const cod = codigo ?? rota?.codigo;
  const acima =
    sobretitulo ??
    [rota?.grupo && rota.grupo !== "Conta" ? rota.grupo : null, rota?.estacao ? `Estação ${rota.estacao} de ${TOTAL_ESTACOES}` : null]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className={cn("flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between print:hidden", className)}>
      <div className="min-w-0">
        {(cod || acima) && (
          <div className="mb-2 flex items-center gap-2">
            {cod && <span className="codigo-estacao">{cod}</span>}
            {acima && <span className="rotulo text-sutil">{acima}</span>}
          </div>
        )}
        <h1 className="text-[26px] font-semibold leading-tight text-foreground">{titulo}</h1>
        {descricao && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}
