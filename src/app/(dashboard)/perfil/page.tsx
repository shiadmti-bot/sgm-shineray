"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { 
  User, Settings, LogOut, Shield, Key, Trophy, Target, AlertTriangle, Moon, Sun, Laptop 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export default function PerfilPage() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // KPIs
  const [stats, setStats] = useState({
      producaoHoje: 0,
      totalMes: 0,
      retrabalhos: 0
  });

  // Modal Senha
  const [modalSenhaOpen, setModalSenhaOpen] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");

  useEffect(() => {
    carregarPerfil();
  }, []);

  async function carregarPerfil() {
    setLoading(true);
    const userStr = localStorage.getItem('sgm_user');
    
    if (!userStr) {
        router.push('/login');
        return;
    }
    
    const userData = JSON.parse(userStr);
    setUser(userData);

    // Carregar Estatísticas (Apenas se for montador ou supervisor)
    if (userData.id) {
        const hoje = new Date().toISOString().split('T')[0];
        const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

        // 1. Produção Hoje
        const { count: countHoje } = await supabase
            .from('motos')
            .select('*', { count: 'exact', head: true })
            .eq(userData.cargo === 'montador' ? 'montador_id' : 'supervisor_id', userData.id)
            .gte('updated_at', hoje);

        // 2. Total Mês
        const { count: countMes } = await supabase
            .from('motos')
            .select('*', { count: 'exact', head: true })
            .eq(userData.cargo === 'montador' ? 'montador_id' : 'supervisor_id', userData.id)
            .gte('updated_at', inicioMes);

       // 3. Retrabalhos (Acumulado Histórico)
        const { data: motosRetrabalho } = await supabase
            .from('motos')
            .select('rework_count')
            .eq('montador_id', userData.id)
            .gt('rework_count', 0); // Pega todas as motos que tiveram pelo menos 1 retrabalho

        const totalRetrabalhos = motosRetrabalho 
            ? motosRetrabalho.reduce((acc, curr) => acc + (curr.rework_count || 0), 0)
            : 0;

        setStats({
            producaoHoje: countHoje || 0,
            totalMes: countMes || 0,
            retrabalhos: totalRetrabalhos // Usa a soma total
        });
    }
    
    setLoading(false);
  }

  const handleLogout = () => {
      localStorage.removeItem('sgm_user');
      router.push('/login');
      toast.info("Sessão encerrada.");
  };

  const handleTrocarSenha = async () => {
      if (!senhaAtual || !novaSenha) return toast.warning("Preencha os campos.");

      // 1. Valida senha antiga
      const { data: validacao } = await supabase
          .from('funcionarios')
          .select('id')
          .eq('id', user.id)
          .eq('senha', senhaAtual)
          .single();

      if (!validacao) return toast.error("A senha atual está incorreta.");

      // 2. Atualiza
      const { error } = await supabase
          .from('funcionarios')
          .update({ senha: novaSenha })
          .eq('id', user.id);

      if (error) {
          toast.error("Erro ao atualizar.");
      } else {
          toast.success("Senha alterada com sucesso!");
          setModalSenhaOpen(false);
          setSenhaAtual("");
          setNovaSenha("");
      }
  };

  if (loading) return <div className="p-8"><Skeleton className="h-40 w-full mb-4" /><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in pb-20">
      
      {/* 1. CARTÃO DE IDENTIDADE */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-center gap-6">
         <Avatar className="w-24 h-24 border-4 border-blue-100 dark:border-blue-900">
            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user?.nome}`} />
            <AvatarFallback>USER</AvatarFallback>
         </Avatar>
         
         <div className="text-center md:text-left flex-1">
             <h1 className="text-2xl font-black text-slate-900 dark:text-white">{user?.nome}</h1>
             <div className="flex items-center justify-center md:justify-start gap-2 mt-1 text-slate-500">
                 <Badge variant="secondary" className="uppercase font-bold tracking-wider bg-slate-100 dark:bg-slate-800">
                    {user?.cargo}
                 </Badge>
                 <span>•</span>
                 <span className="font-mono">ID: {user?.matricula}</span>
             </div>
         </div>

         <Button variant="destructive" onClick={handleLogout} className="w-full md:w-auto">
            <LogOut className="w-4 h-4 mr-2" /> Sair
         </Button>
      </div>

      {/* 2. ESTATÍSTICAS (KPIs) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/50">
              <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-blue-600 dark:text-blue-400 flex items-center gap-2">
                      <Target className="w-4 h-4" /> Produção Hoje
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="text-3xl font-black text-slate-900 dark:text-white">{stats.producaoHoje}</div>
                  <p className="text-xs text-slate-500">Motos finalizadas hoje</p>
              </CardContent>
          </Card>

          <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-900/50">
              <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-purple-600 dark:text-purple-400 flex items-center gap-2">
                      <Trophy className="w-4 h-4" /> Acumulado Mês
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="text-3xl font-black text-slate-900 dark:text-white">{stats.totalMes}</div>
                  <p className="text-xs text-slate-500">Total do mês corrente</p>
              </CardContent>
          </Card>
          
          {user?.cargo === 'montador' && (
              <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900/50">
                  <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-amber-600 dark:text-amber-400 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" /> Índice de Retrabalho
                      </CardTitle>
                  </CardHeader>
                  <CardContent>
                      <div className="text-3xl font-black text-slate-900 dark:text-white">{stats.retrabalhos}</div>
                      <p className="text-xs text-slate-500">Devoluções da Qualidade</p>
                  </CardContent>
              </Card>
          )}
      </div>

      {/* 3. CONFIGURAÇÕES E SEGURANÇA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Aparência */}
          <Card>
              <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5"/> Preferências</CardTitle>
                  <CardDescription>Personalize sua experiência de uso.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                          <Sun className="w-5 h-5 text-orange-500" />
                          <span className="text-sm font-medium">Modo Claro</span>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setTheme("light")}>Ativar</Button>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg bg-slate-950 text-white">
                      <div className="flex items-center gap-3">
                          <Moon className="w-5 h-5 text-blue-300" />
                          <span className="text-sm font-medium">Modo Escuro</span>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => setTheme("dark")}>Ativar</Button>
                  </div>
              </CardContent>
          </Card>

          {/* Segurança */}
          <Card className="border-red-100 dark:border-red-900/30">
              <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-500"><Shield className="w-5 h-5"/> Segurança</CardTitle>
                  <CardDescription>Gerencie suas credenciais de acesso.</CardDescription>
              </CardHeader>
              <CardContent>
                  <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/10 rounded-lg">
                      <div>
                          <p className="font-bold text-slate-900 dark:text-white">PIN / Senha de Acesso</p>
                          <p className="text-xs text-slate-500">Última alteração: Desconhecido</p>
                      </div>
                      <Button variant="outline" onClick={() => setModalSenhaOpen(true)}>
                          <Key className="w-4 h-4 mr-2" /> Alterar
                      </Button>
                  </div>
              </CardContent>
          </Card>
      </div>

      {/* MODAL DE TROCA DE SENHA */}
      <Dialog open={modalSenhaOpen} onOpenChange={setModalSenhaOpen}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>Alterar Credenciais</DialogTitle>
                  <DialogDescription>Digite sua senha atual para confirmar a mudança.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                  <div className="space-y-2">
                      <label className="text-sm font-bold">Senha Atual</label>
                      <Input type="password" value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                      <label className="text-sm font-bold">Nova Senha / PIN</label>
                      <Input type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} />
                  </div>
              </div>
              <DialogFooter>
                  <Button variant="ghost" onClick={() => setModalSenhaOpen(false)}>Cancelar</Button>
                  <Button onClick={handleTrocarSenha}>Salvar Nova Senha</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

    </div>
  );
}