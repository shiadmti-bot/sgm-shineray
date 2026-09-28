"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImageOff, Loader2, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUsuarioLogado } from "@/lib/auth";
import { excluirFoto, enviarFoto, listarFotos, ROTULO_ETAPA_FOTO, type EtapaFoto, type FotoMoto } from "@/lib/fotos";

/**
 * Galeria de fotos de uma moto, com envio pela câmera do tablet/celular.
 * `etapas` filtra o que aparece; `etapaEnvio` define a etapa das fotos novas (sem ela, só exibe).
 */
export function FotosMoto({
  motoId,
  sku,
  etapas,
  etapaEnvio,
  titulo = "Fotos",
  className,
  aoAlterar,
}: {
  motoId: string;
  sku: string;
  etapas?: EtapaFoto[];
  etapaEnvio?: EtapaFoto;
  titulo?: string;
  className?: string;
  aoAlterar?: (total: number) => void;
}) {
  const usuario = useUsuarioLogado();
  const [fotos, setFotos] = useState<FotoMoto[] | null>(null);
  const [enviando, setEnviando] = useState(0);
  const [ampliada, setAmpliada] = useState<FotoMoto | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const filtro = etapas?.join("|") ?? "";

  const carregar = useCallback(async () => {
    const todas = await listarFotos(motoId);
    const visiveis = filtro ? todas.filter((f) => filtro.split("|").includes(f.etapa)) : todas;
    setFotos(visiveis);
    aoAlterar?.(visiveis.length);
  }, [motoId, filtro, aoAlterar]);

  useEffect(() => {
    let ativo = true;
    listarFotos(motoId).then((todas) => {
      if (!ativo) return;
      const visiveis = filtro ? todas.filter((f) => filtro.split("|").includes(f.etapa)) : todas;
      setFotos(visiveis);
    });
    return () => {
      ativo = false;
    };
  }, [motoId, filtro]);

  const aoEscolher = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!etapaEnvio || arquivos.length === 0) return;
    setEnviando((n) => n + arquivos.length);
    for (const arquivo of arquivos) {
      try {
        await enviarFoto({ motoId, sku, etapa: etapaEnvio, arquivo });
      } catch (erro) {
        toast.error(erro instanceof Error ? erro.message : "Falha no envio da foto.");
      } finally {
        setEnviando((n) => n - 1);
      }
    }
    await carregar();
  };

  const remover = async (foto: FotoMoto) => {
    setExcluindo(foto.id);
    try {
      await excluirFoto(foto);
      setAmpliada(null);
      toast.success("Foto excluída.");
      await carregar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível excluir.");
    } finally {
      setExcluindo(null);
    }
  };

  const podeExcluir = (f: FotoMoto) => Boolean(usuario && (usuario.master || f.autor_id === usuario.id));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {titulo} {fotos && fotos.length > 0 && <span className="font-normal text-muted-foreground">({fotos.length})</span>}
        </p>
        {etapaEnvio && (
          <>
            <input ref={entrada} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={aoEscolher} />
            <Button type="button" size="sm" variant="outline" onClick={() => entrada.current?.click()} disabled={enviando > 0}>
              {enviando > 0 ? <Loader2 className="animate-spin" /> : <Camera />}
              {enviando > 0 ? `Enviando ${enviando}…` : "Adicionar foto"}
            </Button>
          </>
        )}
      </div>

      {fotos === null ? (
        <div className="flex gap-2">{[1, 2, 3].map((i) => <div key={i} className="size-20 animate-pulse rounded-lg bg-muted" />)}</div>
      ) : fotos.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
          <ImageOff className="size-4" /> Nenhuma foto{etapaEnvio ? ". Use a câmera para registrar." : "."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {fotos.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setAmpliada(f)}
              className="group relative size-20 overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={`${ROTULO_ETAPA_FOTO[f.etapa]} · ${new Date(f.created_at).toLocaleString("pt-BR")}`}
            >
              {f.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.url} alt={`Foto ${ROTULO_ETAPA_FOTO[f.etapa]}`} className="size-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
              ) : (
                <ImageOff className="m-auto size-5 text-muted-foreground" />
              )}
              <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-[10px] font-medium text-white">{ROTULO_ETAPA_FOTO[f.etapa]}</span>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!ampliada} onOpenChange={(v) => !v && setAmpliada(null)}>
        <DialogContent className="max-w-[calc(100%-1rem)] gap-3 p-3 sm:max-w-3xl" showCloseButton={false}>
          <DialogTitle className="sr-only">Foto ampliada</DialogTitle>
          <DialogDescription className="sr-only">Foto registrada para a moto {sku}</DialogDescription>
          {ampliada?.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ampliada.url} alt="Foto ampliada" className="max-h-[75vh] w-full rounded-lg bg-black object-contain" />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-xs text-muted-foreground">
              {ampliada && `${ROTULO_ETAPA_FOTO[ampliada.etapa]} · ${ampliada.autor?.nome ?? "—"} · ${new Date(ampliada.created_at).toLocaleString("pt-BR")}`}
            </p>
            <div className="flex gap-2">
              {ampliada && podeExcluir(ampliada) && (
                <Button size="sm" variant="outline" className="text-destructive" disabled={excluindo === ampliada.id} onClick={() => remover(ampliada)}>
                  {excluindo === ampliada.id ? <Loader2 className="animate-spin" /> : <Trash2 />} Excluir
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => setAmpliada(null)}><X /> Fechar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
