"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** Confirmação padrão para ações importantes (com estado de "processando"). */
export function ConfirmDialog({
  aberto,
  aoMudar,
  titulo,
  descricao,
  confirmar = "Confirmar",
  destrutivo = false,
  desabilitado = false,
  aoConfirmar,
  children,
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  titulo: string;
  descricao?: React.ReactNode;
  confirmar?: string;
  destrutivo?: boolean;
  desabilitado?: boolean;
  aoConfirmar: () => Promise<unknown> | unknown;
  children?: React.ReactNode;
}) {
  const [processando, setProcessando] = useState(false);

  async function executar() {
    setProcessando(true);
    try {
      await aoConfirmar();
    } finally {
      setProcessando(false);
    }
  }

  return (
    <AlertDialog open={aberto} onOpenChange={(v) => !processando && aoMudar(v)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          {descricao && <AlertDialogDescription asChild><div>{descricao}</div></AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={processando}>Cancelar</AlertDialogCancel>
          <Button variant={destrutivo ? "destructive" : "default"} disabled={processando || desabilitado} onClick={executar}>
            {processando && <Loader2 className="animate-spin" />}
            {confirmar}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
