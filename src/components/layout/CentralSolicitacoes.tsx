"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Iniciais } from "@/components/sgm/Iniciais";
import { supabase } from "@/lib/supabase";
import { registrarLog } from "@/lib/logger";
import { getUsuarioLogado, usePode } from "@/lib/auth";
import { formatarDuracaoMin, minutosDesde } from "@/lib/datas";
import { tocarSom } from "@/lib/sons";
import { cn } from "@/lib/utils";

export const EVENTO_ABRIR_SOLICITACOES = "sgm:abrir-solicitacoes";

const INTERVALO_POLLING_MS = 20_000;

interface Solicitacao {
  id: string;
  moto_id: string;
  montador_id: string;
  motivo: string;
  status: string;
  created_at: string;
  montador?: { nome: string } | null;
  moto?: { sku: string; modelo: string } | null;
}

/** Pedidos de pausa da linha: botão flutuante + lista para autorizar ou negar. */
export function CentralSolicitacoes() {
  const aprova = usePode("pausas.aprovar");
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [processando, setProcessando] = useState<string | null>(null);
  const [, setRelogio] = useState(0);

  const buscar = useCallback(async () => {
    const { data } = await supabase
      .from("solicitacoes_pausa")
      .select(`*, montador:funcionarios!solicitacoes_montador_id_fkey(nome), moto:motos!solicitacoes_moto_id_fkey(sku, modelo)`)
      .eq("status", "pendente")
      .order("created_at", { ascending: true });
    if (data) setSolicitacoes(data as Solicitacao[]);
  }, []);

  useEffect(() => {
    if (!aprova) return;
    buscar();
    const canal = supabase
      .channel("central-solicitacoes")
      .on("postgres_changes", { event: "*", schema: "public", table: "solicitacoes_pausa" }, (payload) => {
        const nova = payload.new as Partial<Solicitacao>;
        if (payload.eventType === "INSERT" && nova.status === "pendente") {
          buscar();
          tocarSom("alerta");
          toast("Novo pedido de pausa", {
            icon: <BellRing className="size-4 text-warning" />,
            action: { label: "Ver", onClick: () => setAberto(true) },
          });
        } else {
          buscar();
        }
      })
      .subscribe();
    const polling = setInterval(buscar, INTERVALO_POLLING_MS);
    const relogio = setInterval(() => setRelogio((r) => r + 1), 60_000);
    return () => {
      supabase.removeChannel(canal);
      clearInterval(polling);
      clearInterval(relogio);
    };
  }, [aprova, buscar]);

  useEffect(() => {
    const abrir = () => setAberto(true);
    window.addEventListener(EVENTO_ABRIR_SOLICITACOES, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_SOLICITACOES, abrir);
  }, []);

  const responder = async (s: Solicitacao, aprovar: boolean) => {
    const eu = getUsuarioLogado();
    if (!eu) return;
    setProcessando(s.id);
    try {
      // Outro supervisor pode ter respondido antes
      const { data: atual } = await supabase.from("solicitacoes_pausa").select("status").eq("id", s.id).maybeSingle();
      if (atual && atual.status !== "pendente") {
        toast.info("Este pedido já foi respondido por outra pessoa.");
        setSolicitacoes((lista) => lista.filter((x) => x.id !== s.id));
        return;
      }

      let decisao: "aprovado" | "rejeitado" = aprovar ? "aprovado" : "rejeitado";
      if (aprovar) {
        // Só pausa se a moto continuar em produção
        const { data: pausada, error } = await supabase
          .from("motos")
          .update({ status: "pausado" })
          .eq("id", s.moto_id)
          .eq("status", "em_producao")
          .select("id");
        if (error) throw error;
        if (!pausada || pausada.length === 0) {
          decisao = "rejeitado";
          toast.warning("A moto não está mais em produção. Pedido encerrado sem pausa.");
        } else {
          const { error: erroPausa } = await supabase
            .from("pausas_producao")
            .insert({ moto_id: s.moto_id, montador_id: s.montador_id, motivo: s.motivo });
          if (erroPausa) console.error("Erro ao registrar a pausa:", erroPausa);
        }
      }

      const { error } = await supabase
        .from("solicitacoes_pausa")
        .update({ status: decisao, supervisor_id: eu.id, updated_at: new Date().toISOString() })
        .eq("id", s.id);
      if (error) throw error;

      await registrarLog(decisao === "aprovado" ? "PAUSA_APROVADA" : "PAUSA_REJEITADA", s.moto?.sku || "N/A", {
        motivo: s.motivo,
        montador: s.montador?.nome,
      });
      setSolicitacoes((lista) => lista.filter((x) => x.id !== s.id));
      if (decisao === "aprovado") toast.success("Pausa autorizada.");
      else if (!aprovar) toast.success("Pedido negado.");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível responder ao pedido.");
      buscar();
    } finally {
      setProcessando(null);
    }
  };

  if (!aprova || solicitacoes.length === 0) return null;

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 print:hidden">
        <Button
          onClick={() => setAberto(true)}
          aria-label={`${solicitacoes.length} pedido(s) de pausa`}
          className="relative size-16 rounded-full border-4 border-background shadow-lg shadow-primary/30 hover:scale-105"
        >
          <BellRing className="size-7" />
          <span className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full border-2 border-background bg-foreground text-xs font-bold text-background">
            {solicitacoes.length}
          </span>
        </Button>
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <BellRing className="size-5 text-primary" /> Pedidos de pausa
            </DialogTitle>
            <DialogDescription>Montadores aguardando autorização para interromper a montagem.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {solicitacoes.map((s) => {
              const espera = minutosDesde(s.created_at);
              return (
                <div key={s.id} className="flex flex-col gap-4 rounded-xl border bg-background p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <Iniciais nome={s.montador?.nome} />
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold">{s.montador?.nome || "Montador"}</p>
                      <p className="text-sm text-muted-foreground">
                        {s.moto?.modelo} · <span className="font-mono">{s.moto?.sku}</span>
                      </p>
                      <p className="w-fit rounded-md bg-warning/10 px-2 py-1 text-sm font-medium text-foreground">“{s.motivo}”</p>
                      <p className={cn("flex items-center gap-1 text-xs", espera >= 5 ? "font-semibold text-destructive" : "text-muted-foreground")}>
                        <Clock className="size-3" /> aguardando há {formatarDuracaoMin(espera)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="alvo-toque flex-1 md:flex-none" disabled={processando === s.id} onClick={() => responder(s, false)}>
                      <XCircle /> Negar
                    </Button>
                    <Button className="alvo-toque flex-1 bg-success text-success-foreground hover:bg-success/90 md:flex-none" disabled={processando === s.id} onClick={() => responder(s, true)}>
                      {processando === s.id ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Autorizar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
