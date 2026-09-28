"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { encerrarSessao, rotaInicialDoCargo, temCargo, useHidratado, useUsuarioLogado } from "@/lib/auth";

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

export function RoleGuard({ children, allowedRoles }: RoleGuardProps) {
  const router = useRouter();
  const hidratado = useHidratado();
  const usuario = useUsuarioLogado();
  // Master SEMPRE tem acesso, não importa o que a página pede.
  const autorizado = temCargo(usuario, allowedRoles);

  useEffect(() => {
    if (!hidratado) return;

    if (!usuario) {
      router.replace("/login");
      return;
    }

    if (!autorizado) {
      const destino = rotaInicialDoCargo(usuario.cargo);
      if (destino === "/login") {
        // Cargo desconhecido: sessão inválida.
        encerrarSessao();
      } else {
        toast.error("Seu perfil não tem acesso a esta tela.");
      }
      router.replace(destino);
    }
  }, [hidratado, usuario, autorizado, router]);

  if (!hidratado || !autorizado) {
    return (
      <div className="h-[60vh] w-full flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-red-600" />
      </div>
    );
  }

  return <>{children}</>;
}
