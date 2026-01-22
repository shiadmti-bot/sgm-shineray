import Link from "next/link";
import { Box, Home, LogOut, ScanBarcode, Settings, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* SIDEBAR (Apenas Desktop) */}
      <aside className="hidden md:flex w-64 flex-col bg-zinc-950 text-white border-r border-zinc-800">
        <div className="p-6 flex items-center gap-2 font-bold text-lg border-b border-zinc-800">
          <Wrench className="text-primary h-6 w-6" />
          <span>SGM Shineray</span>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-lg transition-colors">
            <Home className="h-5 w-5" />
            Visão Geral
          </Link>
          <Link href="/scanner" className="flex items-center gap-3 px-4 py-3 bg-primary/10 text-primary font-medium rounded-lg transition-colors">
            <ScanBarcode className="h-5 w-5" />
            Entrada de Caixas
          </Link>
          <Link href="/montagem" className="flex items-center gap-3 px-4 py-3 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-lg transition-colors">
            <Wrench className="h-5 w-5" />
            Linha de Montagem
          </Link>
          <Link href="/estoque" className="flex items-center gap-3 px-4 py-3 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-lg transition-colors">
            <Box className="h-5 w-5" />
            Estoque
          </Link>
        </nav>

        <div className="p-4 border-t border-zinc-800">
          <Button variant="ghost" className="w-full justify-start text-zinc-400 hover:text-red-400 hover:bg-red-950/30">
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      {/* ÁREA DE CONTEÚDO */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header Mobile */}
        <header className="md:hidden h-16 bg-white border-b flex items-center justify-between px-4 sticky top-0 z-50">
           <div className="font-bold flex items-center gap-2">
              <Wrench className="text-primary h-5 w-5" />
              <span className="text-slate-900">Flux Mobile</span>
           </div>
           <Button size="icon" variant="ghost">
             <Settings className="h-5 w-5 text-slate-500" />
           </Button>
        </header>

        {/* Onde as páginas vão renderizar */}
        <div className="flex-1 overflow-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}