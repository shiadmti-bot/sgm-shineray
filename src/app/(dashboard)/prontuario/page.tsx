"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FileSearch, History, Loader2, ScanBarcode } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/sgm/PageHeader";
import { StatusBadge } from "@/components/sgm/StatusBadge";
import { EmptyState } from "@/components/sgm/EmptyState";
import { Dica } from "@/components/sgm/Guia";
import { Painel } from "@/components/sgm/Painel";
import { PlacaChassi } from "@/components/sgm/PlacaChassi";
import { supabase } from "@/lib/supabase";

interface MotoResumo {
  id: string;
  sku: string;
  modelo: string | null;
  cor: string | null;
  status: string | null;
  localizacao: string | null;
  updated_at: string | null;
}

const COLUNAS = "id, sku, modelo, cor, status, localizacao, updated_at";
const limparCodigo = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

function LinhaMoto({ m }: { m: MotoResumo }) {
  return (
    <li>
      <Link
        href={`/prontuario/${encodeURIComponent(m.sku)}`}
        className="flex items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-semibold">{m.modelo || "Modelo não informado"}</p>
          <PlacaChassi chassi={m.sku} tamanho="sm" />
          <p className="truncate text-xs text-sutil">{[m.cor, m.localizacao].filter(Boolean).join(" · ") || "—"}</p>
        </div>
        <StatusBadge status={m.status} className="hidden sm:inline-flex" />
        <ChevronRight className="size-4 text-sutil" />
      </Link>
    </li>
  );
}

export default function ProntuarioBuscaPage() {
  const router = useRouter();
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<MotoResumo[] | null>(null);
  const [recentes, setRecentes] = useState<MotoResumo[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const codigo = limparCodigo(termo);

  useEffect(() => {
    supabase
      .from("motos")
      .select(COLUNAS)
      .order("updated_at", { ascending: false })
      .limit(12)
      .then(({ data }) => setRecentes((data as MotoResumo[]) || []));
  }, []);

  useEffect(() => {
    if (codigo.length < 3) return;
    let cancelado = false;
    const id = setTimeout(() => {
      setBuscando(true);
      supabase
        .from("motos")
        .select(COLUNAS)
        .ilike("sku", `%${codigo}%`)
        .order("updated_at", { ascending: false })
        .limit(30)
        .then(({ data }) => {
          if (cancelado) return;
          setResultados((data as MotoResumo[]) || []);
          setBuscando(false);
        });
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(id);
    };
  }, [codigo]);

  const lista = codigo.length >= 3 ? resultados : null;

  const aoEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (codigo.length < 5) return;
    // Leitor de código de barras: chassi completo abre direto
    const exato = lista?.find((m) => m.sku.toUpperCase() === codigo);
    if (exato || codigo.length === 17) router.push(`/prontuario/${encodeURIComponent(exato?.sku ?? codigo)}`);
    else if (lista && lista.length === 1) router.push(`/prontuario/${encodeURIComponent(lista[0].sku)}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Prontuário do chassi"
        descricao="Toda a história de uma moto: entrada, montagem, pausas, qualidade, avarias, fotos, etiquetas e expedição."
      />

      <form onSubmit={aoEnviar} className="relative">
        <ScanBarcode className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Bipe ou digite o chassi (ou os últimos dígitos)"
          className="h-14 bg-card pl-12 font-mono text-lg uppercase tracking-[0.12em] placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
          aria-label="Chassi"
        />
        {buscando && <Loader2 className="absolute right-4 top-1/2 size-5 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </form>

      <Dica titulo="Busca pelo final do chassi">
        Digite só os últimos dígitos (os mesmos da etiqueta) para encontrar a moto. Com o leitor, bipe o chassi completo e o prontuário abre direto.
        O atalho <kbd className="rounded-[3px] border bg-card px-1 font-mono text-[11px]">Ctrl K</kbd> faz a mesma busca de qualquer tela.
      </Dica>

      {lista ? (
        <Painel titulo="Resultado" icone={FileSearch} meta={`${lista.length} chassi(s) contêm "${codigo}"`} semRecuo>
          {lista.length === 0 ? (
            <div className="p-4">
              <EmptyState icone={FileSearch} titulo="Nenhuma moto encontrada" descricao={`Nenhum chassi contém "${codigo}".`} compacto />
            </div>
          ) : (
            <ul className="divide-y">{lista.map((m) => <LinhaMoto key={m.id} m={m} />)}</ul>
          )}
        </Painel>
      ) : (
        <Painel titulo="Movimentadas recentemente" icone={History} semRecuo>
          {recentes === null ? (
            <div className="space-y-2 p-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-12 animate-pulse rounded-sm bg-muted" />)}</div>
          ) : recentes.length === 0 ? (
            <div className="p-4"><EmptyState titulo="Nenhuma moto cadastrada ainda" compacto /></div>
          ) : (
            <ul className="divide-y">{recentes.map((m) => <LinhaMoto key={m.id} m={m} />)}</ul>
          )}
        </Painel>
      )}
    </div>
  );
}
