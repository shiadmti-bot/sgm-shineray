"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FileSearch, Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/sgm/StatusBadge";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useUsuarioLogado } from "@/lib/auth";
import { pode } from "@/lib/rbac/permissoes";
import { rotasPermitidas } from "@/lib/rbac/rotas";
import { iconeDaRota } from "./icones";

export const EVENTO_ABRIR_BUSCA = "sgm:abrir-busca";

interface MotoEncontrada {
  id: string;
  sku: string;
  modelo: string | null;
  status: string | null;
  cor: string | null;
}

type Resultado =
  | { tipo: "moto"; chave: string; moto: MotoEncontrada }
  | { tipo: "tela"; chave: string; href: string; titulo: string; descricao: string };

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Só letras e números: o que um leitor de código de barras ou um chassi contém. */
const limparCodigo = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Busca rápida (Ctrl+K): chassi (prontuário) ou tela do sistema. */
export function BuscaRapida() {
  const router = useRouter();
  const usuario = useUsuarioLogado();
  const podeProntuario = pode(usuario, "prontuario.ver");
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [motos, setMotos] = useState<MotoEncontrada[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [selecionado, setSelecionado] = useState(0);
  const listaRef = useRef<HTMLDivElement>(null);

  // Atalhos: Ctrl+K / Cmd+K e evento do botão do cabeçalho
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberto((v) => !v);
      }
    };
    const abrir = () => setAberto(true);
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener(EVENTO_ABRIR_BUSCA, abrir);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener(EVENTO_ABRIR_BUSCA, abrir);
    };
  }, []);

  // Chassis (com atraso para não consultar a cada tecla)
  const codigo = limparCodigo(termo);
  useEffect(() => {
    if (!aberto || !podeProntuario || codigo.length < 3) return;
    let cancelado = false;
    const id = setTimeout(() => {
      setBuscando(true);
      supabase
        .from("motos")
        .select("id, sku, modelo, status, cor")
        .ilike("sku", `%${codigo}%`)
        .order("updated_at", { ascending: false })
        .limit(8)
        .then(({ data }) => {
          if (cancelado) return;
          setMotos((data as MotoEncontrada[]) || []);
          setBuscando(false);
        });
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(id);
    };
  }, [aberto, podeProntuario, codigo]);

  const resultados = useMemo<Resultado[]>(() => {
    const t = normalizar(termo.trim());
    const telas = rotasPermitidas(usuario)
      .filter((r) => !t || normalizar(`${r.titulo} ${r.descricao} ${r.grupo}`).includes(t))
      .map((r) => ({ tipo: "tela" as const, chave: r.href, href: r.href, titulo: r.titulo, descricao: r.descricao }));
    const encontradas = podeProntuario && codigo.length >= 3 ? motos.map((m) => ({ tipo: "moto" as const, chave: m.id, moto: m })) : [];
    return [...encontradas, ...telas];
  }, [termo, usuario, podeProntuario, codigo, motos]);

  const indice = Math.min(selecionado, Math.max(0, resultados.length - 1));

  const fechar = () => {
    setAberto(false);
    setTermo("");
    setMotos([]);
    setSelecionado(0);
  };

  const escolher = (r: Resultado | undefined) => {
    if (r) {
      router.push(r.tipo === "moto" ? `/prontuario/${encodeURIComponent(r.moto.sku)}` : r.href);
    } else if (podeProntuario && codigo.length >= 5) {
      // Chassi completo lido pelo leitor: abre o prontuário mesmo sem sugestão carregada
      router.push(`/prontuario/${encodeURIComponent(codigo)}`);
    } else {
      return;
    }
    fechar();
  };

  const aoTeclarNaBusca = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelecionado((i) => Math.min(i + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelecionado((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Leitura completa de chassi (17 caracteres) vai direto ao prontuário
      if (podeProntuario && codigo.length === 17 && /\d/.test(codigo)) {
        router.push(`/prontuario/${codigo}`);
        fechar();
        return;
      }
      escolher(resultados[indice]);
    }
  };

  useEffect(() => {
    listaRef.current?.querySelector(`[data-indice="${indice}"]`)?.scrollIntoView({ block: "nearest" });
  }, [indice]);

  return (
    <Dialog open={aberto} onOpenChange={(v) => (v ? setAberto(true) : fechar())}>
      <DialogContent className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">Busca rápida</DialogTitle>
        <DialogDescription className="sr-only">Procure um chassi ou uma tela do sistema.</DialogDescription>
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={termo}
            onChange={(e) => { setTermo(e.target.value); setSelecionado(0); }}
            onKeyDown={aoTeclarNaBusca}
            placeholder={podeProntuario ? "Chassi (ou final dele) ou nome da tela…" : "Nome da tela…"}
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            aria-label="Buscar"
          />
          {buscando && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">ESC</kbd>
        </div>
        <div ref={listaRef} className="max-h-[60vh] overflow-y-auto p-2">
          {resultados.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              {podeProntuario && codigo.length >= 5 ? (
                <>Nenhuma sugestão. Tecle <strong>Enter</strong> para abrir o prontuário de {codigo}.</>
              ) : (
                "Nada encontrado."
              )}
            </p>
          ) : (
            resultados.map((r, i) => {
              const ativo = i === indice;
              const Icone = r.tipo === "moto" ? FileSearch : iconeDaRota(r.href);
              const inicioTelas = r.tipo === "tela" && (i === 0 || resultados[i - 1].tipo !== "tela");
              const inicioMotos = r.tipo === "moto" && i === 0;
              return (
                <div key={r.chave}>
                  {(inicioMotos || inicioTelas) && (
                    <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {r.tipo === "moto" ? "Motos" : "Telas"}
                    </p>
                  )}
                  <button
                    type="button"
                    data-indice={i}
                    onMouseEnter={() => setSelecionado(i)}
                    onClick={() => escolher(r)}
                    className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left", ativo ? "bg-accent" : "hover:bg-accent/60")}
                  >
                    <Icone className="size-4 shrink-0 text-muted-foreground" />
                    {r.tipo === "moto" ? (
                      <>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-sm font-semibold">{r.moto.sku}</span>
                          <span className="block truncate text-xs text-muted-foreground">{r.moto.modelo || "Modelo não informado"}{r.moto.cor ? ` · ${r.moto.cor}` : ""}</span>
                        </span>
                        <StatusBadge status={r.moto.status} />
                      </>
                    ) : (
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{r.titulo}</span>
                        <span className="block truncate text-xs text-muted-foreground">{r.descricao}</span>
                      </span>
                    )}
                    {ativo && <CornerDownLeft className="size-4 shrink-0 text-muted-foreground" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
