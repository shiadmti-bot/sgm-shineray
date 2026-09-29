"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertOctagon, Bell, BellRing, Boxes, CheckCheck, ClipboardCheck, Info, PauseCircle, RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { marcarComoLida, marcarTodasComoLidas, useNotificacoes, type Notificacao } from "@/lib/notificacoes";

export const ICONES_NOTIFICACAO: Record<string, { icone: LucideIcon; cor: string }> = {
  pausa: { icone: PauseCircle, cor: "bg-warning/10 text-warning" },
  retrabalho: { icone: RotateCcw, cor: "bg-destructive/10 text-destructive" },
  avaria: { icone: AlertOctagon, cor: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  reparo: { icone: ClipboardCheck, cor: "bg-success/10 text-success" },
  inventario: { icone: Boxes, cor: "bg-info/10 text-info" },
  info: { icone: Info, cor: "bg-muted text-muted-foreground" },
};

export const iconeNotificacao = (tipo: string) => ICONES_NOTIFICACAO[tipo] ?? ICONES_NOTIFICACAO.info;

export function tempoRelativo(iso: string) {
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return "";
  }
}

export function ItemNotificacao({ n, aoAbrir, compacto = false }: { n: Notificacao; aoAbrir: (n: Notificacao) => void; compacto?: boolean }) {
  const { icone: Icone, cor } = iconeNotificacao(n.tipo);
  return (
    <button
      type="button"
      onClick={() => aoAbrir(n)}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg text-left transition-colors hover:bg-accent",
        compacto ? "px-2 py-2.5" : "px-3 py-3",
        !n.lida_em && "bg-primary/[0.04]",
      )}
    >
      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", cor)}>
        <Icone className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn("truncate text-sm", n.lida_em ? "font-medium" : "font-semibold")}>{n.titulo}</span>
          {!n.lida_em && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Não lida" />}
        </span>
        {n.mensagem && <span className={cn("block text-xs text-muted-foreground", compacto && "line-clamp-2")}>{n.mensagem}</span>}
        <span className="mt-0.5 block text-[11px] text-muted-foreground/80">{tempoRelativo(n.created_at)}</span>
      </span>
    </button>
  );
}

/** Sino do cabeçalho com as notificações mais recentes. */
export function SinoNotificacoes() {
  const router = useRouter();
  const { itens, naoLidas, carregado } = useNotificacoes();
  const recentes = itens.slice(0, 8);

  const abrir = (n: Notificacao) => {
    if (!n.lida_em) marcarComoLida(n.id);
    if (n.link) router.push(n.link);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={naoLidas ? `${naoLidas} notificações não lidas` : "Notificações"}>
          {naoLidas > 0 ? <BellRing className="size-5" /> : <Bell className="size-5" />}
          {naoLidas > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {naoLidas > 9 ? "9+" : naoLidas}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notificações</p>
          {naoLidas > 0 && (
            <button type="button" onClick={() => marcarTodasComoLidas()} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <CheckCheck className="size-3.5" /> Marcar todas como lidas
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {!carregado ? (
            <div className="space-y-2 p-2">{[1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>
          ) : recentes.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma notificação por aqui.</p>
          ) : (
            recentes.map((n) => <ItemNotificacao key={n.id} n={n} aoAbrir={abrir} compacto />)
          )}
        </div>
        <div className="border-t p-1.5">
          <Link href="/notificacoes" className="block rounded-md px-3 py-2 text-center text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
            Ver todas
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
