"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Carregando } from "@/components/sgm/Carregando";
import {
  aoEventoSessao, DURACAO_MAXIMA_SESSAO_MS, inicioDaSessao, recarregarPerfil, sair, useSessao,
} from "@/lib/auth";
import { podeAcessarRota, rotaDoCaminho, telaInicial } from "@/lib/rbac/rotas";
import { acompanharNotificacoes, aoChegarNotificacao } from "@/lib/notificacoes";
import { acompanharContagens, atualizarContagensSeAntigas } from "@/lib/contagens";
import { tocarSom } from "@/lib/sons";
import { pode } from "@/lib/rbac/permissoes";

const INTERVALO_PERFIL_MS = 3 * 60 * 1000;
const INTERVALO_EXPIRACAO_MS = 60 * 1000;

/**
 * Protege as telas internas:
 * - sem sessão → login (voltando para a tela pedida depois);
 * - senha provisória → troca obrigatória;
 * - tela fora do perfil → tela inicial do perfil;
 * - sessão com mais de 12h, conta desativada ou permissões alteradas pela gestão.
 */
export function GuardaSessao({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, usuario } = useSessao();
  const rota = rotaDoCaminho(pathname);
  const permitido = podeAcessarRota(usuario, rota);
  const avisouNegado = useRef<string | null>(null);

  // Redirecionamentos
  useEffect(() => {
    if (status === "anonimo") {
      router.replace(`/login?voltar=${encodeURIComponent(pathname || "/")}`);
    } else if (status === "autenticado" && usuario) {
      if (usuario.trocarSenha) {
        router.replace("/trocar-senha");
      } else if (!permitido) {
        if (avisouNegado.current !== pathname) {
          avisouNegado.current = pathname;
          toast.error("Seu perfil não tem acesso a esta tela.");
        }
        router.replace(telaInicial(usuario));
      }
    }
  }, [status, usuario, permitido, pathname, router]);

  // Avisos vindos da sessão
  useEffect(
    () =>
      aoEventoSessao((evento) => {
        if (evento === "desativado") {
          toast.error("Seu acesso foi desativado. Procure o gestor responsável.");
          router.replace("/login?motivo=inativo");
        } else {
          toast.info("Suas permissões foram atualizadas pela gestão.");
        }
      }),
    [router],
  );

  // Perfil atualizado periodicamente, ao voltar para a aba e quando a rede volta
  useEffect(() => {
    if (status !== "autenticado") return;
    let ultimo = Date.now();
    const atualizar = () => {
      if (Date.now() - ultimo < 30_000) return;
      ultimo = Date.now();
      recarregarPerfil();
    };
    const idPerfil = setInterval(() => { ultimo = 0; atualizar(); }, INTERVALO_PERFIL_MS);
    const aoVoltar = () => document.visibilityState === "visible" && atualizar();
    window.addEventListener("focus", atualizar);
    window.addEventListener("online", atualizar);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(idPerfil);
      window.removeEventListener("focus", atualizar);
      window.removeEventListener("online", atualizar);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [status]);

  // Limite de duração da sessão (tablets compartilhados)
  useEffect(() => {
    if (status !== "autenticado") return;
    const verificar = async () => {
      if (Date.now() - inicioDaSessao() > DURACAO_MAXIMA_SESSAO_MS) {
        await sair("expirada");
        router.replace("/login?motivo=expirada");
      }
    };
    verificar();
    const id = setInterval(verificar, INTERVALO_EXPIRACAO_MS);
    return () => clearInterval(id);
  }, [status, router]);

  // Quantidade de motos em cada estação (menu lateral)
  const logado = status === "autenticado";
  useEffect(() => {
    acompanharContagens(logado);
  }, [logado]);
  useEffect(() => {
    atualizarContagensSeAntigas();
  }, [pathname]);

  // Notificações do usuário (tempo real + atualização periódica)
  const funcionarioId = status === "autenticado" ? usuario?.id ?? null : null;
  const aprovaPausas = pode(usuario, "pausas.aprovar");
  useEffect(() => {
    acompanharNotificacoes(funcionarioId);
  }, [funcionarioId]);
  useEffect(
    () =>
      aoChegarNotificacao((n) => {
        // Pedidos de pausa já têm alerta próprio (Central de Solicitações)
        if (n.tipo === "pausa" && aprovaPausas) return;
        tocarSom(n.tipo === "retrabalho" || n.tipo === "avaria" ? "alerta" : "sucesso");
        toast(n.titulo, {
          description: n.mensagem ?? undefined,
          action: n.link ? { label: "Abrir", onClick: () => router.push(n.link!) } : undefined,
        });
      }),
    [aprovaPausas, router],
  );

  if (status !== "autenticado" || !usuario || usuario.trocarSenha || !permitido) {
    return <Carregando texto={status === "carregando" ? "Carregando sua sessão…" : undefined} />;
  }
  return <>{children}</>;
}
