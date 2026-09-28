"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { atualizarSessao, getUsuarioLogado } from "@/lib/auth";
import { efetuarLogout } from "@/lib/logout";

const INTERVALO_VERIFICACAO_MS = 5 * 60 * 1000;
const INTERVALO_EXPIRACAO_MS = 60 * 1000;

/**
 * Mantém a sessão local coerente com o cadastro:
 * - remove dados sensíveis de sessões antigas e encerra sessões expiradas;
 * - desloga quem foi arquivado/desativado pelo gestor;
 * - aplica mudanças de cargo/nome feitas na Gestão de Equipe.
 */
export function SessionWatcher() {
  const router = useRouter();

  useEffect(() => {
    let ativo = true;

    async function verificarCadastro() {
      const usuario = getUsuarioLogado();
      if (!usuario) return;
      try {
        const { data, error } = await supabase
          .from("funcionarios")
          .select("id, nome, cargo, ativo")
          .eq("id", usuario.id)
          .maybeSingle();
        // Falha de rede ou cadastro não visível (ex.: política RLS) não derruba ninguém:
        // só desconecta quando o cadastro diz explicitamente que o acesso foi desativado.
        if (!ativo || error || !data) return;

        if (data.ativo === false) {
          toast.error("Seu acesso foi desativado. Procure o gestor responsável.");
          await efetuarLogout("inativo");
          router.replace("/login");
          return;
        }

        const cargoAtual = String(data.cargo || "").toLowerCase();
        if (cargoAtual !== usuario.cargo || data.nome !== usuario.nome) {
          atualizarSessao({ cargo: cargoAtual as typeof usuario.cargo, nome: data.nome });
          toast.info("Seu perfil foi atualizado pela gestão.");
        }
      } catch {
        // Offline: tenta novamente no próximo ciclo.
      }
    }

    verificarCadastro();
    const idCadastro = setInterval(verificarCadastro, INTERVALO_VERIFICACAO_MS);
    // getUsuarioLogado() encerra a sessão expirada; o RoleGuard reage e leva ao login.
    const idExpiracao = setInterval(() => getUsuarioLogado(), INTERVALO_EXPIRACAO_MS);

    return () => {
      ativo = false;
      clearInterval(idCadastro);
      clearInterval(idExpiracao);
    };
  }, [router]);

  return null;
}
