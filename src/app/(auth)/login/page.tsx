"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner"; 
import { Loader2, Wrench, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);

    // Simulação de login
    setTimeout(() => {
      setIsLoading(false);
      toast.success("Acesso Autorizado", {
        description: "Bem-vindo ao SGM by Sabel",
        style: { borderColor: "var(--primary)" } // Borda vermelha no toast
      });
      // Aqui redirecionaremos para /dashboard ou /scanner futuramente
    }, 2000);
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Lado Esquerdo - Marca e Visual (Fundo Escuro) */}
      <div className="hidden lg:flex flex-col justify-between bg-zinc-950 p-10 text-white relative overflow-hidden border-r border-zinc-800">
        {/* Efeito de fundo */}
        <div className="absolute top-0 left-0 w-full h-2 bg-primary shadow-[0_0_40px_rgba(220,38,38,0.6)]" />
        
        <div className="relative z-10 flex items-center gap-2 text-lg font-medium opacity-80">
          <Wrench className="h-5 w-5 text-primary" />
          SGM V1.0
        </div>

        <div className="relative z-10 space-y-6 max-w-lg">
          {/* Logo Grande no Desktop */}
            <div className="w-64 h-32 relative mb-4"> 
             {/* Invertemos as cores da logo para ficar branca no fundo preto */}
             <Image 
               src="/logo.png" 
               alt="SGM Logo" 
               fill 
               className="object-contain object-left"
               priority
             />
          </div>
          <h1 className="text-4xl font-bold tracking-tight leading-tight">
            Gestão inteligente para <br/>
            <span className="text-primary">alta performance</span>.
          </h1>
          <p className="text-zinc-400 text-lg leading-relaxed">
            Acompanhe a montagem, controle a qualidade e gerencie o estoque da Shineray em tempo real.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-4 text-sm text-zinc-600">
          <span>&copy; 2026 Sabel Group</span>
          <div className="h-1 w-1 rounded-full bg-zinc-700" />
          <span>Tecnologia IT Team</span>
        </div>
      </div>

      {/* Lado Direito - Formulário */}
      <div className="flex items-center justify-center p-6 bg-slate-50/50">
        <div className="w-full max-w-[400px] space-y-6">
          
          {/* Logo Mobile (Aparece só no celular) */}
          <div className="flex flex-col items-center text-center lg:hidden mb-8 space-y-2">
            <div className="w-48 h-24 relative">
               <Image 
                 src="/logo.png" 
                 alt="Logo SGM" 
                 fill 
                 className="object-contain"
               />
            </div>
          </div>

          <Card className="shadow-2xl border-none ring-1 ring-slate-900/5">
            <CardHeader className="space-y-1 pb-2">
              <CardTitle className="text-2xl font-bold tracking-tight">Login</CardTitle>
              <CardDescription>
                Entre com suas credenciais de acesso
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Usuário ou ID</Label>
                  <Input 
                    id="email" 
                    placeholder="Ex: montador.01" 
                    required 
                    className="h-11 bg-slate-50"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                    <Link href="#" className="text-xs font-medium text-primary hover:underline">
                      Esqueceu?
                    </Link>
                  </div>
                  <Input 
                    id="password" 
                    type="password" 
                    required 
                    className="h-11 bg-slate-50"
                  />
                </div>
                <Button className="w-full h-11 font-bold text-md shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all" type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Entrar no Sistema
                      <ArrowRight className="ml-2 w-4 h-4 opacity-80" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
            
            <div className="relative my-2 px-6">
              <div className="absolute inset-0 flex items-center px-6">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-muted-foreground">
                  Acesso Rápido
                </span>
              </div>
            </div>

            <CardFooter className="pt-2">
                <Button variant="outline" className="w-full h-11 border-dashed border-2 hover:bg-slate-50 hover:border-primary/50 text-slate-600">
                    <Wrench className="mr-2 h-4 w-4" />
                    Sou da Manutenção
                </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}