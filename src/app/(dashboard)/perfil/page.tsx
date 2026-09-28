"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Settings, LogOut, Shield, Key, Trophy, Target, AlertTriangle, Moon, Sun, Laptop, Loader2
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
import { ROTULO_CARGO, getUsuarioLogado, useHidratado, useUsuarioLogado } from "@/lib/auth";
import { efetuarLogout } from "@/lib/logout";
import { registrarLog } from "@/lib/logger";
import { inicioDoDiaISO, inicioDoMesISO } from "@/lib/datas";
import { cn } from "@/lib/utils";

export default function PerfilPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const hidratado = useHidratado();
  const user = useUsuarioLogado();
  const ehMontador = user?.cargo === 'montador';
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
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  useEffect(() => {
    if (hidratado && !user) router.push('/login');
  }, [hidratado, user, router]);

  useEffect(() => {
    const usuario = getUsuarioLogado();
    if (!usuario) return;
    let ativo = true;

    async function carregarEstatisticas(id: string, montador: boolean) {
        const hoje = inicioDoDiaISO();
        const inicioMes = inicioDoMesISO();
        // Montador: montagens FINALIZADAS por ele. Demais cargos: motos inspecionadas por ele.
        const colunaResponsavel = montador ? 'montador_id' : 'supervisor_id';
        const colunaData = montador ? 'fim_montagem' : 'updated_at';

        const [{ count: countHoje }, { count: countMes }, { data: motosRetrabalho }] = await Promise.all([
            supabase.from('motos').select('*', { count: 'exact', head: true }).eq(colunaResponsavel, id).gte(colunaData, hoje),
            supabase.from('motos').select('*', { count: 'exact', head: true }).eq(colunaResponsavel, id).gte(colunaData, inicioMes),
            // Retrabalhos (Acumulado Histórico)
            supabase.from('motos').select('rework_count').eq('montador_id', id).gt('rework_count', 0),
        ]);

        const totalRetrabalhos = motosRetrabalho
            ? motosRetrabalho.reduce((acc: number, curr: { rework_count: number | null }) => acc + (curr.rework_count || 0), 0)
            : 0;

        if (!ativo) return;
        setStats({
            producaoHoje: countHoje || 0,
            totalMes: countMes || 0,
            retrabalhos: totalRetrabalhos
        });
        setLoading(false);
    }

    carregarEstatisticas(usuario.id, usuario.cargo === 'montador');
    return () => { ativo = false; };
  }, []);

  const handleLogout = async () => {
      await efetuarLogout();
      toast.info("Sessão encerrada.");
      router.push('/login');
  };

  const abrirTrocaSenha = () => {
      setSenhaAtual(""); setNovaSenha(""); setConfirmarSenha("");
      setModalSenhaOpen(true);
  };

  const handleTrocarSenha = async () => {
      if (!user) return;
      if (!senhaAtual || !novaSenha) return toast.warning("Preencha os campos.");
      // O login do montador aceita exatamente 4 números; senhas curtas deixam contas vulneráveis.
      if (ehMontador && !/^\d{4}$/.test(novaSenha)) return toast.warning("O PIN deve ter exatamente 4 números.");
      if (!ehMontador && novaSenha.length < 6) return toast.warning("A nova senha deve ter pelo menos 6 caracteres.");
      if (novaSenha !== confirmarSenha) return toast.warning("A confirmação não confere com a nova senha.");
      if (novaSenha === senhaAtual) return toast.warning("A nova senha deve ser diferente da atual.");

      setSalvandoSenha(true);
      try {
        // 1. Valida senha antiga
        const { data: validacao } = await supabase
            .from('funcionarios')
            .select('id')
            .eq('id', user.id)
            .eq('senha', senhaAtual)
            .maybeSingle();

        if (!validacao) {
            toast.error("A senha atual está incorreta.");
            return;
        }

        // 2. Atualiza
        const { error } = await supabase
            .from('funcionarios')
            .update({ senha: novaSenha })
            .eq('id', user.id);

        if (error) {
            toast.error("Erro ao atualizar.");
        } else {
            await registrarLog('SENHA_ALTERADA', user.nome, { id: user.id });
            toast.success(ehMontador ? "PIN alterado com sucesso!" : "Senha alterada com sucesso!");
            setModalSenhaOpen(false);
        }
      } finally {
        setSalvandoSenha(false);
      }
  };

  if (!hidratado || !user || loading) return <div className="p-8"><Skeleton className="h-40 w-full mb-4" /><Skeleton className="h-64 w-full" /></div>;

  const temas = [
      { valor: 'light', rotulo: 'Claro', icone: Sun },
      { valor: 'dark', rotulo: 'Escuro', icone: Moon },
      { valor: 'system', rotulo: 'Automático', icone: Laptop },
  ];

  return (
    <div className="space-y-6 animate-in fade-in pb-20">

      {/* 1. CARTÃO DE IDENTIDADE */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-center gap-6">
         <Avatar className="w-24 h-24 border-4 border-blue-100 dark:border-blue-900">
            <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.nome)}`} />
            <AvatarFallback>{user.nome.substring(0, 2).toUpperCase()}</AvatarFallback>
         </Avatar>

         <div className="text-center md:text-left flex-1">
             <h1 className="text-2xl font-black text-slate-900 dark:text-white">{user.nome}</h1>
             <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-1 text-slate-500">
                 <Badge variant="secondary" className="uppercase font-bold tracking-wider bg-slate-100 dark:bg-slate-800">
                    {ROTULO_CARGO[user.cargo] || user.cargo}
                 </Badge>
                 <span>•</span>
                 <span className="font-mono">{user.matricula ? `Matrícula: ${user.matricula}` : user.email}</span>
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
                      <Target className="w-4 h-4" /> {ehMontador ? 'Produção Hoje' : 'Inspeções Hoje'}
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="text-3xl font-black text-slate-900 dark:text-white">{stats.producaoHoje}</div>
                  <p className="text-xs text-slate-500">{ehMontador ? 'Montagens finalizadas hoje' : 'Motos em que você registrou decisão hoje'}</p>
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

          {ehMontador && (
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
              <CardContent className="grid grid-cols-3 gap-3">
                  {temas.map(({ valor, rotulo, icone: Icone }) => (
                      <button
                        key={valor}
                        type="button"
                        onClick={() => setTheme(valor)}
                        className={cn(
                          "flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-sm font-medium transition-colors",
                          theme === valor ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300" : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                        )}
                      >
                        <Icone className="w-5 h-5" /> {rotulo}
                      </button>
                  ))}
              </CardContent>
          </Card>

          {/* Segurança */}
          <Card className="border-red-100 dark:border-red-900/30">
              <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-500"><Shield className="w-5 h-5"/> Segurança</CardTitle>
                  <CardDescription>Gerencie suas credenciais de acesso.</CardDescription>
              </CardHeader>
              <CardContent>
                  <div className="flex items-center justify-between gap-4 p-4 bg-red-50 dark:bg-red-900/10 rounded-lg">
                      <div>
                          <p className="font-bold text-slate-900 dark:text-white">{ehMontador ? 'PIN de Acesso' : 'Senha de Acesso'}</p>
                          <p className="text-xs text-slate-500">{ehMontador ? '4 números, usado no login da linha.' : 'Mínimo de 6 caracteres.'}</p>
                      </div>
                      <Button variant="outline" onClick={abrirTrocaSenha}>
                          <Key className="w-4 h-4 mr-2" /> Alterar
                      </Button>
                  </div>
              </CardContent>
          </Card>
      </div>

      {/* MODAL DE TROCA DE SENHA */}
      <Dialog open={modalSenhaOpen} onOpenChange={(o) => !salvandoSenha && setModalSenhaOpen(o)}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>{ehMontador ? 'Alterar PIN' : 'Alterar Senha'}</DialogTitle>
                  <DialogDescription>Digite sua credencial atual para confirmar a mudança.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                  <div className="space-y-2">
                      <label className="text-sm font-bold">{ehMontador ? 'PIN atual' : 'Senha atual'}</label>
                      <Input type="password" value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} inputMode={ehMontador ? "numeric" : undefined} autoComplete="current-password" />
                  </div>
                  <div className="space-y-2">
                      <label className="text-sm font-bold">{ehMontador ? 'Novo PIN (4 números)' : 'Nova senha (mín. 6 caracteres)'}</label>
                      <Input type="password" value={novaSenha} onChange={e => setNovaSenha(ehMontador ? e.target.value.replace(/\D/g, '').slice(0, 4) : e.target.value)} inputMode={ehMontador ? "numeric" : undefined} autoComplete="new-password" />
                  </div>
                  <div className="space-y-2">
                      <label className="text-sm font-bold">Confirmar</label>
                      <Input type="password" value={confirmarSenha} onChange={e => setConfirmarSenha(ehMontador ? e.target.value.replace(/\D/g, '').slice(0, 4) : e.target.value)} inputMode={ehMontador ? "numeric" : undefined} autoComplete="new-password" />
                  </div>
              </div>
              <DialogFooter>
                  <Button variant="ghost" onClick={() => setModalSenhaOpen(false)} disabled={salvandoSenha}>Cancelar</Button>
                  <Button onClick={handleTrocarSenha} disabled={salvandoSenha}>
                    {salvandoSenha && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Salvar
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

    </div>
  );
}
