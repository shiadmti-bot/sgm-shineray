"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

function assinar(f: () => void) {
  window.addEventListener("online", f);
  window.addEventListener("offline", f);
  return () => {
    window.removeEventListener("online", f);
    window.removeEventListener("offline", f);
  };
}

/** Faixa fixa quando o dispositivo perde a conexão (os dados da tela podem estar desatualizados). */
export function AvisoOffline() {
  const online = useSyncExternalStore(assinar, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="sticky top-16 z-30 flex items-center justify-center gap-2 bg-warning px-4 py-2 text-sm font-medium text-warning-foreground print:hidden">
      <WifiOff className="size-4" />
      Sem conexão. As ações não serão gravadas até a rede voltar.
    </div>
  );
}
