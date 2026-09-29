"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/sgm/PageHeader";
import { EmptyState } from "@/components/sgm/EmptyState";
import { ItemNotificacao } from "@/components/layout/SinoNotificacoes";
import { cn } from "@/lib/utils";
import {
  excluirNotificacao, marcarComoLida, marcarTodasComoLidas, recarregarNotificacoes, useNotificacoes, type Notificacao,
} from "@/lib/notificacoes";

const FILTROS = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "nao_lidas", rotulo: "Não lidas" },
  { valor: "pausa", rotulo: "Pausas" },
  { valor: "retrabalho", rotulo: "Retrabalhos" },
  { valor: "avaria", rotulo: "Avarias" },
  { valor: "reparo", rotulo: "Reparos" },
  { valor: "inventario", rotulo: "Inventário" },
] as const;

export default function NotificacoesPage() {
  const router = useRouter();
  const { itens, naoLidas, carregado } = useNotificacoes();
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["valor"]>("todas");

  const visiveis = itens.filter((n) => (filtro === "todas" ? true : filtro === "nao_lidas" ? !n.lida_em : n.tipo === filtro));

  const abrir = (n: Notificacao) => {
    if (!n.lida_em) marcarComoLida(n.id);
    if (n.link) router.push(n.link);
  };

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        icone={Bell}
        titulo="Notificações"
        descricao="Avisos da produção enviados para você: pausas, retrabalhos, avarias, reparos e inventários."
        acoes={
          <>
            <Button variant="outline" onClick={() => recarregarNotificacoes()}><RefreshCw /> Atualizar</Button>
            <Button onClick={() => marcarTodasComoLidas()} disabled={naoLidas === 0}><CheckCheck /> Marcar todas como lidas</Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            type="button"
            onClick={() => setFiltro(f.valor)}
            className={cn("rounded-sm border px-3 py-1.5 font-rotulo text-[13px] font-semibold uppercase tracking-[0.04em] transition-colors",
              filtro === f.valor ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}
          >
            {f.rotulo}{f.valor === "nao_lidas" && naoLidas > 0 ? ` (${naoLidas})` : ""}
          </button>
        ))}
      </div>

      {!carregado ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : visiveis.length === 0 ? (
        <EmptyState icone={Bell} titulo="Nada por aqui" descricao="As notificações aparecem quando algo precisa da sua atenção." />
      ) : (
        <Card className="py-2">
          <CardContent className="space-y-1 px-2">
            {visiveis.map((n) => (
              <div key={n.id} className="group flex items-start gap-1">
                <div className="min-w-0 flex-1"><ItemNotificacao n={n} aoAbrir={abrir} /></div>
                <Button variant="ghost" size="icon-sm" className="mt-2 opacity-60 group-hover:opacity-100" aria-label="Excluir notificação" title="Excluir" onClick={() => excluirNotificacao(n.id)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <p className="text-center text-xs text-muted-foreground">São exibidas as 40 notificações mais recentes.</p>
    </div>
  );
}
