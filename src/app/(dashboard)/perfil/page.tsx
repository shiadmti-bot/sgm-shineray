"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { AlertTriangle, ClipboardCheck, Clock, Key, Laptop, Loader2, LogOut, Moon, Settings, Shield, ShieldCheck, Sun, Target, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatCard } from "@/components/sgm/StatCard";
import { Iniciais } from "@/components/sgm/Iniciais";
import { supabase } from "@/lib/supabase";
import { registrarLog } from "@/lib/logger";
import { DURACAO_MAXIMA_SESSAO_MS, inicioDaSessao, sair, useHidratado, useUsuarioLogado } from "@/lib/auth";
import { GRUPOS_PERMISSAO, PERMISSOES, pode } from "@/lib/rbac/permissoes";
import { pinValido, problemaSenha, senhaDoPin } from "@/lib/rbac/credenciais";
import { inicioDoDiaISO, inicioDoMesISO } from "@/lib/datas";
import { cn } from "@/lib/utils";

interface Estatisticas { montagensHoje: number; montagensMes: number; retrabalhos: number; inspecoesHoje: number; inspecoesMes: number }

const contar = (coluna: string, id: string, colunaData: string, desde: string) =>
  supabase.from("motos").select("*", { count: "exact", head: true }).eq(coluna, id).gte(colunaData, desde);

