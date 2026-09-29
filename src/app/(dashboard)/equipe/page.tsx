"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Archive, Crown, Flame, KeyRound, Loader2, Medal, Pencil, Plus, RotateCcw, Search, ShieldCheck, Trophy, UserX, Users, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/sgm/PageHeader";
import { EmptyState } from "@/components/sgm/EmptyState";
import { ConfirmDialog } from "@/components/sgm/ConfirmDialog";
import { Iniciais } from "@/components/sgm/Iniciais";
import { tempoRelativo } from "@/components/layout/SinoNotificacoes";
import { supabase } from "@/lib/supabase";
import { chamarApi } from "@/lib/api";
import { usePode, useUsuarioLogado } from "@/lib/auth";
import { buscarTodas } from "@/lib/consultas";
import { TAMANHO_MINIMO_SENHA } from "@/lib/rbac/credenciais";
import { cn } from "@/lib/utils";

interface Usuario {
  id: string;
  nome: string;
  cargo: string | null;
  matricula: string | null;
  email: string | null;
  ativo: boolean;
  data_contratacao: string | null;
  perfil_id: string | null;
  perfil: { id: string; chave: string; nome: string; acesso_pin: boolean } | null;
  login: string | null;
  acesso: "ativo" | "sem_acesso" | "bloqueado";
  ultimo_acesso: string | null;
  trocar_senha: boolean;
}

interface PerfilOpcao { id: string; chave: string; nome: string; acesso_pin: boolean; permissoes: string[] }

interface Desempenho { total: number; retrabalhos: number; media: number; trabalhando: boolean; score: number; selos: string[] }

interface Formulario {
  id?: string;
  nome: string;
  matricula: string;
  email: string;
  perfil_id: string;
  data_contratacao: string;
  senha: string;
  pin: string;
  exigir_troca: boolean;
}

const DIAS_DESEMPENHO = 90;
const FORM_VAZIO: Formulario = { nome: "", matricula: "", email: "", perfil_id: "", data_contratacao: "", senha: "", pin: "", exigir_troca: true };

const SELOS: Record<string, { rotulo: string; icone: typeof Medal; classe: string }> = {
  qualidade: { rotulo: "Zero retrabalho", icone: ShieldCheck, classe: "bg-success/10 text-success" },
  volume: { rotulo: "50+ montagens", icone: Trophy, classe: "bg-warning/10 text-warning" },
  velocidade: { rotulo: "Ágil", icone: Zap, classe: "bg-info/10 text-info" },
  producao: { rotulo: "Montando agora", icone: Flame, classe: "bg-primary/10 text-primary" },
};

async function carregarDesempenho(): Promise<Map<string, Desempenho>> {
  const desde = new Date(Date.now() - DIAS_DESEMPENHO * 86_400_000).toISOString();
  const motos = await buscarTodas<{ id: string; montador_id: string | null; status: string; rework_count: number | null; inicio_montagem: string | null; fim_montagem: string | null }>(
    (de, ate) =>
      supabase
        .from("motos")
        .select("id, montador_id, status, rework_count, inicio_montagem, fim_montagem")
        .neq("status", "aguardando_montagem")
        .gte("created_at", desde)
        .order("created_at")
        .order("id")
        .range(de, ate),
  );
  const porMontador = new Map<string, typeof motos>();
  motos.forEach((m) => {
    if (!m.montador_id) return;
    porMontador.set(m.montador_id, [...(porMontador.get(m.montador_id) ?? []), m]);
  });
  const resultado = new Map<string, Desempenho>();
  porMontador.forEach((lista, id) => {
    const total = lista.length;
    const retrabalhos = lista.reduce((s, m) => s + (m.rework_count || 0), 0);
    const tempos = lista
      .filter((m) => m.inicio_montagem && m.fim_montagem)
      .map((m) => (new Date(m.fim_montagem!).getTime() - new Date(m.inicio_montagem!).getTime()) / 60000)
      .filter((t) => t > 0 && t < 480);
    const media = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0;
    const trabalhando = lista.some((m) => m.status === "em_producao");
    let score = total * 10 - retrabalhos * 25;
    if (total > 0 && media > 0 && media < 100) score += 15;
    const selos: string[] = [];
    if (total >= 5 && retrabalhos === 0) selos.push("qualidade");
    if (total >= 50) selos.push("volume");
    if (media > 0 && media < 90) selos.push("velocidade");
    if (trabalhando) selos.push("producao");
    resultado.set(id, { total, retrabalhos, media, trabalhando, score: Math.max(0, score), selos });
  });
  return resultado;
}

