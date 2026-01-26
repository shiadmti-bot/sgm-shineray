"use client";

import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header"; // <--- Usaremos este componente inteligente
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      
      {/* --- DESKTOP SIDEBAR (Fixo na esquerda, escondido no mobile) --- */}
      <aside className="hidden lg:flex flex-col w-72 fixed inset-y-0 z-50 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
         <Sidebar />
      </aside>

      {/* --- CONTEÚDO PRINCIPAL --- */}
      <main className="lg:pl-72 flex flex-col min-h-screen transition-all duration-300">
        
        {/* 1. HEADER INTELIGENTE 
            Passamos a função para abrir o menu mobile quando clicar no hambúrguer do Header 
        */}
        <Header onMenuClick={() => setMobileMenuOpen(true)} />

        {/* 2. MENU MOBILE (SHEET)
            Controlado pelo estado mobileMenuOpen.
            Removemos o SheetTrigger porque o botão agora fica dentro do <Header />
        */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="p-0 w-72 border-r-slate-200 dark:border-r-slate-800 bg-white dark:bg-slate-950">
             <SheetTitle className="sr-only">Menu de Navegação</SheetTitle>
             <SheetDescription className="sr-only">Menu Principal</SheetDescription>
             
             {/* Passamos onClose para fechar o menu ao clicar em um link */}
             <Sidebar onClose={() => setMobileMenuOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* 3. ÁREA DE CONTEÚDO */}
        <div className="flex-1 p-4 md:p-8 overflow-x-hidden">
           <div className="max-w-7xl mx-auto space-y-6">
              {children}
           </div>
        </div>

      </main>
    </div>
  );
}