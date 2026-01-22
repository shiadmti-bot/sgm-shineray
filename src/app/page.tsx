import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Box, Wrench } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
            <Wrench className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">Flux by Sabel</CardTitle>
          <CardDescription>Sistema de Gestão de Montagem Shineray</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Link href="/scanner" className="block">
              <div className="border rounded-lg p-4 hover:bg-slate-100 transition-colors cursor-pointer text-center space-y-2">
                <Box className="w-6 h-6 mx-auto text-slate-600" />
                <span className="text-sm font-medium block">Produção</span>
              </div>
            </Link>
            <div className="border rounded-lg p-4 hover:bg-slate-100 transition-colors cursor-pointer text-center space-y-2 opacity-50">
              <Wrench className="w-6 h-6 mx-auto text-slate-600" />
              <span className="text-sm font-medium block">Manutenção</span>
            </div>
          </div>

          <Button className="w-full group" asChild>
            <Link href="/login">
              Acessar Sistema
              <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}