"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { User, Wrench, ArrowRight, Delete, Loader2, ChevronLeft, Lock, Eye, EyeOff, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState<"selecao" | "gestor" | "mecanico">("selecao");
  const [loading, setLoading] = useState(false);

  // Estados Mecânico
  const [pin, setPin] = useState("");
  const [matricula, setMatricula] = useState("");
  const [stepMecanico, setStepMecanico] = useState<"id" | "senha">("id");

  // Estados Gestor
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  
  // --- NOVOS ESTADOS QoL ---
  const [showPassword, setShowPassword] = useState(false);
  const [lembrar, setLembrar] = useState(false);

  // Carregar e-mail salvo se existir
  useEffect(() => {
    const salvo = localStorage.getItem("sgm_remember_email");
    if (salvo) {
      setEmail(salvo);
      setLembrar(true);
    }
  }, []);

  // --- LÓGICA DE LOGIN MECÂNICO ---
  const loginMecanico = async (pinFinal: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('funcionarios')
      .select('*')
      .eq('matricula', matricula)
      .eq('pin', pinFinal)
      .eq('cargo', 'mecanico')
      .single();

    if (error || !data) {
      toast.error("Credenciais inválidas.");
      setPin("");
      setLoading(false);
      return;
    }

    toast.success(`Turno iniciado: ${data.nome}`);
    localStorage.setItem('sgm_user', JSON.stringify(data));
    router.push("/montagem"); 
  };

  // --- LÓGICA DE LOGIN GESTOR ---
  const loginGestor = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase
      .from('funcionarios')
      .select('*')
      .eq('email', email)
      .eq('senha', senha)
      .single();

    if (error || !data) {
      toast.error("Acesso negado.");
      setLoading(false);
      return;
    }

    // Lógica do "Lembrar de Mim"
    if (lembrar) {
        localStorage.setItem("sgm_remember_email", email);
    } else {
        localStorage.removeItem("sgm_remember_email");
    }

    toast.success(`Bem-vindo, ${data.nome.split(' ')[0]}`);
    localStorage.setItem('sgm_user', JSON.stringify(data));
    router.push("/dashboard"); 
  };

  const handleNumClick = (num: string) => {
    if (stepMecanico === "id") {
      if (matricula.length < 6) setMatricula(p => p + num);
    } else {
      if (pin.length < 4) {
        const novoPin = pin + num;
        setPin(novoPin);
        if (novoPin.length === 4) loginMecanico(novoPin);
      }
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 font-sans selection:bg-red-500/30">
      
      {/* LADO ESQUERDO (AMBIENTAÇÃO) - Mantido igual */}
      <div className={cn(
        "hidden lg:flex w-1/2 relative flex-col items-center justify-center p-16 overflow-hidden transition-all duration-1000 ease-in-out",
        perfil === 'mecanico' ? "bg-slate-900" : perfil === 'gestor' ? "bg-blue-950" : "bg-gradient-to-br from-red-700 to-red-900"
      )}>
        <div className="absolute inset-0 opacity-10 bg-[url('/grid-pattern.svg')] bg-[size:40px_40px] animate-[pulse_10s_infinite]" />
        <motion.div layoutId="logo-hero" className="relative z-10 bg-white/10 backdrop-blur-md border border-white/20 p-12 rounded-3xl shadow-2xl mb-12">
          <Image src="/shineray-logo.png" alt="Shineray" width={280} height={100} className="object-contain drop-shadow-lg" priority />
        </motion.div>
        <AnimatePresence mode="wait">
          <motion.div
            key={perfil}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center z-10 max-w-lg text-white"
          >
            <h1 className="text-5xl font-black mb-4 tracking-tight">
              {perfil === 'selecao' && "SGM SYSTEM"}
              {perfil === 'mecanico' && "WORKBENCH"}
              {perfil === 'gestor' && "COMMAND CENTER"}
            </h1>
            <p className="text-lg opacity-80 font-light leading-relaxed">
              {perfil === 'selecao' && "Sistema integrado de gestão de montagem e qualidade."}
              {perfil === 'mecanico' && "Ambiente otimizado para alta produtividade."}
              {perfil === 'gestor' && "Controle total de KPIs, estoque e gestão."}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* LADO DIREITO */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative bg-white dark:bg-slate-950">
        
        {perfil !== "selecao" && (
           <motion.button 
             initial={{ opacity: 0, x: -20 }}
             animate={{ opacity: 1, x: 0 }}
             onClick={() => { setPerfil("selecao"); setMatricula(""); setPin(""); setStepMecanico("id"); }}
             className="absolute top-8 left-8 sm:left-12 flex items-center gap-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium group"
           >
             <div className="p-2 rounded-full bg-slate-100 dark:bg-slate-900 group-hover:bg-slate-200 dark:group-hover:bg-slate-800 transition-colors">
                <ChevronLeft className="w-5 h-5" /> 
             </div>
             <span>Voltar</span>
           </motion.button>
        )}

        <div className="w-full max-w-md">
            <AnimatePresence mode="wait">
            
            {/* 1. SELEÇÃO - Mantido igual */}
            {perfil === "selecao" && (
                <motion.div
                key="selecao"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="space-y-10"
                >
                <div className="text-center lg:hidden">
                    <Image src="/shineray-logo.png" alt="Logo" width={180} height={60} className="mx-auto mb-6" />
                </div>
                <div className="space-y-2 text-center lg:text-left">
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Bem-vindo</h2>
                    <p className="text-slate-500">Escolha seu perfil de acesso para continuar.</p>
                </div>
                <div className="grid gap-5">
                    <button onClick={() => setPerfil("gestor")} className="group relative flex items-center p-6 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl hover:border-blue-500 dark:hover:border-blue-500 transition-all duration-300 text-left hover:shadow-xl hover:shadow-blue-500/10 active:scale-[0.98]">
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl mr-5 group-hover:scale-110 transition-transform duration-300">
                            <User className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Administrativo</h3>
                            <p className="text-sm text-slate-500">Gestores, Supervisores e Master</p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                    </button>
                    <button onClick={() => setPerfil("mecanico")} className="group relative flex items-center p-6 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl hover:border-orange-500 dark:hover:border-orange-500 transition-all duration-300 text-left hover:shadow-xl hover:shadow-orange-500/10 active:scale-[0.98]">
                        <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-xl mr-5 group-hover:scale-110 transition-transform duration-300">
                            <Wrench className="w-8 h-8 text-orange-600 dark:text-orange-400" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Área Técnica</h3>
                            <p className="text-sm text-slate-500">Montadores e Inspetores</p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-orange-500 group-hover:translate-x-1 transition-all" />
                    </button>
                </div>
                </motion.div>
            )}

            {/* 2. LOGIN GESTOR ATUALIZADO (Olho + Lembrar) */}
            {perfil === "gestor" && (
                <motion.div
                key="gestor"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                className="w-full"
                >
                <div className="mb-8">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-4 text-blue-600">
                        <Lock className="w-6 h-6" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Acesso Corporativo</h2>
                    <p className="text-slate-500">Entre com suas credenciais de rede.</p>
                </div>

                <form onSubmit={loginGestor} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">E-mail</label>
                        <Input 
                            type="email" 
                            placeholder="seu.nome@shineray.com" 
                            value={email} 
                            onChange={e => setEmail(e.target.value)}
                            className="h-12 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 transition-all"
                        />
                    </div>
                    
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Senha</label>
                        <div className="relative">
                            <Input 
                                type={showPassword ? "text" : "password"} 
                                placeholder="••••••••" 
                                value={senha} 
                                onChange={e => setSenha(e.target.value)}
                                className="h-12 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 transition-all pr-12"
                            />
                            {/* BOTÃO OLHO */}
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1"
                            >
                                {showPassword ? <EyeOff className="w-5 h-5"/> : <Eye className="w-5 h-5"/>}
                            </button>
                        </div>
                    </div>

                    {/* TOGGLE LEMBRAR DE MIM */}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setLembrar(!lembrar)}
                            className={cn(
                                "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                                lembrar 
                                    ? "bg-blue-600 border-blue-600 text-white" 
                                    : "bg-transparent border-slate-300 dark:border-slate-700"
                            )}
                        >
                            {lembrar && <Check className="w-3.5 h-3.5" />}
                        </button>
                        <label 
                            onClick={() => setLembrar(!lembrar)}
                            className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none"
                        >
                            Lembrar de mim
                        </label>
                    </div>

                    <Button 
                    type="submit" 
                    className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-lg font-bold shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02]" 
                    disabled={loading}
                    >
                    {loading ? <Loader2 className="animate-spin" /> : "Acessar Painel"}
                    </Button>
                </form>
                </motion.div>
            )}

            {/* 3. LOGIN MECÂNICO - Mantido igual */}
            {perfil === "mecanico" && (
                <motion.div key="mecanico" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="w-full max-w-xs mx-auto">
                    {/* ... Teclado numérico mantido igual (código anterior) ... */}
                    {/* Para brevidade, mantive a lógica do teclado aqui, copie do código anterior se necessário */}
                    <div className="text-center mb-8">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                        {stepMecanico === "id" ? "Identificação" : "Senha de Acesso"}
                        </h2>
                        <p className="text-slate-500 text-sm mt-1">
                        {stepMecanico === "id" ? "Digite sua matrícula" : "Digite seu PIN de 4 dígitos"}
                        </p>
                    </div>
                    {/* Display */}
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl mb-8 shadow-inner relative overflow-hidden group">
                        <div className="flex justify-center items-center h-12">
                            <span className="text-4xl font-mono font-bold tracking-[0.5em] text-white z-10">
                                {stepMecanico === "id" 
                                ? (matricula || <span className="opacity-20">0000</span>)
                                : pin.split("").map(() => "•").join("") || <span className="opacity-20 text-2xl tracking-normal">_ _ _ _</span>
                                }
                            </span>
                        </div>
                    </div>
                    {/* Teclado */}
                    <div className="grid grid-cols-3 gap-3 mb-8">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                        <button key={num} onClick={() => handleNumClick(num.toString())} disabled={loading} className="h-16 rounded-xl bg-slate-50 dark:bg-slate-800 border-b-4 border-slate-200 dark:border-slate-700 active:border-b-0 active:translate-y-1 active:bg-slate-100 transition-all text-2xl font-bold text-slate-700 dark:text-slate-200 hover:bg-white hover:shadow-md">{num}</button>
                        ))}
                        <div />
                        <button onClick={() => handleNumClick("0")} disabled={loading} className="h-16 rounded-xl bg-slate-50 dark:bg-slate-800 border-b-4 border-slate-200 dark:border-slate-700 active:border-b-0 active:translate-y-1 transition-all text-2xl font-bold text-slate-700 dark:text-slate-200 hover:bg-white hover:shadow-md">0</button>
                        <button onClick={() => stepMecanico === "id" ? setMatricula(p => p.slice(0, -1)) : setPin(p => p.slice(0, -1))} disabled={loading} className="h-16 rounded-xl bg-red-50 dark:bg-red-900/20 border-b-4 border-red-100 dark:border-red-900/40 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30"><Delete className="w-6 h-6" /></button>
                    </div>
                    {stepMecanico === "id" && (
                        <Button onClick={() => matricula.length >= 3 ? setStepMecanico("senha") : toast.warning("Digite a matrícula")} className="w-full h-14 text-lg font-bold bg-orange-600 hover:bg-orange-700 shadow-lg shadow-orange-600/20 transition-all" disabled={!matricula}>CONTINUAR <ArrowRight className="ml-2 w-5 h-5" /></Button>
                    )}
                </motion.div>
            )}

            </AnimatePresence>
        </div>
      </div>
    </div>
  );
}