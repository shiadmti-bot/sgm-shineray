"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FileSearch, History, Loader2, ScanBarcode } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/sgm/PageHeader";
import { StatusBadge } from "@/components/sgm/StatusBadge";
import { EmptyState } from "@/components/sgm/EmptyState";
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
    <Link
      href={`/prontuario/${encodeURIComponent(m.sku)}`}
      className="flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-accent"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm font-semibold">{m.sku}</p>
        <p className="truncate text-xs text-muted-foreground">
          {m.modelo || "Modelo não informado"}{m.cor ? ` · ${m.cor}` : ""}{m.localizacao ? ` · ${m.localizacao}` : ""}
        </p>
      </div>
      <StatusBadge status={m.status} className="hidden sm:inline-flex" />
      <ChevronRight className="size-4 text-muted-foreground" />
    </Link>
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
        icone={FileSearch}
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
          className="h-14 rounded-xl bg-card pl-12 font-mono text-lg uppercase tracking-wide placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
          aria-label="Chassi"
        />
        {buscando && <Loader2 className="absolute right-4 top-1/2 size-5 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </form>

      {lista ? (
        <Card className="gap-2 py-2">
          <CardContent className="px-2">
            {lista.length === 0 ? (
              <EmptyState icone={FileSearch} titulo="Nenhuma moto encontrada" descricao={`Nenhum chassi contém "${codigo}".`} compacto className="border-0" />
            ) : (
              lista.map((m) => <LinhaMoto key={m.id} m={m} />)
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><History className="size-4" /> Movimentadas recentemente</CardTitle>
          </CardHeader>
          <CardContent className="px-2">
            {recentes === null ? (
              <div className="space-y-2 px-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>
            ) : recentes.length === 0 ? (
              <EmptyState titulo="Nenhuma moto cadastrada ainda" compacto className="mx-3" />
            ) : (
              recentes.map((m) => <LinhaMoto key={m.id} m={m} />)
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
