"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

export function RoleGuard({ children, allowedRoles }: RoleGuardProps) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Verificar se tem usuário logado
    const storedUser = localStorage.getItem("sgm_user");
    
    if (!storedUser) {
      router.push("/login");
      return;
    }

    const user = JSON.parse(storedUser);
    
    // 2. LÓGICA DE SUPERUSUÁRIO (A CORREÇÃO)
    // Se o usuário for 'master', ele SEMPRE tem acesso, não importa o que a página pede.
    if (user.cargo === 'master') {
        setAuthorized(true);
        setLoading(false);
        return;
    }

    // 3. Verificação Normal para outros mortais
    if (allowedRoles.includes(user.cargo)) {
      setAuthorized(true);
    } else {
      // Se for barrado, redireciona para a página correta do cargo
      if (user.cargo === "mecanico") router.push("/montagem");
      else if (user.cargo === "gestor") router.push("/dashboard");
      else if (user.cargo === "inspetor") router.push("/qualidade");
      else router.push("/login"); // Se cargo desconhecido, logout
    }
    
    setLoading(false);
  }, [router, allowedRoles]);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-10 h-10 animate-spin text-red-600" />
      </div>
    );
  }

  return authorized ? <>{children}</> : null;
}