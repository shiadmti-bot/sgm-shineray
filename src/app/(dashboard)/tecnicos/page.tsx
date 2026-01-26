"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { registrarLog } from "@/lib/logger";
import { 
  Search, Plus, Edit, Wrench, Shield, Crown, Briefcase, Hash, CreditCard, Archive, RotateCcw
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Tipos
type Tecnico = {
  id: string;
  nome: string;
  cargo: 'master' | 'gestor' | 'inspetor' | 'mecanico';
  data_contratacao: string;
  email: string;
  matricula?: string;
  pin?: string;
  ativo: boolean; 
  total_montagens: number;
  tempo_medio: number;
  status_atual: 'disponivel' | 'em_montagem' | 'offline' | 'arquivado';
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
  
  // Form States
  const [formNome, setFormNome] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formCargo, setFormCargo] = useState("mecanico");
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

    let query = supabase.from('funcionarios').select('*').order('nome');

    if (filtroStatus === 'arquivados') {
        query = query.eq('ativo', false);
    } else {
        query = query.eq('ativo', true);
    }

    const { data: funcs } = await query;
      
    if (!funcs) {
        setLoading(false);
        return;
    }

    const { data: producao } = await supabase
      .from('motos')
      .select('montador_id, tempo_montagem, status');

    const listaProcessada = funcs.map((f: any) => {
      const minhasMotos = producao?.filter((m: any) => m.montador_id === f.id) || [];
      const motosFinalizadas = minhasMotos.filter((m: any) => m.tempo_montagem > 0);
      const trabalhando = minhasMotos.some((m: any) => m.status === 'em_andamento');
      
      const tempoTotal = motosFinalizadas.reduce((acc, curr) => acc + curr.tempo_montagem, 0);
      const media = motosFinalizadas.length > 0 ? Math.round(tempoTotal / motosFinalizadas.length) : 0;

      return {
        ...f,
        total_montagens: motosFinalizadas.length,
        tempo_medio: media,
        status_atual: f.ativo ? (trabalhando ? 'em_montagem' : 'disponivel') : 'arquivado'
      };
    });

    setTecnicos(listaProcessada);
    setLoading(false);
  }

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormNome("");
    setFormEmail("");
    setFormCargo("mecanico");
    setFormMatricula(""); 
    setFormPin("");
    setFormSenha("");
    setModalOpen(true);
  };

  const handleOpenEdit = (tec: Tecnico) => {
    if (currentUserRole !== 'master' && tec.cargo === 'master') {
        toast.error("Apenas Master pode editar este perfil.");
        return;
    }
    setEditingId(tec.id);
    setFormNome(tec.nome || "");
    setFormEmail(tec.email || "");
    setFormCargo(tec.cargo);
    setFormMatricula(tec.matricula || ""); 
    setFormPin(tec.pin || ""); 
    setFormSenha(""); 
    setModalOpen(true);
  };

  const handleSalvar = async () => {
    if (!formNome || !formEmail) {
        toast.warning("Nome e Email são obrigatórios.");
        return;
    }

    const payload: any = { 
        nome: formNome, 
        email: formEmail, 
        cargo: formCargo,
        ativo: true 
    };

    if (formCargo === 'mecanico') {
        if (!formMatricula) {
            toast.warning("Mecânicos precisam de Matrícula.");
            return;
        }
        payload.matricula = formMatricula; 
        if (formPin) payload.pin = formPin; 
        else if (!editingId) payload.pin = "1234";
    } else {
        if (formSenha) payload.senha = formSenha;
        else if (!editingId) payload.senha = "shineray123";
    }

    try {
        let error;
        if (editingId) {
            const res = await supabase.from('funcionarios').update(payload).eq('id', editingId);
            error = res.error;
            if (!error) await registrarLog("EDICAO", payload.nome, { id: editingId, cargo: payload.cargo });
        } else {
            payload.data_contratacao = new Date().toISOString();
            const res = await supabase.from('funcionarios').insert(payload);
            error = res.error;
            if (!error) await registrarLog("CADASTRO", payload.nome, { cargo: payload.cargo });
        }

        if (error) throw error;
        toast.success(editingId ? "Atualizado!" : "Cadastrado!");
        setModalOpen(false);
        fetchData();
    } catch (err: any) {
        console.error(err);
        if (err.code === '23505') toast.error("E-mail ou Matrícula já existem.");
        else toast.error("Erro ao salvar.");
    }
  };

  const handleArquivar = async (id: string, nomeTecnico: string) => { 
    if(!confirm(`Deseja arquivar ${nomeTecnico}?`)) return;
    const { error } = await supabase.from('funcionarios').update({ ativo: false }).eq('id', id);
    if (error) toast.error("Erro ao arquivar.");
    else {
        await registrarLog("ARQUIVAMENTO", nomeTecnico, { id });
        toast.success("Funcionário arquivado.");
        fetchData();
    }
  };

  const handleRestaurar = async (id: string, nomeTecnico: string) => {
    if(!confirm(`Deseja restaurar o acesso de ${nomeTecnico}?`)) return;
    const { error } = await supabase.from('funcionarios').update({ ativo: true }).eq('id', id);
    if (error) toast.error("Erro ao restaurar.");
    else {
        await registrarLog("RESTAURACAO", nomeTecnico, { id });
        toast.success("Funcionário restaurado com sucesso!");
        setFiltroStatus("ativos");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("ID copiado!");
  };

  const listaFiltrada = tecnicos.filter(t => {
    const matchBusca = t.nome.toLowerCase().includes(busca.toLowerCase());
    const matchFuncao = filtroFuncao === 'todos' ? true : t.cargo === filtroFuncao;
    return matchBusca && matchFuncao;
  });

  const getCargoInfo = (cargo: string) => {
    switch(cargo) {
        case 'master': return { label: 'MASTER', color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 border-purple-200 dark:border-purple-500/50', icon: Crown };
        case 'gestor': return { label: 'SUPERVISOR', color: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 border-orange-200 dark:border-orange-500/50', icon: Briefcase };
        case 'inspetor': return { label: 'INSPETOR', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border-blue-200 dark:border-blue-500/50', icon: Shield };
        default: return { label: 'MONTADOR', color: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 border-green-200 dark:border-green-500/50', icon: Wrench };
    }
  };

  return (
    <RoleGuard allowedRoles={['master', 'gestor']}>
      <div className="space-y-8 animate-in fade-in duration-500 pb-10">
        
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-1">Gestão de Técnicos</h1>
            <p className="text-slate-500 dark:text-slate-400">Cadastro e monitoramento de produtividade.</p>
          </div>
          
          <Dialog open={modalOpen} onOpenChange={setModalOpen}>
            <Button onClick={handleOpenCreate} className="h-12 bg-red-600 hover:bg-red-700 text-white font-bold px-6 shadow-lg shadow-red-900/20 transition-all hover:scale-105">
                <Plus className="w-5 h-5 mr-2" /> Novo Técnico
            </Button>
            
            <DialogContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{editingId ? "Editar Funcionário" : "Novo Cadastro"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Nome Completo</label>
                        <Input 
                            value={formNome || ""} 
                            onChange={e => setFormNome(e.target.value)} 
                            className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800" 
                            placeholder="Ex: João Silva" 
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-500 dark:text-slate-400">E-mail</label>
                        <Input 
                            value={formEmail || ""} 
                            onChange={e => setFormEmail(e.target.value)} 
                            className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800" 
                            placeholder="joao@shineray.com" 
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Função</label>
                        <Select value={formCargo} onValueChange={setFormCargo}>
                            <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                <SelectItem value="mecanico">Montador</SelectItem>
                                <SelectItem value="inspetor">Inspetor de Qualidade</SelectItem>
                                {currentUserRole === 'master' && (
                                    <>
                                        <SelectItem value="gestor">Supervisor</SelectItem>
                                        <SelectItem value="master">Master Admin</SelectItem>
                                    </>
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    {formCargo === 'mecanico' ? (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Matrícula</label>
                                <Input 
                                    value={formMatricula || ""} 
                                    onChange={e => setFormMatricula(e.target.value)} 
                                    className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 font-mono text-amber-600 dark:text-amber-500 font-bold" 
                                    placeholder="Ex: 1001" 
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-500 dark:text-slate-400">PIN</label>
                                <Input 
                                    value={formPin || ""} 
                                    onChange={e => setFormPin(e.target.value)} 
                                    maxLength={4} 
                                    className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 font-mono" 
                                    placeholder={editingId ? "Manter" : "1234"} 
                                />
                            </div>
                        </div>
                    ) : (
                         <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-500 dark:text-slate-400">Senha</label>
                            <Input 
                                type="password" 
                                value={formSenha || ""} 
                                onChange={e => setFormSenha(e.target.value)} 
                                className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800" 
                                placeholder={editingId ? "Manter atual" : "******"} 
                            />
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setModalOpen(false)} className="border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">Cancelar</Button>
                    <Button onClick={handleSalvar} className="bg-red-600 hover:bg-red-700 text-white">{editingId ? "Salvar" : "Cadastrar"}</Button>
                </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filtros */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-4 shadow-sm transition-colors">
           <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input 
                placeholder="Buscar técnico..." 
                className="pl-10 h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:border-red-500"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
           </div>
           
           <Select value={filtroFuncao} onValueChange={setFiltroFuncao}>
              <SelectTrigger className="w-[180px] h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                  <SelectValue placeholder="Todas funções" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                 <SelectItem value="todos">Todas funções</SelectItem>
                 <SelectItem value="mecanico">Montadores</SelectItem>
                 <SelectItem value="gestor">Supervisores</SelectItem>
              </SelectContent>
           </Select>

           <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-[200px] h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                 <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                 <SelectItem value="ativos">✅ Ativos</SelectItem>
                 <SelectItem value="arquivados">📦 Arquivados</SelectItem>
              </SelectContent>
           </Select>
        </div>

        {/* Grid de Cards */}
        {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1,2,3].map(i => <Skeleton key={i} className="h-64 w-full rounded-2xl bg-slate-200 dark:bg-slate-800" />)}
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {listaFiltrada.length === 0 ? (
                    <div className="col-span-full text-center py-20 text-slate-500">
                        Nenhum funcionário encontrado neste filtro.
                    </div>
                ) : (
                    listaFiltrada.map((tec) => {
                        const infoCargo = getCargoInfo(tec.cargo);
                        const CargoIcon = infoCargo.icon;
                        
                        return (
                            <Card key={tec.id} className={`bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 relative overflow-hidden group transition-all shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-slate-700 ${!tec.ativo ? 'opacity-75 grayscale hover:grayscale-0' : ''}`}>
                                
                                <div className="absolute top-4 left-4 z-10">
                                    <Button 
                                        variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                        onClick={() => copyToClipboard(tec.id)}
                                        title="Copiar ID"
                                    >
                                        <Hash className="w-3 h-3" />
                                    </Button>
                                </div>

                                <div className="absolute top-4 right-4 flex items-center gap-2">
                                    {tec.ativo ? (
                                        tec.status_atual === 'em_montagem' ? (
                                            <>
                                                <span className="text-xs font-bold text-green-600 dark:text-green-500 animate-pulse">TRABALHANDO</span>
                                                <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
                                            </>
                                        ) : (
                                            <span className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-700" title="Disponível"></span>
                                        )
                                    ) : (
                                        <Badge variant="destructive" className="text-[10px] h-5">ARQUIVADO</Badge>
                                    )}
                                </div>

                                <CardContent className="p-6 flex flex-col items-center text-center">
                                    <Avatar className="w-24 h-24 border-4 border-slate-100 dark:border-slate-800 mb-4 shadow-lg">
                                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${tec.nome}`} />
                                        <AvatarFallback>{tec.nome.substring(0,2)}</AvatarFallback>
                                    </Avatar>
                                    
                                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{tec.nome}</h3>
                                    
                                    <Badge variant="outline" className={`mb-4 ${infoCargo.color}`}>
                                        <CargoIcon className="w-3 h-3 mr-1" /> {infoCargo.label}
                                    </Badge>

                                    {tec.cargo === 'mecanico' && (
                                        <div className="mb-4 bg-slate-50 dark:bg-slate-950 px-3 py-1 rounded border border-slate-200 dark:border-slate-800 flex items-center gap-2">
                                            <CreditCard className="w-3 h-3 text-amber-500" />
                                            <span className="text-xs text-slate-500 uppercase font-bold">Matrícula:</span>
                                            <span className="text-sm font-mono text-slate-900 dark:text-white font-bold">{tec.matricula || "N/A"}</span>
                                        </div>
                                    )}

                                    <div className="w-full grid grid-cols-2 gap-4 text-left bg-slate-50 dark:bg-slate-950/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800/50 transition-colors">
                                        <div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase">Montagens</p>
                                            <p className="text-lg font-bold text-slate-900 dark:text-white">{tec.total_montagens}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase">Tempo Médio</p>
                                            <p className="text-lg font-bold text-slate-900 dark:text-white">{tec.tempo_medio} <span className="text-xs font-normal text-slate-400">min</span></p>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 w-full mt-6">
                                        <Button 
                                          variant="outline" 
                                          className="flex-1 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                                          onClick={() => handleOpenEdit(tec)}
                                          disabled={currentUserRole !== 'master' && tec.cargo === 'master'}
                                        >
                                            <Edit className="w-4 h-4 mr-2" /> Editar
                                        </Button>
                                        
                                        {tec.ativo ? (
                                            <Button 
                                              variant="destructive" 
                                              className="w-12 px-0 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/50 border border-slate-200 dark:border-slate-700 text-red-500 dark:text-red-500"
                                              onClick={() => handleArquivar(tec.id, tec.nome)}
                                              disabled={currentUserRole !== 'master' && tec.cargo === 'master'}
                                              title="Arquivar Funcionário"
                                            >
                                                <Archive className="w-4 h-4" />
                                            </Button>
                                        ) : (
                                            <Button 
                                              className="w-12 px-0 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 border border-green-200 dark:border-green-900 text-green-600 dark:text-green-500"
                                              onClick={() => handleRestaurar(tec.id, tec.nome)}
                                              title="Restaurar Acesso"
                                            >
                                                <RotateCcw className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>
        )}
      </div>
    </RoleGuard>
  );
}