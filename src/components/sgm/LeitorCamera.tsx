"use client";

import { useRef } from "react";
import { useZxing } from "react-zxing";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Leitura de código de barras/QR pela câmera traseira do tablet ou celular.
 * Ignora a mesma leitura repetida em sequência (a câmera entrega várias vezes o mesmo código).
 */
export function LeitorCamera({
  aoLer,
  aoFechar,
  continuo = false,
  intervaloRepeticaoMs = 3000,
}: {
  aoLer: (codigo: string) => void;
  aoFechar: () => void;
  /** Mantém a câmera aberta após cada leitura (inventário). */
  continuo?: boolean;
  intervaloRepeticaoMs?: number;
}) {
  const ultima = useRef<{ codigo: string; em: number }>({ codigo: "", em: 0 });
  const { ref } = useZxing({
    constraints: { video: { facingMode: "environment" }, audio: false },
    onResult(resultado) {
      const codigo = resultado.getText().trim();
      const agora = Date.now();
      if (!codigo || (ultima.current.codigo === codigo && agora - ultima.current.em < intervaloRepeticaoMs)) return;
      ultima.current = { codigo, em: agora };
      aoLer(codigo);
      if (!continuo) aoFechar();
    },
  });

  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      <video ref={ref} className="aspect-video w-full object-cover" muted playsInline />
      <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-primary/90" />
      <Button type="button" variant="secondary" size="icon" className="absolute right-3 top-3 rounded-full" onClick={aoFechar} aria-label="Fechar câmera">
        <X />
      </Button>
      <p className="absolute inset-x-0 bottom-0 bg-black/50 py-1.5 text-center text-xs text-white">Aponte para o código de barras do chassi</p>
    </div>
  );
}
