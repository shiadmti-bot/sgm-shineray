"use client";

import { useSyncExternalStore } from "react";
import { GraduationCap, X } from "lucide-react";
import { cn } from "@/lib/utils";

// "Modo guia": dicas curtas que explicam cada tela (ligado por padrão; cada dispositivo guarda a escolha).

const CHAVE = "sgm_modo_guia";
const EVENTO = "sgm:modo-guia";

function ler(): boolean {
  try {
    return localStorage.getItem(CHAVE) !== "0";
  } catch {
    return true;
  }
}

function assinar(f: () => void) {
  window.addEventListener(EVENTO, f);
  window.addEventListener("storage", f);
  return () => {
    window.removeEventListener(EVENTO, f);
    window.removeEventListener("storage", f);
  };
}

export function definirModoGuia(ativo: boolean) {
  try {
    localStorage.setItem(CHAVE, ativo ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENTO));
}

/** `true` quando as dicas estão ligadas (no servidor: desligado, para não piscar). */
export function useModoGuia(): boolean {
  return useSyncExternalStore(assinar, ler, () => false);
}

/** Dica do modo guia: explica o que a tela mostra ou como usá-la. */
export function Dica({ titulo, children, className }: { titulo: string; children: React.ReactNode; className?: string }) {
  const ativo = useModoGuia();
  if (!ativo) return null;
  return (
    <aside className={cn("flex items-start gap-3 rounded-md border border-info/30 bg-info/[0.06] px-3.5 py-3 text-sm print:hidden", className)}>
      <GraduationCap className="mt-0.5 size-4 shrink-0 text-info" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-semibold text-foreground">{titulo}</p>
        <div className="text-muted-foreground">{children}</div>
      </div>
      <button
        type="button"
        onClick={() => definirModoGuia(false)}
        className="shrink-0 rounded-sm p-1 text-sutil hover:bg-foreground/5 hover:text-foreground"
        title="Desligar todas as dicas (reative pelo botão Guia no topo)"
        aria-label="Desligar dicas"
      >
        <X className="size-4" />
      </button>
    </aside>
  );
}