export default function PerfilPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const hidratado = useHidratado();
  const usuario = useUsuarioLogado();
  const usaPin = usuario?.perfil?.acesso_pin === true;
  const monta = pode(usuario, "montagem.executar");
  const inspeciona = pode(usuario, "qualidade.inspecionar");
  const [stats, setStats] = useState<Estatisticas | null>(null);

  const [dialogo, setDialogo] = useState(false);
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const usuarioId = usuario?.id;
  useEffect(() => {
    if (!usuarioId) return;
    let ativo = true;
    const hoje = inicioDoDiaISO();
    const mes = inicioDoMesISO();
    Promise.all([
      contar("montador_id", usuarioId, "fim_montagem", hoje),
      contar("montador_id", usuarioId, "fim_montagem", mes),
      supabase.from("motos").select("rework_count").eq("montador_id", usuarioId).gt("rework_count", 0),
      contar("supervisor_id", usuarioId, "updated_at", hoje),
      contar("supervisor_id", usuarioId, "updated_at", mes),
    ]).then(([h, m, r, ih, im]) => {
      if (!ativo) return;
      setStats({
        montagensHoje: h.count || 0,
        montagensMes: m.count || 0,
        retrabalhos: (r.data || []).reduce((s: number, x: { rework_count: number | null }) => s + (x.rework_count || 0), 0),
        inspecoesHoje: ih.count || 0,
        inspecoesMes: im.count || 0,
      });
    });
    return () => {
      ativo = false;
    };
  }, [usuarioId]);

  if (!usuario) return null;

  const inicio = hidratado ? inicioDaSessao() : null;
  const fimSessao = inicio ? new Date(inicio + DURACAO_MAXIMA_SESSAO_MS) : null;

  const abrirTroca = () => {
    setAtual("");
    setNova("");
    setConfirmacao("");
    setDialogo(true);
  };

  const trocar = async () => {
    if (!atual || !nova) return toast.warning("Preencha os campos.");
    if (usaPin && !pinValido(nova)) return toast.warning("O PIN deve ter exatamente 4 números.");
    if (!usaPin) {
      const problema = problemaSenha(nova);
      if (problema) return toast.warning(problema);
    }
    if (nova !== confirmacao) return toast.warning("A confirmação não confere.");
    if (nova === atual) return toast.warning("A nova credencial deve ser diferente da atual.");

    setSalvando(true);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const email = sessao.session?.user.email;
      if (!email) {
        toast.error("Sessão expirada. Entre novamente.");
        return;
      }
      // Confere a credencial atual (protege tablets deixados logados)
      const { error: erroAtual } = await supabase.auth.signInWithPassword({ email, password: usaPin ? senhaDoPin(atual) : atual });
      if (erroAtual) {
        toast.error(usaPin ? "PIN atual incorreto." : "Senha atual incorreta.");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: usaPin ? senhaDoPin(nova) : nova, data: { trocar_senha: false } });
      if (error) {
        toast.error(`Não foi possível alterar: ${error.message}`);
        return;
      }
      await registrarLog("SENHA_ALTERADA", "Sistema", { tipo: usaPin ? "PIN" : "senha", motivo: "troca_pelo_usuario" });
      toast.success(usaPin ? "PIN alterado!" : "Senha alterada!");
      setDialogo(false);
    } finally {
      setSalvando(false);
    }
  };

  const temas = [
    { valor: "light", rotulo: "Claro", icone: Sun },
    { valor: "dark", rotulo: "Escuro", icone: Moon },
    { valor: "system", rotulo: "Automático", icone: Laptop },
  ];

  return (
    <div className="space-y-6 pb-16">
      <Card className="py-6">
        <CardContent className="flex flex-col items-center gap-5 px-6 md:flex-row">
          <Iniciais nome={usuario.nome} className="size-20 text-2xl" />
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-2xl font-bold tracking-tight">{usuario.nome}</h1>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground md:justify-start">
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{usuario.perfil?.nome ?? "Sem perfil"}</span>
              {usaPin && <span className="rounded-full bg-info/10 px-2.5 py-0.5 text-xs font-semibold text-info">Acesso por PIN</span>}
              <span className="font-mono">{usuario.matricula ? `Matrícula ${usuario.matricula}` : usuario.email}</span>
            </div>
            {fimSessao && (
              <p className="mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground md:justify-start">
                <Clock className="size-3.5" /> Sessão neste dispositivo encerra automaticamente às {fimSessao.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                {fimSessao.toDateString() !== new Date().toDateString() ? ` de ${fimSessao.toLocaleDateString("pt-BR")}` : ""}.
              </p>
            )}
          </div>
          <Button variant="outline" onClick={async () => { await sair(); router.replace("/login?motivo=saiu"); }} className="w-full md:w-auto">
            <LogOut /> Sair
          </Button>
        </CardContent>
      </Card>

      {(monta || inspeciona) && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {monta && (
            <>
              <StatCard rotulo="Montagens hoje" valor={stats?.montagensHoje ?? 0} icone={Target} tom="info" carregando={!stats} />
              <StatCard rotulo="Montagens no mês" valor={stats?.montagensMes ?? 0} icone={Trophy} tom="sucesso" carregando={!stats} />
              <StatCard rotulo="Retrabalhos (total)" valor={stats?.retrabalhos ?? 0} icone={AlertTriangle} tom={(stats?.retrabalhos ?? 0) > 0 ? "alerta" : "neutro"} carregando={!stats} dica="Devoluções da qualidade" />
            </>
          )}
          {inspeciona && (
            <>
              <StatCard rotulo="Inspeções hoje" valor={stats?.inspecoesHoje ?? 0} icone={ClipboardCheck} tom="primario" carregando={!stats} />
              {!monta && <StatCard rotulo="Inspeções no mês" valor={stats?.inspecoesMes ?? 0} icone={Trophy} tom="sucesso" carregando={!stats} />}
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="size-5" /> Segurança</CardTitle>
            <CardDescription>Sua credencial de acesso ao SGM.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <p className="font-semibold">{usaPin ? "PIN de acesso" : "Senha de acesso"}</p>
                <p className="text-xs text-muted-foreground">{usaPin ? "4 números, usados no login da linha." : "Pelo menos 6 caracteres."}</p>
              </div>
              <Button variant="outline" onClick={abrirTroca}><Key /> Alterar</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Settings className="size-5" /> Aparência</CardTitle>
            <CardDescription>Tema deste dispositivo.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            {temas.map(({ valor, rotulo, icone: Icone }) => (
              <button
                key={valor}
                type="button"
                onClick={() => setTheme(valor)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-sm font-medium transition-colors",
                  hidratado && theme === valor ? "border-primary bg-primary/5 text-primary" : "hover:bg-accent",
                )}
              >
                <Icone className="size-5" /> {rotulo}
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5" /> O que o seu perfil permite</CardTitle>
          <CardDescription>
            {usuario.master ? "Perfil Master: acesso total ao sistema." : "Definido pela gestão em Perfis de acesso. Dúvidas? Fale com o gestor."}
          </CardDescription>
        </CardHeader>
        {!usuario.master && (
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {GRUPOS_PERMISSAO.map((grupo) => {
              const minhas = PERMISSOES.filter((p) => p.grupo === grupo && usuario.permissoes.includes(p.chave));
              if (minhas.length === 0) return null;
              return (
                <div key={grupo} className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{grupo}</p>
                  {minhas.map((p) => <p key={p.chave} className="text-sm">• {p.rotulo}</p>)}
                </div>
              );
            })}
          </CardContent>
        )}
      </Card>

      <Dialog open={dialogo} onOpenChange={(o) => !salvando && setDialogo(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{usaPin ? "Alterar PIN" : "Alterar senha"}</DialogTitle>
            <DialogDescription>Confirme a credencial atual para continuar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {([
              { id: "atual", rotulo: usaPin ? "PIN atual" : "Senha atual", valor: atual, definir: setAtual, auto: "current-password" },
              { id: "nova", rotulo: usaPin ? "Novo PIN (4 números)" : "Nova senha (mín. 6 caracteres)", valor: nova, definir: setNova, auto: "new-password" },
              { id: "confirmacao", rotulo: "Confirmar", valor: confirmacao, definir: setConfirmacao, auto: "new-password" },
            ] as const).map((c) => (
              <div key={c.id} className="space-y-2">
                <Label htmlFor={c.id}>{c.rotulo}</Label>
                <Input
                  id={c.id}
                  type="password"
                  value={c.valor}
                  autoComplete={c.auto}
                  inputMode={usaPin ? "numeric" : undefined}
                  onChange={(e) => c.definir(usaPin ? e.target.value.replace(/\D/g, "").slice(0, 4) : e.target.value)}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogo(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={trocar} disabled={salvando}>{salvando && <Loader2 className="animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
