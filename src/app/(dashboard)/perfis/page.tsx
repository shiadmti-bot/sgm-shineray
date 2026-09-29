"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Crown, KeyRound, Loader2, Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/sgm/PageHeader";
import { ConfirmDialog } from "@/components/sgm/ConfirmDialog";
import { Carregando } from "@/components/sgm/Carregando";
import { Selo } from "@/components/sgm/Selo";
import { supabase } from "@/lib/supabase";
import { registrarLog } from "@/lib/logger";
import { GRUPOS_PERMISSAO, PERMISSOES, rotuloPermissao, type Permissao } from "@/lib/rbac/permissoes";
import { ROTAS } from "@/lib/rbac/rotas";
import { cn } from "@/lib/utils";

interface Perfil {
  id: string;
  chave: string;
  nome: string;
  descricao: string | null;
  permissoes: string[];
  acesso_pin: boolean;
  tela_inicial: string;
  sistema: boolean;
}

interface Formulario {
  id?: string;
  chave: string;
  nome: string;
  descricao: string;
  permissoes: string[];
  acesso_pin: boolean;
  tela_inicial: string;
}

const VAZIO: Formulario = { chave: "", nome: "", descricao: "", permissoes: [], acesso_pin: false, tela_inicial: "/dashboard" };
/** Permissões que não combinam com login por PIN de 4 dígitos (tablets compartilhados). */
const SENSIVEIS_PIN: Permissao[] = ["equipe.gerenciar", "perfis.gerenciar", "configuracoes.gerenciar", "auditoria.ver", "estoque.expedir"];

const gerarChave = (nome: string) =>
  nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^([^a-z])/, "p_$1").slice(0, 40);

