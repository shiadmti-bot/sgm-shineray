"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import { 
  LayoutDashboard, ScanBarcode, Wrench, ClipboardCheck, 
  Warehouse, LogOut, Moon, Sun, Users,
  ShieldAlert, BarChart3, ChevronRight, Printer, AlertOctagon, Tag
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Interface compatível com o Login
interface UserData {
  id: string;
  nome: string;
  cargo: string;
  email?: string;
  matricula?: string;
}

// 1. Definição Estratégica de Menus V2.2 (Fluxo Completo)
const menuItems = [
  { 
    href: "/dashboard", 
    icon: LayoutDashboard, 
    label: "Visão Geral", 
    roles: ["gestor", "master", "supervisor"] 
  },
  { 
    href: "/tecnicos", 
    icon: Users, 
    label: "Gestão de Equipe", 
    roles: ["gestor", "master"] 
  },
  { 
    href: "/scanner", 
    icon: ScanBarcode, 
    label: "Entrada (Scanner)", 
    roles: ["gestor", "montador", "supervisor", "master"] 
  },
  { 
    href: "/montagem", 
    icon: Wrench, 
    label: "Linha de Montagem", 
    roles: ["montador", "supervisor", "master"] 
  },
  { 
    href: "/qualidade", 
    icon: ClipboardCheck, 
    label: "Inspeção de Qualidade", 
    roles: ["gestor", "supervisor", "master"] 
  },
  { 
    href: "/avarias", 
    icon: AlertOctagon, 
    label: "Pátio de Avarias", 
    roles: ["gestor", "supervisor", "master"] 
  },
  { 
    href: "/etiquetagem", 
    icon: Tag, 
    label: "Etiquetagem", 
    roles: ["gestor", "supervisor", "master", "montador"] 
  },
  { 
    href: "/estoque", 
    icon: Warehouse, 
    label: "Estoque & Expedição", 
    roles: ["gestor", "supervisor", "master"] 
  },
  { 
    href: "/relatorios", 
    icon: BarChart3, 
    label: "Relatórios BI", 
    roles: ["gestor", "master"] 
  },
  { 
    href: "/auditoria", 
    icon: ShieldAlert, 
    label: "Auditoria", 
    roles: ["master"] 
  },
];

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);

  useEffect(() => {
    setMounted(true);
    const storedUser = localStorage.getItem("sgm_user");
    if (storedUser) {
      setUserData(JSON.parse(storedUser));
    }
  }, []);

  const filteredMenu = menuItems.filter(item => 
    userData ? item.roles.includes(userData.cargo) : false
  );

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-950/50 backdrop-blur-xl border-r border-slate-200 dark:border-slate-800 transition-all duration-300">
      
      {/* HEADER */}
      <div className="flex flex-col items-center justify-center pt-8 pb-6">
        <div className="relative w-24 h-20">
            <Image 
                src="/shineray-logo.png" 
                alt="Shineray" 
                fill
                sizes="(max-width: 768px) 100vw, 96px"
                className="object-contain"
                priority
            />
        </div>

        <AnimatePresence>
            {mounted && userData && (
            <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "mt-4 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm",
                  userData.cargo === 'master' ? "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800" :
                  userData.cargo === 'gestor' ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800" :
                  userData.cargo === 'supervisor' ? "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800" :
                  "bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700" 
                )}
            >
                {userData.cargo}
            </motion.div>
            )}
        </AnimatePresence>
      </div>

      {/* NAVEGAÇÃO */}
      <nav className="flex-1 px-4 space-y-2 overflow-y-auto py-2 scrollbar-hide">
        {mounted ? (
          filteredMenu.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            
            return (
              <Link 
                key={item.href} 
                href={item.href} 
                onClick={onClose} 
                className="relative group block outline-none"
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 rounded-xl z-0"
                    initial={false}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                
                <div className={cn(
                  "relative z-10 flex items-center justify-between px-4 py-3 rounded-xl transition-colors duration-200",
                  isActive 
                    ? "text-red-600 dark:text-red-400" 
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/50 dark:hover:bg-slate-900/50"
                )}>
                  <div className="flex items-center gap-3">
                      <Icon className={cn("w-5 h-5", isActive ? "stroke-[2.5px]" : "stroke-2")} />
                      <span className={cn("text-sm tracking-wide", isActive ? "font-bold" : "font-medium")}>
                          {item.label}
                      </span>
                  </div>
                  {isActive && <ChevronRight className="w-4 h-4 opacity-50" />}
                </div>
              </Link>
            );
          })
        ) : (
          <div className="space-y-3 px-2">
             {[1,2,3,4,5].map(i => (
                <div key={i} className="h-12 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl animate-pulse" />
             ))}
          </div>
        )}
      </nav>

      {/* FOOTER */}
      <div className="p-4 mt-auto">
        {mounted && userData && (
            <div className="mb-4 flex items-center gap-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                <Avatar className="h-10 w-10 border-2 border-slate-100 dark:border-slate-800">
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${userData.nome}`} />
                    <AvatarFallback className="bg-slate-200 dark:bg-slate-800">{userData.nome.substring(0,2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate leading-none">
                        {userData.nome.split(' ')[0]}
                    </p>
                    <p className="text-[10px] text-slate-500 truncate mt-1 font-mono">
                        {userData.email || (userData.matricula ? `ID: ${userData.matricula}` : '')}
                    </p>
                </div>
                <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    onClick={() => {
                        localStorage.removeItem('sgm_user');
                        localStorage.removeItem('sgm_remember_email');
                        window.location.href = "/login";
                    }}
                    title="Sair"
                >
                    <LogOut className="w-4 h-4" />
                </Button>
            </div>
        )}

        <Button 
          variant="outline" 
          className="w-full justify-center gap-2 h-9 text-xs border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {mounted && theme === "dark" ? <Sun className="h-3.5 w-3.5 text-orange-400" /> : <Moon className="h-3.5 w-3.5 text-blue-500" />}
          <span>{mounted ? (theme === 'dark' ? 'Modo Claro' : 'Modo Escuro') : 'Carregando...'}</span>
        </Button>
      </div>
    </div>
  );
}