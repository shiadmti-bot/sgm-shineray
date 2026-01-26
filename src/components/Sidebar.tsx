"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import { 
  LayoutDashboard, ScanBarcode, Wrench, ClipboardCheck, 
  PackageSearch, LogOut, Moon, Sun, Users,
  ShieldAlert,
  BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Button } from "@/components/ui/button";

// 1. Definição dos perfis permitidos para cada rota
const menuItems = [
  { 
    href: "/dashboard", 
    icon: LayoutDashboard, 
    label: "Visão Geral", 
    roles: ["gestor", "master"] // Master vê tudo
  },
  { 
    href: "/tecnicos", 
    icon: Users, // Ícone de Equipe
    label: "Gestão de Equipe", 
    roles: ["gestor", "master"] // Apenas Gestão
  },
  { 
    href: "/scanner", 
    icon: ScanBarcode, 
    label: "Entrada (Scanner)", 
    roles: ["gestor", "mecanico", "master"] 
  },
  { 
    href: "/montagem", 
    icon: Wrench, 
    label: "Linha de Montagem", 
    roles: ["mecanico", "master"] 
  },
  { 
    href: "/qualidade", 
    icon: ClipboardCheck, 
    label: "Qualidade", 
    roles: ["gestor", "master"] 
  },
  { 
    href: "/estoque", 
    icon: PackageSearch, 
    label: "Estoque", 
    roles: ["gestor", "master"] 
  },
  { 
    href: "/auditoria", 
    icon: ShieldAlert,
    label: "Auditoria", 
    roles: ["master"] // <--- SÓ MASTER
  },
  { 
  href: "/relatorios", 
  icon: BarChart3, 
  label: "Relatórios & BI", 
  roles: ["gestor", "master"] 
},
  
];

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  // 2. Estado para guardar o cargo do usuário
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    // Ler o usuário salvo no login
    const storedUser = localStorage.getItem("sgm_user");
    if (storedUser) {
      const user = JSON.parse(storedUser);
      setUserRole(user.cargo); 
    }
  }, []);

  // 3. Filtro dos itens baseado no cargo
  const filteredMenu = menuItems.filter(item => 
    userRole ? item.roles.includes(userRole) : false
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 transition-colors duration-300">
      
      {/* LOGO */}
      <div className="flex flex-col items-center justify-center py-8">
        <div className="relative flex items-center justify-center w-24 h-24 bg-white rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-black/40 border border-slate-100 dark:border-slate-800 overflow-hidden transition-all duration-300">
            <div className="relative w-20 h-20 flex items-center justify-center">
              <Image 
                src="/shineray-logo.png" 
                alt="Shineray Logo" 
                fill
                className="object-contain p-2"
                priority
              />
            </div>
        </div>
        {/* Badge de Cargo */}
        {mounted && userRole && (
          <span className={`mt-4 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
            userRole === 'master' 
              ? 'bg-purple-100 text-purple-600 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800'
              : userRole === 'gestor'
                ? 'bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
                : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
          }`}>
            {userRole}
          </span>
        )}
      </div>

      {/* NAVEGAÇÃO FILTRADA */}
      <nav className="flex-1 px-4 space-y-2 overflow-y-auto py-4 scrollbar-hide">
        {mounted ? (
          filteredMenu.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link 
                key={item.href} 
                href={item.href} 
                onClick={onClose} 
                className="relative group block"
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 rounded-xl"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                
                <div className={cn(
                  "relative flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200",
                  isActive 
                    ? "text-red-600 dark:text-red-400 font-bold" 
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/50 dark:hover:bg-slate-900/50"
                )}>
                  <Icon className={cn("w-5 h-5", isActive ? "stroke-[2.5px]" : "stroke-2")} />
                  <span className="text-sm font-medium tracking-wide">{item.label}</span>
                </div>
              </Link>
            );
          })
        ) : (
          // Skeleton Loading
          <div className="space-y-3 px-2">
             {[1,2,3,4].map(i => (
                <div key={i} className="h-12 bg-slate-100 dark:bg-slate-900 rounded-xl animate-pulse" />
             ))}
          </div>
        )}
      </nav>

      {/* FOOTER */}
      <div className="p-4 m-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-start gap-3 h-10 text-slate-500 hover:text-slate-900 dark:hover:text-white"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {mounted && theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span className="text-sm">{!mounted ? "..." : (theme === 'dark' ? 'Modo Claro' : 'Modo Escuro')}</span>
        </Button>

        <Link 
          href="/login" 
          onClick={() => localStorage.removeItem('sgm_user')} 
          className="flex items-center gap-3 px-4 py-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all text-sm font-medium group"
        >
          <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>Sair do Sistema</span>
        </Link>
      </div>
    </div>
  );
}