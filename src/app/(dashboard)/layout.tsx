"use client";

import { useState, useSyncExternalStore } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { GuardaSessao } from "@/components/layout/GuardaSessao";
import { BuscaRapida } from "@/components/layout/BuscaRapida";
import { CentralSolicitacoes } from "@/components/layout/CentralSolicitacoes";
import { AvisoOffline } from "@/components/layout/AvisoOffline";
import { NovidadesV2 } from "@/components/layout/NovidadesV2";

const CHAVE_COMPACTO = "sgm_menu_compacto";
const EVENTO_COMPACTO = "sgm:menu-compacto";

function lerCompacto() {
  try {
    return localStorage.getItem(CHAVE_COMPACTO) === "1";
  } catch {
    return false;
  }
}

function assinarCompacto(f: () => void) {
  window.addEventListener(EVENTO_COMPACTO, f);
  return () => window.removeEventListener(EVENTO_COMPACTO, f);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [menuMovel, setMenuMovel] = useState(false);
  const compacto = useSyncExternalStore(assinarCompacto, lerCompacto, () => false);

  const alternarCompacto = () => {
    try {
      localStorage.setItem(CHAVE_COMPACTO, compacto ? "0" : "1");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(EVENTO_COMPACTO));
  };

  return (
    <div className="min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 hidden border-r border-sidebar-border transition-[width] duration-200 lg:block print:hidden",
          compacto ? "w-[72px]" : "w-64",
        )}
      >
        <Sidebar compacto={compacto} />
      </aside>

      <Sheet open={menuMovel} onOpenChange={setMenuMovel}>
        <SheetContent
          side="left"
          className="w-72 border-r border-sidebar-border bg-sidebar p-0 sm:max-w-72 [&>button]:text-white [&>button]:opacity-80"
          aria-describedby={undefined}
        >
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <SheetDescription className="sr-only">Telas do sistema</SheetDescription>
          <Sidebar aoNavegar={() => setMenuMovel(false)} />
        </SheetContent>
      </Sheet>

      <div className={cn("flex min-h-screen flex-col transition-[padding] duration-200 print:pl-0", compacto ? "lg:pl-[72px]" : "lg:pl-64")}>
        <Header aoAbrirMenu={() => setMenuMovel(true)} compacto={compacto} aoAlternarCompacto={alternarCompacto} />
        <AvisoOffline />
        <main className="fundo-tecnico flex-1 overflow-x-hidden p-4 md:p-6 lg:p-8 print:bg-none">
          <div className="mx-auto max-w-7xl space-y-6">
            <GuardaSessao>{children}</GuardaSessao>
          </div>
        </main>
      </div>

      <GuardaSessaoAuxiliares />
    </div>
  );
}

/** Componentes globais que só fazem sentido com alguém logado. */
function GuardaSessaoAuxiliares() {
  return (
    <>
      <BuscaRapida />
      <CentralSolicitacoes />
      <NovidadesV2 />
    </>
  );
}
