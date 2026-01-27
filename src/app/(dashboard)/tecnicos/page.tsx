"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { RoleGuard } from "@/components/RoleGuard";
import { registrarLog } from "@/lib/logger";
import { 
  Search, Plus, Edit, Wrench, Shield, Crown, Briefcase, Hash, CreditCard, Archive, RotateCcw, AlertTriangle, Timer, Trophy
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

// Tipos V2.0
type Tecnico = {
  id: string;
  nome: string;
  cargo: 'master' | 'gestor' | 'supervisor' | 'montador';
  email: string;
  matricula?: string;
  pin?: string;
  ativo: boolean; 
  // KPIs Calculados
  total_montagens: number;
  total_retrabalhos: number;
  tempo_medio: number;
  status_atual: 'livre' | 'em_producao' | 'arquivado';
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

    // 1. Busca Funcionários
    let query = supabase.from('funcionarios').select('*').order('nome');
    if (filtroStatus === 'arquivados') query = query.eq('ativo', false);
    else query = query.eq('ativo', true);

    const { data: funcs } = await query;
    if (!funcs) { setLoading(false); return; }

    // 2. Busca KPIs de Produção (Motos)
    const { data: producao } = await supabase
      .from('motos')
      .select('montador_id, tempo_montagem, status, observacoes');

    // 3. Processamento dos Dados
    const listaProcessada = funcs.map((f: any) => {
      const minhasMotos = producao?.filter((m: any) => m.montador_id === f.id) || [];
      
      // Contagens
      const total = minhasMotos.length;
      const retrabalhos = minhasMotos.filter((m: any) => 
          m.status === 'retrabalho_montagem' || 
          (m.observacoes && m.observacoes.includes('RETRABALHO'))
      ).length;

      // Tempo Médio (apenas finalizadas com tempo > 0)
      const finalizadas = minhasMotos.filter((m: any) => m.tempo_montagem > 0);
      const tempoTotal = finalizadas.reduce((acc: number, curr: any) => acc + curr.tempo_montagem, 0);
      const media = finalizadas.length > 0 ? Math.round(tempoTotal / finalizadas.length) : 0;

      // Status Atual (Está trabalhando agora?)
      const trabalhando = minhasMotos.some((m: any) => m.status === 'em_producao');

      return {
        ...f,
        total_montagens: total,
        total_retrabalhos: retrabalhos,
        tempo_medio: media,
        status_atual: f.ativo ? (trabalhando ? 'em_producao' : 'livre') : 'arquivado'
      };
    });

    setTecnicos(listaProcessada);
    setLoading(false);
  }

  // --- Lógica do Modal (CRUD) ---
  const handleOpenCreate = () => {
    setEditingId(null);
    setFormNome(""); setFormEmail(""); setFormCargo("montador");
    setFormMatricula(""); setFormPin(""); setFormSenha("");
    setModalOpen(true);
  };

  const handleOpenEdit = (tec: Tecnico) => {
    if (currentUserRole !== 'master' && tec.cargo === 'master') {
        toast.error("Apenas Master pode editar este perfil.");
        return;
    }
    setEditingId(tec.id);
    setFormNome(tec.nome); setFormEmail(tec.email); setFormCargo(tec.cargo);
    setFormMatricula(tec.matricula || ""); setFormPin(tec.pin || ""); setFormSenha(""); 
    setModalOpen(true);
  };

  const handleSalvar = async () => {
    if (!formNome || !formEmail) return toast.warning("Nome e Email obrigatórios.");

    const payload: any = { 
        nome: formNome, 
        email: formEmail, 
        cargo: formCargo,
        ativo: true 
    };

    // Regra de Negócio V2.0: Montador usa PIN/Matrícula, Outros usam Senha
    if (formCargo === 'montador') {
        if (!formMatricula) return toast.warning("Matrícula obrigatória para Montador.");
        payload.matricula = formMatricula; 
        if (formPin) payload.pin = formPin; 
        else if (!editingId) payload.pin = "1234"; // Default
    } else {
        if (formSenha) payload.senha = formSenha;
        else if (!editingId) payload.senha = "shineray123"; // Default
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

  const handleArquivar = async (id: string, nome: string) => { 
    if(!confirm(`Arquivar ${nome}?`)) return;
    const { error } = await supabase.from('funcionarios').update({ ativo: false }).eq('id', id);
    if (!error) { toast.success("Arquivado."); fetchData(); }
  };

  const handleRestaurar = async (id: string, nome: string) => {
    if(!confirm(`Restaurar ${nome}?`)) return;
    const { error } = await supabase.from('funcionarios').update({ ativo: true }).eq('id', id);
    if (!error) { toast.success("Restaurado."); setFiltroStatus("ativos"); }
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

  // --- HELPERS DE UI V2.0 ---
  const getCargoInfo = (cargo: string) => {
    switch(cargo) {
        case 'master': return { label: 'MASTER ADMIN', color: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 border-purple-200 dark:border-purple-500/50', icon: Crown };
        case 'gestor': return { label: 'GESTOR', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border-blue-200 dark:border-blue-500/50', icon: Briefcase };
        case 'supervisor': return { label: 'SUPERVISOR', color: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 border-orange-200 dark:border-orange-500/50', icon: Shield };
        default: return { label: 'MONTADOR', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700', icon: Wrench };
    }
  };

  return (
    <RoleGuard allowedRoles={['master', 'gestor']}>
      <div className="space-y-8 animate-in fade-in duration-500 pb-20">
        
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-1">Gestão de Equipe</h1>
            <p className="text-slate-500 dark:text-slate-400">Controle de acesso e monitoramento de KPIs individuais.</p>
          </div>
          
          <Button onClick={handleOpenCreate} className="h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 shadow-lg shadow-blue-900/20">
              <Plus className="w-5 h-5 mr-2" /> Novo Colaborador
          </Button>
        </div>

        {/* Filtros */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-4 shadow-sm transition-colors">
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
              <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                 <SelectItem value="todos">Todos</SelectItem>
                 <SelectItem value="montador">Montadores</SelectItem>
                 <SelectItem value="supervisor">Supervisores</SelectItem>
                 <SelectItem value="gestor">Gestores</SelectItem>
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
                {[1,2,3].map(i => <Skeleton key={i} className="h-72 w-full rounded-2xl bg-slate-200 dark:bg-slate-800" />)}
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {listaFiltrada.length === 0 ? (
                    <div className="col-span-full text-center py-20 text-slate-500">
                        Nenhum funcionário encontrado.
                    </div>
                ) : (
                    listaFiltrada.map((tec) => {
                        const infoCargo = getCargoInfo(tec.cargo);
                        const CargoIcon = infoCargo.icon;
                        
                        return (
                            <Card key={tec.id} className={`bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 relative overflow-hidden group transition-all shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-slate-700 ${!tec.ativo ? 'opacity-75 grayscale' : ''}`}>
                                
                                {/* Botão ID */}
                                <div className="absolute top-4 left-4 z-10">
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-slate-900 dark:hover:text-white" onClick={() => copyToClipboard(tec.id)}>
                                        <Hash className="w-3 h-3" />
                                    </Button>
                                </div>

                                {/* Status Badge */}
                                <div className="absolute top-4 right-4 flex items-center gap-2">
                                    {tec.ativo ? (
                                        tec.status_atual === 'em_producao' ? (
                                            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse border-0">
                                                EM PRODUÇÃO
                                            </Badge>
                                        ) : (
                                            <span className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-700" title="Disponível"></span>
                                        )
                                    ) : (
                                        <Badge variant="destructive" className="h-5">ARQUIVADO</Badge>
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

                                    {/* Exibir Matrícula se for Montador */}
                                    {tec.cargo === 'montador' && (
                                        <div className="mb-6 bg-slate-50 dark:bg-slate-950 px-3 py-1 rounded border border-slate-200 dark:border-slate-800 flex items-center gap-2">
                                            <CreditCard className="w-3 h-3 text-slate-400" />
                                            <span className="text-xs text-slate-500 uppercase font-bold">Matrícula:</span>
                                            <span className="text-sm font-mono text-slate-900 dark:text-white font-bold">{tec.matricula}</span>
                                        </div>
                                    )}

                                    {/* KPIS (Stats) */}
                                    <div className="w-full grid grid-cols-3 gap-2 text-center bg-slate-50 dark:bg-slate-950/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800/50 mb-4">
                                        <div>
                                            <div className="flex justify-center mb-1"><Trophy className="w-4 h-4 text-green-500" /></div>
                                            <p className="text-lg font-bold text-slate-900 dark:text-white">{tec.total_montagens}</p>
                                            <p className="text-[10px] text-slate-500 uppercase font-bold">Total</p>
                                        </div>
                                        <div>
                                            <div className="flex justify-center mb-1"><Timer className="w-4 h-4 text-blue-500" /></div>
                                            <p className="text-lg font-bold text-slate-900 dark:text-white">{tec.tempo_medio}</p>
                                            <p className="text-[10px] text-slate-500 uppercase font-bold">Média (min)</p>
                                        </div>
                                        <div>
                                            <div className="flex justify-center mb-1"><RotateCcw className="w-4 h-4 text-amber-500" /></div>
                                            <p className="text-lg font-bold text-amber-600 dark:text-amber-500">{tec.total_retrabalhos}</p>
                                            <p className="text-[10px] text-slate-500 uppercase font-bold">Retrabalho</p>
                                        </div>
                                    </div>

                                    {/* Ações */}
                                    <div className="flex gap-2 w-full">
                                        <Button variant="outline" className="flex-1" onClick={() => handleOpenEdit(tec)}>
                                            <Edit className="w-4 h-4 mr-2" /> Editar
                                        </Button>
                                        {tec.ativo ? (
                                            <Button variant="ghost" className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => handleArquivar(tec.id, tec.nome)}>
                                                <Archive className="w-4 h-4" />
                                            </Button>
                                        ) : (
                                            <Button variant="ghost" className="text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20" onClick={() => handleRestaurar(tec.id, tec.nome)}>
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

        {/* MODAL DE CRIAÇÃO/EDIÇÃO */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
            <DialogContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                <DialogHeader>
                    <DialogTitle>{editingId ? "Editar Perfil" : "Novo Colaborador"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Nome</label>
                            <Input value={formNome} onChange={e => setFormNome(e.target.value)} placeholder="João Silva" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Cargo</label>
                            <Select value={formCargo} onValueChange={setFormCargo}>
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
                        <label className="text-sm font-medium">E-mail (Login Corporativo)</label>
                        <Input value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="joao@shineray.com" />
                    </div>

                    {/* Campos Condicionais */}
                    {formCargo === 'montador' ? (
                        <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Matrícula (Login)</label>
                                <Input value={formMatricula} onChange={e => setFormMatricula(e.target.value)} placeholder="1001" className="font-mono" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">PIN (Senha Numérica)</label>
                                <Input value={formPin} onChange={e => setFormPin(e.target.value)} maxLength={4} placeholder="1234" className="font-mono" />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2 bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                            <label className="text-sm font-medium">Senha de Acesso</label>
                            <Input type="password" value={formSenha} onChange={e => setFormSenha(e.target.value)} placeholder={editingId ? "Manter atual" : "******"} />
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
                    <Button onClick={handleSalvar} className="bg-blue-600 hover:bg-blue-700 text-white">Salvar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

      </div>
    </RoleGuard>
  );
}