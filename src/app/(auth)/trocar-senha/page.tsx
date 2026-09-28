"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Carregando } from "@/components/sgm/Carregando";
import { supabase } from "@/lib/supabase";
import { registrarLog } from "@/lib/logger";
import { sair, useSessao } from "@/lib/auth";
import { problemaSenha } from "@/lib/rbac/credenciais";
import { telaInicial } from "@/lib/rbac/rotas";

/** Troca obrigatória da senha provisória definida pelo gestor (1º acesso ou senha redefinida). */
export default function TrocarSenhaPage() {
  const router = useRouter();
  const { status, usuario } = useSessao();
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (status === "anonimo") router.replace("/login");
    else if (status === "autenticado" && usuario && !usuario.trocarSenha) router.replace(telaInicial(usuario));
  }, [status, usuario, router]);

  if (status !== "autenticado" || !usuario || !usuario.trocarSenha) return <Carregando />;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const problema = problemaSenha(nova);
    if (problema) return toast.warning(problema);
    if (nova !== confirmacao) return toast.warning("As senhas não conferem.");
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: nova, data: { trocar_senha: false } });
    setSalvando(false);
    if (error) {
      toast.error(/different from the old|same/i.test(error.message) ? "A nova senha precisa ser diferente da provisória." : `Não foi possível trocar a senha: ${error.message}`);
      return;
    }
    await registrarLog("SENHA_ALTERADA", "Sistema", { tipo: "senha", motivo: "troca_obrigatoria" });
    toast.success("Senha definida! Bom trabalho.");
    // A sessão é recarregada pelo evento USER_UPDATED; o efeito acima leva à tela inicial.
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <form onSubmit={salvar} className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-8 shadow-sm">
        <div className="space-y-2">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="size-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Defina sua senha</h1>
          <p className="text-sm text-muted-foreground">
            Olá, {usuario.nome.split(" ")[0]}. Sua senha atual é provisória: escolha uma senha pessoal para continuar.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="nova">Nova senha</Label>
          <Input id="nova" type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} className="h-12" />
          <p className="text-xs text-muted-foreground">Pelo menos 6 caracteres. Não compartilhe com ninguém.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmacao">Repita a nova senha</Label>
          <Input id="confirmacao" type="password" autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} className="h-12" />
        </div>
        <Button type="submit" className="h-12 w-full text-base font-semibold" disabled={salvando}>
          {salvando && <Loader2 className="animate-spin" />} Salvar e continuar
        </Button>
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          onClick={async () => { await sair("manual"); router.replace("/login"); }}
        >
          <LogOut className="size-4" /> Sair
        </button>
      </form>
    </div>
  );
}