export default function EquipePage() {
  const eu = useUsuarioLogado();
  const gerencia = usePode("equipe.gerenciar");
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [perfis, setPerfis] = useState<PerfilOpcao[]>([]);
  const [desempenho, setDesempenho] = useState<Map<string, Desempenho>>(new Map());
  const [versao, setVersao] = useState(0);
  const [busca, setBusca] = useState("");
  const [filtroPerfil, setFiltroPerfil] = useState("todos");
  const [situacao, setSituacao] = useState<"ativos" | "arquivados">("ativos");
  const [form, setForm] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmacao, setConfirmacao] = useState<{ tipo: "arquivar" | "restaurar"; u: Usuario } | null>(null);

  useEffect(() => {
    let ativo = true;
    Promise.all([
      chamarApi<{ usuarios: Usuario[] }>("/api/admin/usuarios").then((r) => r.usuarios).catch((e: Error) => {
        toast.error(e.message);
        return [] as Usuario[];
      }),
      supabase.from("perfis").select("id, chave, nome, acesso_pin, permissoes").order("nome"),
      carregarDesempenho().catch(() => new Map<string, Desempenho>()),
    ]).then(([lista, { data: listaPerfis }, mapa]) => {
      if (!ativo) return;
      setUsuarios(lista);
      setPerfis((listaPerfis as PerfilOpcao[]) || []);
      setDesempenho(mapa);
    });
    return () => {
      ativo = false;
    };
  }, [versao]);

  const recarregar = () => setVersao((v) => v + 1);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (usuarios ?? [])
      .filter((u) => (situacao === "ativos" ? u.ativo : !u.ativo))
      .filter((u) => filtroPerfil === "todos" || u.perfil_id === filtroPerfil || (filtroPerfil === "sem" && !u.perfil_id))
      .filter((u) => !termo || [u.nome, u.matricula, u.email, u.login].some((v) => String(v ?? "").toLowerCase().includes(termo)));
  }, [usuarios, busca, filtroPerfil, situacao]);

  const ranking = useMemo(
    () => filtrados.filter((u) => desempenho.has(u.id)).sort((a, b) => (desempenho.get(b.id)?.score ?? 0) - (desempenho.get(a.id)?.score ?? 0)),
    [filtrados, desempenho],
  );

  // Hierarquia: só o Master mexe em contas Master (o servidor confere de novo)
  const podeMexer = (u: Usuario) => gerencia && (eu?.master || u.perfil?.chave !== "master");
  const perfisAtribuiveis = perfis.filter((p) => eu?.master || (p.chave !== "master" && (!p.permissoes.includes("perfis.gerenciar") || eu?.permissoes.includes("perfis.gerenciar"))));
  const perfilDoForm = perfis.find((p) => p.id === form?.perfil_id);
  const original = form?.id ? usuarios?.find((u) => u.id === form.id) : undefined;
  const mudouTipoAcesso = Boolean(original?.perfil && perfilDoForm && original.perfil.acesso_pin !== perfilDoForm.acesso_pin);
  const precisaCredencial = !form?.id || mudouTipoAcesso || original?.acesso === "sem_acesso";

  const salvar = async () => {
    if (!form) return;
    if (form.nome.trim().length < 3) return toast.warning("Informe o nome completo.");
    if (!form.perfil_id) return toast.warning("Selecione o perfil de acesso.");
    if (perfilDoForm?.acesso_pin) {
      if (!/^\d{1,10}$/.test(form.matricula.trim())) return toast.warning("Para acesso por PIN, a matrícula deve ter só números.");
      if (form.pin && !/^\d{4}$/.test(form.pin)) return toast.warning("O PIN deve ter exatamente 4 números.");
      if (precisaCredencial && !form.pin) return toast.warning("Defina o PIN de 4 números.");
    } else {
      if (!form.matricula.trim() && !form.email.trim()) return toast.warning("Informe a matrícula ou o e-mail (um dos dois é o usuário de login).");
      if (form.senha && form.senha.length < TAMANHO_MINIMO_SENHA) return toast.warning(`A senha deve ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
      if (precisaCredencial && !form.senha) return toast.warning("Defina a senha inicial.");
    }

    const corpo: Record<string, unknown> = {
      nome: form.nome,
      matricula: form.matricula.trim() || null,
      email: form.email.trim() || null,
      perfil_id: form.perfil_id,
      data_contratacao: form.data_contratacao || null,
      exigir_troca: form.exigir_troca,
    };
    if (perfilDoForm?.acesso_pin && form.pin) corpo.pin = form.pin;
    if (!perfilDoForm?.acesso_pin && form.senha) corpo.senha = form.senha;

    setSalvando(true);
    try {
      if (form.id) await chamarApi(`/api/admin/usuarios/${form.id}`, { metodo: "PATCH", corpo });
      else await chamarApi("/api/admin/usuarios", { metodo: "POST", corpo });
      toast.success(form.id ? "Colaborador atualizado." : "Colaborador cadastrado. O acesso já está liberado.");
      setForm(null);
      recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const alterarSituacao = async () => {
    if (!confirmacao) return;
    try {
      await chamarApi(`/api/admin/usuarios/${confirmacao.u.id}`, { metodo: "PATCH", corpo: { ativo: confirmacao.tipo === "restaurar" } });
      toast.success(confirmacao.tipo === "arquivar" ? "Colaborador arquivado e acesso bloqueado." : "Colaborador restaurado.");
      setConfirmacao(null);
      recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar.");
    }
  };

  const abrirEdicao = (u: Usuario) =>
    setForm({
      id: u.id,
      nome: u.nome,
      matricula: u.matricula ?? "",
      email: u.email ?? "",
      perfil_id: u.perfil_id ?? "",
      data_contratacao: u.data_contratacao ? u.data_contratacao.slice(0, 10) : "",
      senha: "",
      pin: "",
      exigir_troca: true,
    });

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        icone={Users}
        titulo="Equipe"
        descricao="Colaboradores, perfis de acesso e desempenho na linha."
        acoes={gerencia && <Button onClick={() => setForm({ ...FORM_VAZIO, perfil_id: perfis.find((p) => p.chave === "montador")?.id ?? "" })}><Plus /> Novo colaborador</Button>}
      />

      <Card className="py-3">
        <CardContent className="flex flex-col gap-3 px-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, matrícula ou e-mail" className="h-11 pl-9" />
          </div>
          <Select value={filtroPerfil} onValueChange={setFiltroPerfil}>
            <SelectTrigger className="h-11 w-full md:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os perfis</SelectItem>
              {perfis.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              <SelectItem value="sem">Sem perfil</SelectItem>
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 md:w-60">
            {(["ativos", "arquivados"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setSituacao(s)}
                className={cn("rounded-md px-3 text-sm font-medium capitalize", situacao === s ? "bg-card shadow-xs" : "text-muted-foreground")}>
                {s}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="acessos">
        <TabsList>
          <TabsTrigger value="acessos"><KeyRound /> Acessos</TabsTrigger>
          <TabsTrigger value="desempenho"><Trophy /> Desempenho ({DIAS_DESEMPENHO} dias)</TabsTrigger>
        </TabsList>

        <TabsContent value="acessos">
          {usuarios === null ? (
            <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
          ) : filtrados.length === 0 ? (
            <EmptyState icone={UserX} titulo="Ninguém encontrado" descricao="Ajuste a busca ou os filtros." />
          ) : (
            <Card className="py-1">
              <CardContent className="divide-y px-0">
                {filtrados.map((u) => (
                  <div key={u.id} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Iniciais nome={u.nome} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate font-semibold">
                          {u.nome}
                          {u.perfil?.chave === "master" && <Crown className="size-4 text-warning" />}
                          {u.id === eu?.id && <span className="rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">você</span>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {u.matricula ? `Matrícula ${u.matricula}` : u.email || "—"}{u.login && !u.matricula ? "" : u.email ? ` · ${u.email}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:w-[26rem] md:justify-end">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", u.perfil ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
                        {u.perfil?.nome ?? "Sem perfil"}
                      </span>
                      {u.perfil?.acesso_pin && <span className="rounded-full bg-info/10 px-2 py-0.5 text-xs font-semibold text-info">PIN</span>}
                      {u.acesso === "sem_acesso" && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">Sem acesso</span>}
                      {u.acesso === "bloqueado" && u.ativo && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">Bloqueado</span>}
                      {u.trocar_senha && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Troca de senha pendente</span>}
                      <span className="text-xs text-muted-foreground">{u.ultimo_acesso ? `Último acesso ${tempoRelativo(u.ultimo_acesso)}` : "Nunca acessou"}</span>
                    </div>
                    {podeMexer(u) && (
                      <div className="flex gap-1 md:justify-end">
                        <Button variant="ghost" size="icon-sm" title="Editar / redefinir acesso" aria-label={`Editar ${u.nome}`} onClick={() => abrirEdicao(u)}><Pencil /></Button>
                        {u.id !== eu?.id && (
                          u.ativo ? (
                            <Button variant="ghost" size="icon-sm" className="text-destructive" title="Arquivar" aria-label={`Arquivar ${u.nome}`} onClick={() => setConfirmacao({ tipo: "arquivar", u })}><Archive /></Button>
                          ) : (
                            <Button variant="ghost" size="icon-sm" title="Restaurar" aria-label={`Restaurar ${u.nome}`} onClick={() => setConfirmacao({ tipo: "restaurar", u })}><RotateCcw /></Button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="desempenho">
          {ranking.length === 0 ? (
            <EmptyState icone={Trophy} titulo="Sem montagens no período" descricao={`O desempenho considera as motos dos últimos ${DIAS_DESEMPENHO} dias.`} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {ranking.map((u, i) => {
                const d = desempenho.get(u.id)!;
                return (
                  <Card key={u.id} className={cn("gap-4 py-5", i === 0 && "border-warning/60")}>
                    <CardContent className="space-y-4 px-5">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Iniciais nome={u.nome} className="size-12 text-sm" />
                          {i < 3 && (
                            <span className={cn("absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full border-2 border-card text-xs font-bold text-white",
                              i === 0 ? "bg-yellow-500" : i === 1 ? "bg-zinc-400" : "bg-amber-700")}>{i + 1}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{u.nome}</p>
                          <p className="text-xs text-muted-foreground">{u.perfil?.nome ?? "—"}</p>
                        </div>
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary tabular-nums">{d.score} pts</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-muted/60 py-2"><p className="text-lg font-bold tabular-nums">{d.total}</p><p className="text-[11px] text-muted-foreground">montagens</p></div>
                        <div className="rounded-lg bg-muted/60 py-2"><p className={cn("text-lg font-bold tabular-nums", d.retrabalhos > 0 && "text-destructive")}>{d.retrabalhos}</p><p className="text-[11px] text-muted-foreground">retrabalhos</p></div>
                        <div className="rounded-lg bg-muted/60 py-2"><p className="text-lg font-bold tabular-nums">{d.media || "—"}</p><p className="text-[11px] text-muted-foreground">min/moto</p></div>
                      </div>
                      {d.selos.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {d.selos.map((s) => {
                            const selo = SELOS[s];
                            const Icone = selo.icone;
                            return <span key={s} className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", selo.classe)}><Icone className="size-3" /> {selo.rotulo}</span>;
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!form} onOpenChange={(v) => !v && !salvando && setForm(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar colaborador" : "Novo colaborador"}</DialogTitle>
            <DialogDescription>
              {form?.id ? "Deixe senha/PIN em branco para manter o atual." : "O acesso é criado na hora; informe a senha/PIN pessoalmente ao colaborador."}
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="f-nome">Nome completo</Label>
                <Input id="f-nome" value={form.nome} maxLength={80} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Perfil de acesso</Label>
                <Select value={form.perfil_id} onValueChange={(v) => setForm({ ...form, perfil_id: v })} disabled={form.id === eu?.id}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {perfisAtribuiveis.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}{p.acesso_pin ? " (PIN)" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-contratacao">Data de contratação</Label>
                <Input id="f-contratacao" type="date" value={form.data_contratacao} onChange={(e) => setForm({ ...form, data_contratacao: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-matricula">Matrícula {perfilDoForm?.acesso_pin && <span className="text-destructive">*</span>}</Label>
                <Input id="f-matricula" value={form.matricula} maxLength={30} inputMode={perfilDoForm?.acesso_pin ? "numeric" : undefined}
                  onChange={(e) => setForm({ ...form, matricula: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-email">E-mail {perfilDoForm && !perfilDoForm.acesso_pin && !form.matricula && <span className="text-destructive">*</span>}</Label>
                <Input id="f-email" type="email" value={form.email} maxLength={120} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              {perfilDoForm && (
                perfilDoForm.acesso_pin ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="f-pin">{form.id && !precisaCredencial ? "Novo PIN (opcional)" : "PIN de 4 números"}</Label>
                    <Input id="f-pin" inputMode="numeric" maxLength={4} value={form.pin} autoComplete="off"
                      onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} className="max-w-40 font-mono tracking-[0.4em]" />
                    <p className="text-xs text-muted-foreground">Login na linha: matrícula + PIN no teclado numérico.</p>
                  </div>
                ) : (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="f-senha">{form.id && !precisaCredencial ? "Nova senha (opcional)" : "Senha inicial"}</Label>
                    <Input id="f-senha" type="text" autoComplete="off" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input type="checkbox" className="size-4 accent-[hsl(var(--primary))]" checked={form.exigir_troca} onChange={(e) => setForm({ ...form, exigir_troca: e.target.checked })} />
                      Exigir troca da senha no próximo acesso
                    </label>
                  </div>
                )
              )}
              {mudouTipoAcesso && (
                <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm sm:col-span-2">
                  O novo perfil usa outro tipo de acesso ({perfilDoForm?.acesso_pin ? "PIN" : "senha"}): defina a nova credencial.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        aberto={!!confirmacao}
        aoMudar={(v) => !v && setConfirmacao(null)}
        titulo={confirmacao?.tipo === "arquivar" ? `Arquivar ${confirmacao.u.nome}?` : `Restaurar ${confirmacao?.u.nome}?`}
        descricao={confirmacao?.tipo === "arquivar"
          ? "O acesso é bloqueado imediatamente. O histórico de produção e a auditoria são mantidos."
          : "O acesso volta a funcionar com a mesma senha/PIN de antes."}
        confirmar={confirmacao?.tipo === "arquivar" ? "Arquivar" : "Restaurar"}
        destrutivo={confirmacao?.tipo === "arquivar"}
        aoConfirmar={alterarSituacao}
      />
    </div>
  );
}
