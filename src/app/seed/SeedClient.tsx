"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Database, Trash2, CheckCircle2, User, AlertTriangle } from "lucide-react";

const FRASE_CONFIRMACAO = "APAGAR TUDO";

export default function SeedClient() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [confirmacao, setConfirmacao] = useState("");

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  const limparBanco = async () => {
    addLog("🧹 Iniciando limpeza...");
    
    // 1. Apaga tabelas filhas primeiro (para evitar erro de chave estrangeira)
    const { error: e1 } = await supabase.from('solicitacoes_pausa').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (e1) console.error("Erro limpando solicitacoes:", e1);
    
    const { error: e2 } = await supabase.from('pausas_producao').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (e2) console.error("Erro limpando pausas:", e2);

    // 2. Apaga Motos
    const { error: e3 } = await supabase.from('motos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (e3) console.error("Erro limpando motos:", e3);

    // 3. Apaga Funcionários
    const { error: e4 } = await supabase.from('funcionarios').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (e4) console.error("Erro limpando funcionarios:", e4);

    addLog("✨ Banco de dados limpo!");
  };

  const criarUsuarios = async () => {
    addLog("👥 Criando usuários...");

    const usuarios = [
      {
        nome: "Délcio Farias (TI)",
        matricula: "shiadmti@gmail.com", // Login Master
        senha: "shineray25",
        cargo: "master",
        ativo: true
      },
      {
        nome: "Diretoria",
        matricula: "admin", // Login Gestor
        senha: "admin",
        cargo: "gestor",
        ativo: true
      },
      {
        nome: "Maria Supervisora",
        matricula: "2001",
        senha: "admin",
        cargo: "supervisor",
        ativo: true
      },
      {
        nome: "João Montador",
        matricula: "1001",
        senha: "1234",
        cargo: "montador",
        ativo: true
      },
      {
        nome: "Carlos Silva",
        matricula: "1002",
        senha: "1234",
        cargo: "montador",
        ativo: true
      }
    ];

    for (const u of usuarios) {
      const { error } = await supabase.from('funcionarios').insert(u);
      if (error) {
        addLog(`❌ Erro ao criar ${u.nome}: ${error.message}`);
      } else {
        addLog(`✅ Usuário criado: ${u.nome} (${u.matricula})`);
      }
    }
  };

  const criarMotoTeste = async () => {
    addLog("🏍️ Criando moto de teste...");
    
    const { error } = await supabase.from('motos').insert({
        modelo: "JET 125 SS EFI",
        sku: "CHASSI-TESTE-2026",
        cor: "Vermelha",
        ano: "2026",
        status: "aguardando_montagem",
        localizacao: "Box 1 - Recebimento"
    });

    if (error) addLog(`❌ Erro moto: ${error.message}`);
    else addLog("✅ Moto de teste criada na fila!");
  };

  const rodarScriptCompleto = async () => {
    if (confirmacao !== FRASE_CONFIRMACAO) return toast.warning(`Digite ${FRASE_CONFIRMACAO} para confirmar.`);
    setLoading(true);
    setLogs([]);
    try {
        await limparBanco();
        // Pequeno delay para garantir que o banco processou os deletes
        await new Promise(r => setTimeout(r, 1000));
        await criarUsuarios();
        await criarMotoTeste();
        toast.success("Ambiente resetado com sucesso!");
    } catch (error) {
        console.error(error);
        toast.error("Houve um erro no processo.");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 p-8 flex items-center justify-center">
      <Card className="w-full max-w-2xl shadow-xl">
        <CardHeader>
            <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                    <Database className="w-6 h-6" />
                </div>
                <div>
                    <CardTitle className="text-2xl">Configuração de Ambiente</CardTitle>
                    <CardDescription>Limpeza e população do banco de dados (Sistema Interno)</CardDescription>
                </div>
            </div>
        </CardHeader>
        <CardContent className="space-y-6">
            
            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-sm font-mono max-h-60 overflow-y-auto">
                {logs.length === 0 ? (
                    <span className="text-slate-400">Aguardando comando...</span>
                ) : (
                    logs.map((log, i) => (
                        <div key={i} className="mb-1 border-b border-slate-100 dark:border-slate-800 pb-1 last:border-0 last:pb-0">
                            {log}
                        </div>
                    ))
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                 <div className="col-span-2 p-4 border rounded-xl bg-slate-50 dark:bg-slate-900">
                    <h3 className="font-bold mb-2 flex items-center gap-2"><User className="w-4 h-4"/> Acessos que serão criados:</h3>
                    <ul className="text-sm space-y-2 text-slate-600 dark:text-slate-300">
                        <li className="flex justify-between"><span>TI Master:</span> <strong>shiadmti@gmail.com / shineray25</strong></li>
                        <li className="flex justify-between"><span>Gestor:</span> <strong>admin / admin</strong></li>
                        <li className="flex justify-between"><span>Supervisor:</span> <strong>2001 / admin</strong></li>
                        <li className="flex justify-between"><span>Montador:</span> <strong>1001 / 1234</strong></li>
                    </ul>
                 </div>
            </div>

            <div className="p-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 space-y-3">
                <p className="text-sm font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4"/> Ferramenta de desenvolvimento: apaga motos, pausas e funcionários.
                </p>
                <Input
                    value={confirmacao}
                    onChange={e => setConfirmacao(e.target.value)}
                    placeholder={`Digite ${FRASE_CONFIRMACAO} para liberar`}
                    className="font-mono"
                />
            </div>

            <Button 
                onClick={rodarScriptCompleto} 
                className="w-full h-14 text-lg font-bold bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20"
                disabled={loading || confirmacao !== FRASE_CONFIRMACAO}
            >
                {loading ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processando...</>
                ) : (
                    <><Trash2 className="w-5 h-5 mr-2" /> LIMPAR TUDO E RECRIAR <CheckCircle2 className="w-5 h-5 ml-2" /></>
                )}
            </Button>
            
            <p className="text-xs text-center text-slate-400">
                Atenção: Isso apagará todo o histórico de produção atual.
            </p>
        </CardContent>
      </Card>
    </div>
  );
}