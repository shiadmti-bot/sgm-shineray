"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  LogOut, ChevronDown, Bell, Settings, Menu, SlidersHorizontal
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CARGOS_ADMIN, CARGOS_GESTAO, ROTULO_CARGO, temCargo, useUsuarioLogado } from "@/lib/auth";
import { efetuarLogout } from "@/lib/logout";
import { EVENTO_ABRIR_SOLICITACOES, EVENTO_TOTAL_SOLICITACOES } from "@/components/CentralSolicitacoes";

// Título da Página baseado na Rota
const TITULOS: { prefixo: string; titulo: string }[] = [
  { prefixo: "/dashboard", titulo: "Visão Geral" },
  { prefixo: "/scanner", titulo: "Entrada & Scanner" },
  { prefixo: "/montagem", titulo: "Linha de Montagem" },
  { prefixo: "/qualidade", titulo: "Controle de Qualidade" },
  { prefixo: "/avarias", titulo: "Pátio de Avarias" },
  { prefixo: "/etiquetagem", titulo: "Etiquetagem" },
  { prefixo: "/estoque", titulo: "Gestão de Estoque" },
  { prefixo: "/relatorios", titulo: "Relatórios BI" },
  { prefixo: "/tecnicos", titulo: "Equipe Técnica" },
  { prefixo: "/auditoria", titulo: "Auditoria & Logs" },
  { prefixo: "/configuracoes", titulo: "Configurações" },
  { prefixo: "/perfil", titulo: "Minha Conta" },
];

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const user = useUsuarioLogado();
  const [isOpen, setIsOpen] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const podeVerSolicitacoes = temCargo(user, CARGOS_GESTAO);

  // Fecha o dropdown se clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Contador de solicitações de pausa publicado pela Central de Solicitações
  useEffect(() => {
    const onTotal = (e: Event) => setPendentes((e as CustomEvent<number>).detail || 0);
    window.addEventListener(EVENTO_TOTAL_SOLICITACOES, onTotal);
    return () => window.removeEventListener(EVENTO_TOTAL_SOLICITACOES, onTotal);
  }, []);

  const handleLogout = async () => {
    setIsOpen(false);
    await efetuarLogout();
    router.push('/login');
  };

  const titulo = TITULOS.find(t => pathname?.startsWith(t.prefixo))?.titulo || 'SGM System';

  return (
    <header className="h-20 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-40 print:hidden">

      {/* Lado Esquerdo: Título e Menu Mobile */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick} aria-label="Abrir menu">
            <Menu className="w-6 h-6" />
        </Button>
        <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">
                {titulo}
            </h2>
            <p className="text-xs text-slate-500 hidden sm:block">
                Shineray Gestão de Montagem
            </p>
        </div>
      </div>

      {/* Lado Direito: Ações e Perfil */}
      <div className="flex items-center gap-4">

        {/* Notificações: solicitações de pausa aguardando decisão */}
        {podeVerSolicitacoes && (
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:text-slate-600 relative"
            onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_SOLICITACOES))}
            title={pendentes > 0 ? `${pendentes} solicitação(ões) de pausa pendente(s)` : "Nenhuma solicitação pendente"}
            aria-label="Solicitações de pausa"
          >
              <Bell className="w-5 h-5" />
              {pendentes > 0 && (
                <span className="absolute top-1 right-1 min-w-4 h-4 px-1 bg-red-600 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse">
                  {pendentes}
                </span>
              )}
          </Button>
        )}

        <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-2 hidden sm:block"></div>

        {/* Dropdown de Usuário */}
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-900 p-2 rounded-xl transition-colors outline-none"
            >
                <div className="text-right hidden md:block">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200 leading-none">
                        {user?.nome || 'Usuário'}
                    </p>
                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-1">
                        {user ? ROTULO_CARGO[user.cargo] || user.cargo : 'Visitante'}
                    </p>
                </div>
                <Avatar className="h-10 w-10 border-2 border-slate-100 dark:border-slate-800 shadow-sm">
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user?.nome || 'U')}`} />
                    <AvatarFallback>{(user?.nome || 'U').substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* O Menu Flutuante */}
            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                        <p className="font-bold text-slate-900 dark:text-white">Conta Conectada</p>
                        <p className="text-xs text-slate-500 truncate">{user?.email || user?.matricula}</p>
                    </div>

                    <div className="p-2 space-y-1">
                        <Link
                            href="/perfil"
                            onClick={() => setIsOpen(false)}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                        >
                            <Settings className="w-4 h-4" />
                            Configurações de Perfil
                        </Link>
                        {temCargo(user, CARGOS_ADMIN) && (
                          <Link
                              href="/configuracoes"
                              onClick={() => setIsOpen(false)}
                              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                          >
                              <SlidersHorizontal className="w-4 h-4" />
                              Configurações do Sistema
                          </Link>
                        )}
                    </div>

                    <div className="p-2 border-t border-slate-100 dark:border-slate-800">
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            Sair do Sistema
                        </button>
                    </div>
                </div>
            )}
        </div>

      </div>
    </header>
  );
}
