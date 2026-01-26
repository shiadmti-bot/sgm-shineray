"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { registrarLog } from "@/lib/logger";
import { User, Key, Lock, Save, ShieldCheck, CreditCard, Hash } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";

export default function PerfilPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Estados do Formulário de Segurança
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmar, setConfirmar] = useState("");

  useEffect(() => {
    carregarPerfil();
  }, []);

  async function carregarPerfil() {
    const userStr = localStorage.getItem('sgm_user');
    if (userStr) {
       const localUser = JSON.parse(userStr);
       // Busca dados frescos do banco
       const { data } = await supabase
         .from('funcionarios')
         .select('*')
         .eq('id', localUser.id)
         .single();
       
       if (data) setUser(data);
    }
  }

  const handleTrocaSenha = async () => {
    if (!nova || !confirmar || !atual) {
        toast.warning("Preencha todos os campos.");
        return;
    }

    if (nova !== confirmar) {
        toast.error("A nova senha/PIN não confere com a confirmação.");
        return;
    }

    if (nova.length < 4) {
        toast.error("A nova senha/PIN deve ter no mínimo 4 caracteres.");
        return;
    }

    setLoading(true);

    // 1. Verificar se a senha ATUAL está correta no banco
    const campoSenha = user.cargo === 'mecanico' ? 'pin' : 'senha';
    
    const { data: verify, error: verifyErr } = await supabase
        .from('funcionarios')
        .select('id')
        .eq('id', user.id)
        .eq(campoSenha, atual) // Verifica se bate com o banco
        .single();

    if (verifyErr || !verify) {
        toast.error(`Sua ${user.cargo === 'mecanico' ? 'PIN' : 'Senha'} atual está incorreta.`);
        setLoading(false);
        return;
    }

    // 2. Atualizar para a NOVA senha
    const { error: updateErr } = await supabase
        .from('funcionarios')
        .update({ [campoSenha]: nova })
        .eq('id', user.id);

    if (updateErr) {
        toast.error("Erro ao atualizar.");
    } else {
        toast.success("Credenciais atualizadas com sucesso!");
        
        // Log de Segurança
        await registrarLog("SEGURANCA", user.nome, { 
            acao: "TROCA_CREDENCIAL", 
            tipo: user.cargo === 'mecanico' ? 'PIN' : 'SENHA' 
        });

        // Limpa campos
        setAtual(""); setNova(""); setConfirmar("");
        
        // Atualiza sessão local se necessário (opcional)
        const novoUser = { ...user, [campoSenha]: nova };
        localStorage.setItem('sgm_user', JSON.stringify(novoUser));
        setUser(novoUser);
    }
    setLoading(false);
  };

  if (!user) return <div className="p-8">Carregando perfil...</div>;

  const isMecanico = user.cargo === 'mecanico';

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto pb-10">
      
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white">Meu Perfil</h1>
        <p className="text-slate-500">Gerencie suas informações pessoais e segurança.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* COLUNA ESQUERDA: CARTÃO DE IDENTIDADE */}
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-md h-fit">
            <CardHeader className="flex flex-col items-center text-center pb-2">
                <Avatar className="w-32 h-32 border-4 border-slate-100 dark:border-slate-800 shadow-xl mb-4">
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user.nome}`} />
                    <AvatarFallback>{user.nome.substring(0,2)}</AvatarFallback>
                </Avatar>
                <CardTitle className="text-xl font-bold">{user.nome}</CardTitle>
                <Badge variant="secondary" className="mt-2 uppercase tracking-widest text-[10px]">
                    {user.cargo}
                </Badge>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
                <Separator />
                <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-slate-500 flex items-center gap-2">
                           <User className="w-4 h-4"/> ID Sistema
                        </span>
                        <span className="font-mono text-xs text-slate-400">{user.id.slice(0,8)}...</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-slate-500 flex items-center gap-2">
                           {isMecanico ? <Hash className="w-4 h-4"/> : <User className="w-4 h-4"/>}
                           {isMecanico ? "Matrícula" : "Login"}
                        </span>
                        <span className="font-bold">{isMecanico ? user.matricula : user.email}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-slate-500 flex items-center gap-2">
                           <ShieldCheck className="w-4 h-4"/> Status
                        </span>
                        <span className="text-green-600 font-bold flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span> Ativo
                        </span>
                    </div>
                </div>
            </CardContent>
        </Card>

        {/* COLUNA DIREITA: SEGURANÇA */}
        <div className="md:col-span-2 space-y-6">
            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Lock className="w-5 h-5 text-blue-600" />
                        Alterar {isMecanico ? "PIN de Acesso" : "Senha"}
                    </CardTitle>
                    <CardDescription>
                        Mantenha sua conta segura. {isMecanico ? "Seu PIN deve ter 4 dígitos numéricos." : "Use uma senha forte."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {isMecanico ? "PIN Atual" : "Senha Atual"}
                        </label>
                        <div className="relative">
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input 
                                type={isMecanico ? "text" : "password"}
                                maxLength={isMecanico ? 4 : undefined}
                                className="pl-10"
                                placeholder={isMecanico ? "0000" : "******"}
                                value={atual}
                                onChange={e => setAtual(e.target.value)}
                            />
                        </div>
                    </div>

                    <Separator className="my-2"/>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                Nova {isMecanico ? "PIN" : "Senha"}
                            </label>
                            <Input 
                                type={isMecanico ? "text" : "password"}
                                maxLength={isMecanico ? 4 : undefined}
                                placeholder={isMecanico ? "Novo PIN" : "Nova Senha"}
                                value={nova}
                                onChange={e => setNova(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                Confirmar
                            </label>
                            <Input 
                                type={isMecanico ? "text" : "password"}
                                maxLength={isMecanico ? 4 : undefined}
                                placeholder="Digite novamente"
                                value={confirmar}
                                onChange={e => setConfirmar(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <Button 
                            onClick={handleTrocaSenha} 
                            disabled={loading}
                            className="bg-blue-600 hover:bg-blue-700 text-white min-w-[150px]"
                        >
                            {loading ? "Salvando..." : (
                                <><Save className="w-4 h-4 mr-2" /> Atualizar Credencial</>
                            )}
                        </Button>
                    </div>

                </CardContent>
            </Card>

            {/* Banner de Ajuda */}
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900 flex gap-4 items-start">
                <ShieldCheck className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0 mt-1" />
                <div>
                    <h4 className="font-bold text-blue-900 dark:text-blue-300">Dica de Segurança</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                        Nunca compartilhe seu {isMecanico ? "PIN" : "login"} com outros funcionários. 
                        Todas as ações realizadas com seu usuário ficam registradas no sistema de auditoria.
                    </p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}