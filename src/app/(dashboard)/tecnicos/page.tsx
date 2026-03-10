"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { registrarLog } from "@/lib/logger";
import { 
  Search, Plus, Edit, Wrench, Shield, Crown, Briefcase, Archive, RotateCcw, Timer, Trophy, User,
  Medal, Zap, ShieldCheck, Flame
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Tipos
type Tecnico = {
  id: string;
  nome: string;
  cargo: 'master' | 'gestor' | 'supervisor' | 'montador';
  email: string;
  matricula?: string;
  senha?: string;
  ativo: boolean; 
  total_montagens: number;
  total_retrabalhos: number;
  tempo_medio: number;
  status_atual: 'livre' | 'em_producao' | 'arquivado';
  score?: number;
  badges?: string[];
};

export default function TecnicosPage() {
  const [loading, setLoading] = useState(true);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  
  // Filtros
  const [busca, setBusca] = useState("");
  const [filtroFuncao, setFiltroFuncao] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("ativos");

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false); // Novo estado para loading do botão
  
  // Form States
  const [formNome, setFormNome] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formCargo, setFormCargo] = useState("montador");
  const [formMatricula, setFormMatricula] = useState(""); 
  const [formPin, setFormPin] = useState(""); 
  const [formSenha, setFormSenha] = useState(""); 

  useEffect(() => {
    fetchData();
  }, [filtroStatus]);

  async function fetchData() {
    setLoading(true);
    const sessaoStr = localStorage.getItem('sgm_user');
    const sessao = sessaoStr ? JSON.parse(sessaoStr) : null;
    setCurrentUserRole(sessao?.cargo || 'gestor');

    try {
        let query = supabase.from('funcionarios').select('*').order('nome');
        if (filtroStatus === 'arquivados') query = query.eq('ativo', false);
        else query = query.eq('ativo', true);

        const { data: funcs, error: errFuncs } = await query;
        if (errFuncs) throw errFuncs;
        if (!funcs) { setLoading(false); return; }

        const { data: producao } = await supabase
          .from('motos')
          .select('montador_id, status, rework_count, inicio_montagem, fim_montagem')
          .neq('status', 'aguardando_montagem');

        const listaProcessada = funcs.map((f: any) => {
          const minhasMotos = producao?.filter((m: any) => m.montador_id === f.id) || [];
          const total = minhasMotos.length;
          const retrabalhos = minhasMotos.reduce((acc: number, curr: any) => acc + (curr.rework_count || 0), 0);

          const finalizadas = minhasMotos.filter((m: any) => m.inicio_montagem && m.fim_montagem);
          let somaMinutos = 0;
          let countValidos = 0;
          
          finalizadas.forEach((m: any) => {
              const inicio = new Date(m.inicio_montagem).getTime();
              const fim = new Date(m.fim_montagem).getTime();
              const diff = (fim - inicio) / 1000 / 60; 
              if (diff > 0 && diff < 480) { 
                  somaMinutos += diff;
                  countValidos++;
              }
          });

          const media = countValidos > 0 ? Math.round(somaMinutos / countValidos) : 0;
          const trabalhando = minhasMotos.some((m: any) => m.status === 'em_producao');

          // Gamification: Cálculo Dinâmico de Score
          let score = (total * 10) - (retrabalhos * 25);
          if (total > 0 && media > 0 && media < 100) score += 15; // Bônus de eficiência

          // Gamification: Badges
          const badges = [];
          if (total >= 5 && retrabalhos === 0) badges.push('qualidade');
          if (total >= 50) badges.push('volume');
          if (media > 0 && media < 90) badges.push('velocidade');
          if (trabalhando) badges.push('onfire');

          return {
            ...f,
            total_montagens: total,
            total_retrabalhos: retrabalhos,
            tempo_medio: media,
            status_atual: f.ativo ? (trabalhando ? 'em_producao' : 'livre') : 'arquivado',
            score: Math.max(0, score),
            badges
          };
        });

        const ordenada = listaProcessada.sort((a,b) => (b.score || 0) - (a.score || 0));
        setTecnicos(ordenada);
    } catch (error) {
        console.error("Erro ao carregar técnicos:", error);
        toast.error("Falha ao carregar dados da equipe.");
    } finally {
        setLoading(false);
    }
  }

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormNome(""); setFormEmail(""); setFormCargo("montador");
    setFormMatricula(""); setFormPin(""); setFormSenha("");
    setModalOpen(true);
  };

  const handleOpenEdit = (tec: Tecnico) => {
    setEditingId(tec.id);
    setFormNome(tec.nome || ""); 
    setFormEmail(tec.email || ""); 
    setFormCargo(tec.cargo || "montador");
    setFormMatricula(tec.matricula || ""); 
    
    if (tec.cargo === 'montador') setFormPin(tec.senha || "");
    else setFormSenha(""); 
    
    setModalOpen(true);
  };

  const handleSalvar = async () => {
    if (!formNome) return toast.warning("Nome obrigatório.");
    if (!formEmail) return toast.warning("Email obrigatório.");
    
    setSaving(true); // Trava o botão para evitar clique duplo

    const senhaFinal = formCargo === 'montador' 
        ? (formPin || (editingId ? undefined : "1234")) 
        : (formSenha || (editingId ? undefined : "shineray123"));

    // Payload para a tabela 'funcionarios'
    const payload: any = { 
        nome: formNome, 
        email: formEmail, 
        cargo: formCargo,
        ativo: true,
        matricula: formCargo === 'montador' ? formMatricula : null,
        senha: senhaFinal
    };

    try {
        if (editingId) {
            // EDICAO
            const { error } = await supabase.from('funcionarios').update(payload).eq('id', editingId);
            if(error) throw error;
            await registrarLog("EDICAO", payload.nome, { id: editingId });
            toast.success("Perfil atualizado!");
        } else {
            // CRIAÇÃO (Novo Usuário)
            // IMPORTANTE: Tenta criar no Auth primeiro (se falhar pq já existe, prossegue só pro banco)
            // Nota: Em produção real, isso deveria ser feito no backend (Edge Function) para segurança total.
            // Aqui fazemos um "mock" seguro: inserimos no banco. O login real depende do Auth.
            // Se você apagou os usuários do Auth manualmente, eles não conseguirão logar até recriar lá.
            // Para simplificar e resolver o "clique sem ação", vamos focar na tabela funcionarios primeiro.
            
            payload.data_contratacao = new Date().toISOString();
            
            // Tenta inserir na tabela funcionarios
            const { error, data } = await supabase.from('funcionarios').insert(payload).select().single();
            
            if (error) {
                 console.error("Erro Supabase:", error);
                 throw new Error(error.message);
            }
            
            await registrarLog("CADASTRO", payload.nome, { cargo: payload.cargo });
            toast.success("Colaborador cadastrado!");
        }
        
        setModalOpen(false);
        fetchData();
    } catch (err: any) {
        console.error("Erro completo:", err);
        toast.error(`Erro: ${err.message || "Falha ao salvar"}`);
    } finally {
        setSaving(false);
    }
  };

  // ... (Resto das funções handleArquivar, handleRestaurar, getCargoInfo iguais ao original)
  const handleArquivar = async (id: string, nome: string) => { 
    if(!confirm(`Arquivar ${nome}?`)) return;
    await supabase.from('funcionarios').update({ ativo: false }).eq('id', id);
    toast.success("Arquivado."); 
    fetchData();
  };

  const handleRestaurar = async (id: string) => {
    await supabase.from('funcionarios').update({ ativo: true }).eq('id', id);
    toast.success("Restaurado."); 
    setFiltroStatus("ativos");
  };

  const listaFiltrada = tecnicos.filter(t => {
    const matchBusca = t.nome.toLowerCase().includes(busca.toLowerCase());
    const matchFuncao = filtroFuncao === 'todos' ? true : t.cargo === filtroFuncao;
    return matchBusca && matchFuncao;
  });

  const getCargoInfo = (cargo: string) => {
    switch(cargo) {
        case 'master': return { label: 'MASTER', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: Crown };
        case 'gestor': return { label: 'GESTOR', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Briefcase };
        case 'supervisor': return { label: 'SUPERVISOR', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: Shield };
        default: return { label: 'MONTADOR', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400', icon: Wrench };
    }
  };

  return (
    <RoleGuard allowedRoles={['master', 'gestor']}>
      <div className="space-y-8 animate-in fade-in duration-500 pb-20">
        
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
               Gestão de Equipe
            </h1>
            <p className="text-slate-500">Controle de acesso e monitoramento de KPIs.</p>
          </div>
          <Button onClick={handleOpenCreate} className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-600/20">
              <Plus className="w-5 h-5 mr-2" /> Novo Colaborador
          </Button>
        </div>

        {/* Filtros */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-4 shadow-sm">
           <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input 
                placeholder="Buscar por nome..." 
                className="pl-10 h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
           </div>
           
           <Select value={filtroFuncao} onValueChange={setFiltroFuncao}>
              <SelectTrigger className="w-[180px] h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                  <SelectValue placeholder="Todas funções" />
              </SelectTrigger>
              <SelectContent>
                 <SelectItem value="todos">Todos</SelectItem>
                 <SelectItem value="montador">Montadores</SelectItem>
                 <SelectItem value="supervisor">Supervisores</SelectItem>
                 <SelectItem value="gestor">Gestores</SelectItem>
              </SelectContent>
           </Select>

           <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-[160px] h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                 <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                 <SelectItem value="ativos">✅ Ativos</SelectItem>
                 <SelectItem value="arquivados">📦 Arquivados</SelectItem>
              </SelectContent>
           </Select>
        </div>

        {/* TABS DE GAMIFICAÇÃO VS GESTÃO */}
        <Tabs defaultValue="placar" className="w-full">
            <TabsList className="bg-slate-100 dark:bg-slate-900 w-full justify-start h-auto p-1 mb-6 flex-wrap gap-2">
                <TabsTrigger value="placar" className="flex items-center gap-2 px-6"><Trophy className="w-4 h-4"/> Placar de Líderes</TabsTrigger>
                <TabsTrigger value="gestao" className="flex items-center gap-2 px-6"><Briefcase className="w-4 h-4"/> Gestão Administrativa</TabsTrigger>
            </TabsList>

            <TabsContent value="placar" className="space-y-8 mt-0">
                {/* PÓDIO TOP 3 */}
                {!loading && listaFiltrada.length >= 3 && (
                    <div className="bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 shadow-inner flex flex-col md:flex-row items-end justify-center gap-4 md:gap-8 min-h-[300px]">
                        {/* 2º LUGAR */}
                        <div className="flex flex-col items-center animate-in slide-in-from-bottom duration-700 delay-100 p-4 w-full md:w-1/4">
                            <div className="relative mb-4">
                                <Avatar className="w-20 h-20 border-4 border-slate-300 shadow-md">
                                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${listaFiltrada[1].nome}&backgroundColor=94a3b8`} />
                                    <AvatarFallback>#2</AvatarFallback>
                                </Avatar>
                                <div className="absolute -bottom-3 -right-3 bg-slate-200 text-slate-700 p-2 rounded-full border-2 border-white shadow-sm font-black w-8 h-8 flex items-center justify-center">2</div>
                            </div>
                            <h4 className="font-bold text-lg text-slate-700 dark:text-slate-300 text-center">{listaFiltrada[1].nome}</h4>
                            <Badge className="mt-2 bg-slate-200 text-slate-800 hover:bg-slate-300">{listaFiltrada[1].score} pts</Badge>
                            <div className="w-full h-24 bg-gradient-to-t from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-800/50 mt-4 rounded-t-lg border-t-4 border-slate-300 flex items-center justify-center">
                                <Medal className="w-8 h-8 text-slate-400 opacity-50"/>
                            </div>
                        </div>

                        {/* 1º LUGAR */}
                        <div className="flex flex-col items-center animate-in slide-in-from-bottom duration-700 p-4 w-full md:w-1/3 z-10">
                            <Crown className="w-10 h-10 text-yellow-500 mb-2 fill-yellow-500 animate-bounce" />
                            <div className="relative mb-4">
                                <Avatar className="w-28 h-28 border-4 border-yellow-400 shadow-xl shadow-yellow-500/20">
                                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${listaFiltrada[0].nome}&backgroundColor=eab308`} />
                                    <AvatarFallback>#1</AvatarFallback>
                                </Avatar>
                                <div className="absolute -bottom-3 -right-3 bg-yellow-400 text-yellow-900 p-2 rounded-full border-2 border-white shadow-sm font-black w-10 h-10 flex items-center justify-center text-lg">1</div>
                            </div>
                            <h4 className="font-black text-xl text-yellow-600 dark:text-yellow-500 text-center">{listaFiltrada[0].nome}</h4>
                            <Badge className="mt-2 text-sm bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400 hover:bg-yellow-200 px-4 py-1 border border-yellow-300">{listaFiltrada[0].score} pts</Badge>
                            <div className="w-full h-32 bg-gradient-to-t from-yellow-100 to-yellow-50 dark:from-yellow-900/30 dark:to-yellow-900/10 mt-4 rounded-t-lg border-t-4 border-yellow-400 flex items-center justify-center">
                                <Trophy className="w-12 h-12 text-yellow-500 opacity-80"/>
                            </div>
                        </div>

                        {/* 3º LUGAR */}
                        <div className="flex flex-col items-center animate-in slide-in-from-bottom duration-700 delay-200 p-4 w-full md:w-1/4">
                            <div className="relative mb-4">
                                <Avatar className="w-16 h-16 border-4 border-amber-600 shadow-md">
                                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${listaFiltrada[2].nome}&backgroundColor=d97706`} />
                                    <AvatarFallback>#3</AvatarFallback>
                                </Avatar>
                                <div className="absolute -bottom-3 -right-3 bg-amber-600 text-white p-2 rounded-full border-2 border-white shadow-sm font-black w-8 h-8 flex items-center justify-center text-sm">3</div>
                            </div>
                            <h4 className="font-bold text-md text-slate-700 dark:text-slate-300 text-center">{listaFiltrada[2].nome}</h4>
                            <Badge className="mt-2 bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-500 border border-amber-200">{listaFiltrada[2].score} pts</Badge>
                            <div className="w-full h-16 bg-gradient-to-t from-amber-100 to-amber-50 dark:from-amber-900/20 dark:to-amber-900/5 mt-4 rounded-t-lg border-t-4 border-amber-600 flex items-center justify-center">
                                <Medal className="w-6 h-6 text-amber-600 opacity-40"/>
                            </div>
                        </div>
                    </div>
                )}

                {/* Grid de Cards Gamificado */}
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1,2,3].map(i => <Skeleton key={i} className="h-80 w-full rounded-2xl" />)}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {listaFiltrada.map((tec, index) => {
                            const info = getCargoInfo(tec.cargo);
                            const Icon = info.icon;
                            
                            return (
                                <Card key={tec.id} className={`group relative hover:border-indigo-400 transition-all ${!tec.ativo && 'opacity-60 grayscale'}`}>
                                    {tec.status_atual === 'em_producao' && (
                                        <div className="absolute top-4 left-4 z-10">
                                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 animate-pulse border-0">
                                                EM PRODUÇÃO
                                            </Badge>
                                        </div>
                                    )}

                                    {/* Score display top right */}
                                    <div className="absolute top-4 right-4 z-10 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-bold px-3 py-1 rounded-full text-sm border border-indigo-100 dark:border-indigo-800">
                                        {tec.score} pts
                                    </div>
                                    
                                    <CardContent className="p-6 pt-12 flex flex-col items-center text-center">
                                        <div className="relative">
                                            <Avatar className={`w-24 h-24 border-4 ${index === 0 ? 'border-yellow-400' : index === 1 ? 'border-slate-300' : index === 2 ? 'border-amber-600' : 'border-slate-100 dark:border-slate-800'} mb-4 shadow-lg`}>
                                                <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${tec.nome}`} />
                                                <AvatarFallback><User className="w-8 h-8 text-slate-400"/></AvatarFallback>
                                            </Avatar>
                                            {index < 3 && (
                                                <div className={`absolute -bottom-2 -right-2 w-8 h-8 rounded-full border-2 border-white flex items-center justify-center font-black text-sm text-white ${index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-slate-400' : 'bg-amber-600'}`}>
                                                    {index + 1}
                                                </div>
                                            )}
                                        </div>
                                        
                                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{tec.nome}</h3>
                                        
                                        <div className="flex items-center gap-2 mb-4">
                                            <Badge variant="outline" className={`px-2 py-1 border-0 ${info.color}`}>
                                                <Icon className="w-3 h-3 mr-1" /> {info.label}
                                            </Badge>
                                        </div>

                                        {/* Display Badges */}
                                        <div className="flex flex-wrap items-center justify-center gap-2 mb-6 min-h-[30px]">
                                            {tec.badges?.map(b => (
                                                <span key={b} title={b === 'qualidade' ? 'Qualidade Pura (0 Retrabalhos)' : b === 'velocidade' ? 'Rápido & Furioso (< 90m média)' : b === 'volume' ? 'Máquina de Produção (>50 motos)' : 'On Fire (Em produção agora)'}>
                                                    {b === 'qualidade' && <ShieldCheck className="w-5 h-5 text-indigo-500 drop-shadow-sm" />}
                                                    {b === 'velocidade' && <Zap className="w-5 h-5 text-yellow-500 drop-shadow-sm" />}
                                                    {b === 'volume' && <Trophy className="w-5 h-5 text-purple-500 drop-shadow-sm" />}
                                                    {b === 'onfire' && <Flame className="w-5 h-5 text-orange-500 animate-pulse drop-shadow-sm" />}
                                                </span>
                                            ))}
                                            {(!tec.badges || tec.badges.length === 0) && <span className="text-xs text-slate-400">Iniciante</span>}
                                        </div>

                                        <div className="w-full grid grid-cols-3 gap-2 text-center bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800/50">
                                            <div>
                                                <p className="text-xl font-black text-slate-900 dark:text-white">{tec.total_montagens}</p>
                                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">Total</p>
                                            </div>
                                            <div className="border-x border-slate-200 dark:border-slate-800">
                                                <p className="text-xl font-black text-slate-900 dark:text-white">{tec.tempo_medio}</p>
                                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">Min/Moto</p>
                                            </div>
                                            <div>
                                                <p className="text-xl font-black text-red-500">{tec.total_retrabalhos}</p>
                                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">Erros</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </TabsContent>

            <TabsContent value="gestao" className="mt-0">
                {/* Gestão List */}
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1,2,3].map(i => <Skeleton key={i} className="h-60 w-full rounded-2xl" />)}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {listaFiltrada.map((tec) => {
                            const info = getCargoInfo(tec.cargo);
                            const Icon = info.icon;
                            
                            return (
                                <Card key={tec.id} className={`group relative hover:border-blue-400 transition-all ${!tec.ativo && 'opacity-60 grayscale'}`}>
                                    <CardContent className="p-6">
                                        <div className="flex items-start gap-4 mb-6">
                                            <Avatar className="w-16 h-16 border-2 border-slate-100 dark:border-slate-800">
                                                <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${tec.nome}`} />
                                                <AvatarFallback><User className="w-6 h-6 text-slate-400"/></AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{tec.nome}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <Badge variant="outline" className={`px-2 py-0 border-0 ${info.color} text-xs`}>
                                                        <Icon className="w-3 h-3 mr-1" /> {info.label}
                                                    </Badge>
                                                    {tec.cargo === 'montador' && (
                                                        <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0 rounded font-bold">
                                                            {tec.matricula}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-400 mt-2">{tec.email}</p>
                                            </div>
                                        </div>

                                        <div className="flex gap-3 w-full">
                                            <Button variant="outline" className="flex-1 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => handleOpenEdit(tec)}>
                                                <Edit className="w-4 h-4 mr-2" /> Editar Acessos
                                            </Button>
                                            {tec.ativo ? (
                                                <Button variant="ghost" size="icon" title="Arquivar Usuário" className="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => handleArquivar(tec.id, tec.nome)}>
                                                    <Archive className="w-5 h-5" />
                                                </Button>
                                            ) : (
                                                <Button variant="ghost" size="icon" title="Restaurar Usuário" className="text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20" onClick={() => handleRestaurar(tec.id)}>
                                                    <RotateCcw className="w-5 h-5" />
                                                </Button>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </TabsContent>
        </Tabs>

        {/* MODAL */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
            <DialogContent className="bg-white dark:bg-slate-950 sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{editingId ? "Editar Perfil" : "Novo Colaborador"}</DialogTitle>
                    <DialogDescription>
                        Preencha os dados de acesso e função.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-bold">Nome Completo</label>
                            <Input value={formNome} onChange={e => setFormNome(e.target.value)} placeholder="João Silva" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold">Cargo</label>
                            <Select value={formCargo} onValueChange={(val: any) => setFormCargo(val)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="montador">Montador</SelectItem>
                                    <SelectItem value="supervisor">Supervisor</SelectItem>
                                    <SelectItem value="gestor">Gestor</SelectItem>
                                    {currentUserRole === 'master' && <SelectItem value="master">Master</SelectItem>}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-bold">E-mail (Login Corporativo)</label>
                        <Input value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="joao@shineray.com" />
                    </div>

                    {formCargo === 'montador' ? (
                        <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                            <div className="space-y-2">
                                <label className="text-sm font-bold">Matrícula</label>
                                <Input value={formMatricula} onChange={e => setFormMatricula(e.target.value)} placeholder="1001" className="font-mono" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold">PIN (Senha)</label>
                                <Input value={formPin} onChange={e => setFormPin(e.target.value)} maxLength={4} placeholder="1234" className="font-mono" />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2 bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                            <label className="text-sm font-bold">Senha de Acesso</label>
                            <Input type="password" value={formSenha} onChange={e => setFormSenha(e.target.value)} placeholder={editingId ? "Manter atual" : "******"} />
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
                    <Button onClick={handleSalvar} className="bg-blue-600 hover:bg-blue-700 text-white" disabled={saving}>
                        {saving ? "Salvando..." : "Salvar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

      </div>
    </RoleGuard>
  );
}