export default function PerfisPage() {
  const [perfis, setPerfis] = useState<Perfil[] | null>(null);
  const [usuariosPorPerfil, setUsuariosPorPerfil] = useState<Record<string, number>>({});
  const [form, setForm] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<Perfil | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    Promise.all([
      supabase.from("perfis").select("*").order("sistema", { ascending: false }).order("nome"),
      supabase.from("funcionarios").select("perfil_id").eq("ativo", true),
    ]).then(([{ data: lista }, { data: funcionarios }]) => {
      if (!ativo) return;
      setPerfis((lista as Perfil[]) || []);
      const contagem: Record<string, number> = {};
      (funcionarios || []).forEach((f: { perfil_id: string | null }) => {
        if (f.perfil_id) contagem[f.perfil_id] = (contagem[f.perfil_id] || 0) + 1;
      });
      setUsuariosPorPerfil(contagem);
    });
    return () => {
      ativo = false;
    };
  }, [versao]);

  const recarregar = () => setVersao((v) => v + 1);
  const original = form?.id ? perfis?.find((p) => p.id === form.id) : undefined;
  const usuariosDoEditado = original ? usuariosPorPerfil[original.id] || 0 : 0;

  const telasPossiveis = useMemo(
    () => ROTAS.filter((r) => r.inicial && (r.permissoes.length === 0 || r.permissoes.some((p) => form?.permissoes.includes(p)))),
    [form?.permissoes],
  );

  const salvar = async () => {
    if (!form) return;
    const nome = form.nome.trim();
    const chave = form.id ? form.chave : gerarChave(form.chave || nome);
    if (nome.length < 3) return toast.warning("Dê um nome ao perfil.");
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(chave)) return toast.warning("Identificador inválido: use letras minúsculas, números e _.");
    if (form.permissoes.length === 0) return toast.warning("Marque pelo menos uma permissão.");
    if (original && original.acesso_pin !== form.acesso_pin && usuariosDoEditado > 0) {
      return toast.error(`Este perfil tem ${usuariosDoEditado} colaborador(es). Para mudar o tipo de acesso, crie outro perfil e mova as pessoas redefinindo a senha/PIN na tela Equipe.`);
    }
    const telaInicial = telasPossiveis.some((r) => r.href === form.tela_inicial) ? form.tela_inicial : telasPossiveis[0]?.href ?? "/perfil";
    const registro = {
      nome,
      descricao: form.descricao.trim() || null,
      permissoes: form.permissoes,
      acesso_pin: form.acesso_pin,
      tela_inicial: telaInicial,
    };

    setSalvando(true);
    const { error } = form.id
      ? await supabase.from("perfis").update(registro).eq("id", form.id)
      : await supabase.from("perfis").insert({ ...registro, chave });
    setSalvando(false);
    if (error) {
      toast.error(error.code === "23505" ? "Já existe um perfil com esse identificador." : `Não foi possível salvar: ${error.message}`);
      return;
    }
    if (form.id && original) {
      const adicionadas = form.permissoes.filter((p) => !original.permissoes.includes(p));
      const removidas = original.permissoes.filter((p) => !form.permissoes.includes(p));
      await registrarLog("PERFIL_ALTERADO", "Sistema", {
        perfil: nome,
        adicionadas: adicionadas.map(rotuloPermissao),
        removidas: removidas.map(rotuloPermissao),
        acesso_pin: form.acesso_pin,
      });
    } else {
      await registrarLog("PERFIL_CRIADO", "Sistema", { perfil: nome, chave, permissoes: form.permissoes.length });
    }
    toast.success(form.id ? "Perfil atualizado." : "Perfil criado.");
    setForm(null);
    recarregar();
  };

  const excluir = async () => {
    if (!excluindo) return;
    const { error } = await supabase.from("perfis").delete().eq("id", excluindo.id);
    if (error) {
      toast.error(error.code === "23503" ? "Há colaboradores (inclusive arquivados) neste perfil. Mova-os antes de excluir." : `Não foi possível excluir: ${error.message}`);
      return;
    }
    await registrarLog("PERFIL_EXCLUIDO", "Sistema", { perfil: excluindo.nome, chave: excluindo.chave });
    toast.success("Perfil excluído.");
    setExcluindo(null);
    recarregar();
  };

  if (perfis === null) return <Carregando />;

  const alternar = (p: string) =>
    setForm((f) => f && { ...f, permissoes: f.permissoes.includes(p) ? f.permissoes.filter((x) => x !== p) : [...f.permissoes, p] });
  const alternarGrupo = (grupo: string, marcar: boolean) => {
    const doGrupo = PERMISSOES.filter((p) => p.grupo === grupo).map((p) => p.chave as string);
    setForm((f) => f && { ...f, permissoes: marcar ? [...new Set([...f.permissoes, ...doGrupo])] : f.permissoes.filter((x) => !doGrupo.includes(x)) });
  };
  const sensiveisComPin = form?.acesso_pin ? SENSIVEIS_PIN.filter((p) => form.permissoes.includes(p)) : [];

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        icone={ShieldCheck}
        titulo="Perfis de acesso"
        descricao="Defina o que cada perfil pode ver e fazer. As regras valem no aplicativo e no banco de dados."
        acoes={<Button onClick={() => setForm({ ...VAZIO })}><Plus /> Novo perfil</Button>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {perfis.map((p) => {
          const master = p.chave === "master";
          const usuarios = usuariosPorPerfil[p.id] || 0;
          return (
            <Card key={p.id} className="gap-4 py-5">
              <CardHeader className="px-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      {master && <Crown className="size-4 text-warning" />}
                      {p.nome}
                    </CardTitle>
                    <CardDescription className="mt-1 line-clamp-2">{p.descricao || "Sem descrição."}</CardDescription>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {p.sistema && <Selo icone={Lock}>Padrão</Selo>}
                    {p.acesso_pin && <Selo icone={KeyRound}>PIN</Selo>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 px-5">
                <div className="flex flex-wrap gap-1.5">
                  {master ? (
                    <span className="rounded-md bg-warning/10 px-2 py-1 text-xs font-medium text-warning">Acesso total ao sistema</span>
                  ) : (
                    p.permissoes.slice(0, 6).map((perm) => (
                      <span key={perm} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{rotuloPermissao(perm)}</span>
                    ))
                  )}
                  {!master && p.permissoes.length > 6 && <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">+{p.permissoes.length - 6}</span>}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-sm text-muted-foreground"><Users className="size-4" /> {usuarios} ativo(s)</span>
                  <div className="flex gap-1">
                    {!master && (
                      <Button variant="ghost" size="icon-sm" title="Duplicar" aria-label={`Duplicar ${p.nome}`}
                        onClick={() => setForm({ ...VAZIO, nome: `${p.nome} (cópia)`, descricao: p.descricao ?? "", permissoes: [...p.permissoes], acesso_pin: p.acesso_pin, tela_inicial: p.tela_inicial })}>
                        <Copy />
                      </Button>
                    )}
                    {!master && (
                      <Button variant="ghost" size="icon-sm" title="Editar" aria-label={`Editar ${p.nome}`}
                        onClick={() => setForm({ id: p.id, chave: p.chave, nome: p.nome, descricao: p.descricao ?? "", permissoes: [...p.permissoes], acesso_pin: p.acesso_pin, tela_inicial: p.tela_inicial })}>
                        <Pencil />
                      </Button>
                    )}
                    {!p.sistema && (
                      <Button variant="ghost" size="icon-sm" className="text-destructive" title="Excluir" aria-label={`Excluir ${p.nome}`}
                        onClick={() => (usuarios > 0 ? toast.error(`Mova os ${usuarios} colaborador(es) deste perfil antes de excluí-lo.`) : setExcluindo(p))}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!form} onOpenChange={(v) => !v && !salvando && setForm(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? `Editar perfil: ${original?.nome ?? ""}` : "Novo perfil de acesso"}</DialogTitle>
            <DialogDescription>Marque o que as pessoas deste perfil podem fazer.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome</Label>
                  <Input id="nome" value={form.nome} maxLength={40} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Expedição" />
                  {!form.id && <p className="text-xs text-muted-foreground">Identificador: <code>{gerarChave(form.nome) || "—"}</code></p>}
                </div>
                <div className="space-y-2">
                  <Label>Tela inicial</Label>
                  <Select value={telasPossiveis.some((r) => r.href === form.tela_inicial) ? form.tela_inicial : ""} onValueChange={(v) => setForm({ ...form, tela_inicial: v })}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Primeira tela permitida" /></SelectTrigger>
                    <SelectContent>
                      {telasPossiveis.map((r) => <SelectItem key={r.href} value={r.href}>{r.titulo}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea id="descricao" rows={2} value={form.descricao} maxLength={200} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                <input type="checkbox" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" checked={form.acesso_pin} onChange={(e) => setForm({ ...form, acesso_pin: e.target.checked })} />
                <span>
                  <span className="block text-sm font-medium">Acesso pela linha (matrícula + PIN de 4 números)</span>
                  <span className="block text-xs text-muted-foreground">Para quem usa tablets compartilhados. Sem esta opção, o acesso é com senha.</span>
                </span>
              </label>
              {sensiveisComPin.length > 0 && (
                <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                  Atenção: PIN de 4 números é um acesso simples. Evite dar a este perfil: {sensiveisComPin.map(rotuloPermissao).join(", ")}.
                </p>
              )}
              <div className="space-y-4">
                {GRUPOS_PERMISSAO.map((grupo) => {
                  const itens = PERMISSOES.filter((p) => p.grupo === grupo);
                  const todos = itens.every((p) => form.permissoes.includes(p.chave));
                  return (
                    <div key={grupo} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{grupo}</p>
                        <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => alternarGrupo(grupo, !todos)}>
                          {todos ? "Desmarcar grupo" : "Marcar grupo"}
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {itens.map((p) => {
                          const marcado = form.permissoes.includes(p.chave);
                          return (
                            <label key={p.chave} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors", marcado && "border-primary/50 bg-primary/5")}>
                              <input type="checkbox" className="mt-0.5 size-4 accent-[hsl(var(--primary))]" checked={marcado} onChange={() => alternar(p.chave)} />
                              <span>
                                <span className="block text-sm font-medium">{p.rotulo}</span>
                                <span className="block text-xs text-muted-foreground">{p.descricao}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="animate-spin" />} Salvar perfil</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        aberto={!!excluindo}
        aoMudar={(v) => !v && setExcluindo(null)}
        titulo={`Excluir o perfil "${excluindo?.nome}"?`}
        descricao="Esta ação não pode ser desfeita."
        confirmar="Excluir"
        destrutivo
        aoConfirmar={excluir}
      />
    </div>
  );
}
