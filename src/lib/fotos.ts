import { supabase } from "./supabase";
import { registrarLog } from "./logger";

// Fotos das motos (avarias, qualidade e reparos) no Supabase Storage (bucket privado).

export const BUCKET_FOTOS = "fotos-motos";
export type EtapaFoto = "qualidade" | "avaria" | "reparo" | "outro";

export const ROTULO_ETAPA_FOTO: Record<EtapaFoto, string> = {
  qualidade: "Qualidade",
  avaria: "Avaria",
  reparo: "Reparo",
  outro: "Outro",
};

export interface FotoMoto {
  id: string;
  moto_id: string;
  sku: string | null;
  etapa: EtapaFoto;
  caminho: string;
  legenda: string | null;
  autor_id: string | null;
  created_at: string;
  autor?: { nome: string } | null;
  url?: string | null;
}

const LADO_MAXIMO = 1600;
const QUALIDADE_JPEG = 0.82;

function carregarImagem(arquivo: Blob): Promise<HTMLImageElement> {
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ok(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      falha(new Error("Arquivo de imagem inválido."));
    };
    img.src = url;
  });
}

/** Reduz a foto (lado maior de 1600px, JPEG) antes do envio: economiza dados móveis e armazenamento. */
export async function comprimirFoto(arquivo: File): Promise<Blob> {
  const img = await carregarImagem(arquivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight));
  const largura = Math.max(1, Math.round(img.naturalWidth * escala));
  const altura = Math.max(1, Math.round(img.naturalHeight * escala));
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) return arquivo;
  ctx.drawImage(img, 0, 0, largura, altura);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", QUALIDADE_JPEG));
  return blob ?? arquivo;
}

export async function listarFotos(motoId: string): Promise<FotoMoto[]> {
  const { data, error } = await supabase
    .from("fotos_moto")
    .select("id, moto_id, sku, etapa, caminho, legenda, autor_id, created_at, autor:funcionarios!fotos_moto_autor_id_fkey(nome)")
    .eq("moto_id", motoId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  const fotos = data as unknown as FotoMoto[];
  if (fotos.length === 0) return fotos;
  const { data: assinadas } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrls(fotos.map((f) => f.caminho), 60 * 60);
  const urls = new Map((assinadas ?? []).map((s) => [s.path, s.signedUrl]));
  return fotos.map((f) => ({ ...f, url: urls.get(f.caminho) ?? null }));
}

export async function enviarFoto(opcoes: {
  motoId: string;
  sku: string;
  etapa: EtapaFoto;
  arquivo: File;
  legenda?: string;
}): Promise<void> {
  if (!opcoes.arquivo.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  const imagem = await comprimirFoto(opcoes.arquivo);
  const aleatorio = Math.random().toString(36).slice(2, 8);
  const caminho = `${opcoes.motoId}/${opcoes.etapa}-${Date.now()}-${aleatorio}.jpg`;

  // ArrayBuffer: o arquivo vai como corpo bruto (image/jpeg), sem multipart
  const { error: erroEnvio } = await supabase.storage
    .from(BUCKET_FOTOS)
    .upload(caminho, await imagem.arrayBuffer(), { contentType: "image/jpeg", upsert: false });
  if (erroEnvio) {
    throw new Error(/row-level security|unauthorized|403/i.test(erroEnvio.message)
      ? "Seu perfil não pode enviar fotos."
      : `Falha no envio da foto: ${erroEnvio.message}`);
  }

  const { error } = await supabase.from("fotos_moto").insert({
    moto_id: opcoes.motoId,
    sku: opcoes.sku,
    etapa: opcoes.etapa,
    caminho,
    legenda: opcoes.legenda?.trim() || null,
  });
  if (error) {
    await supabase.storage.from(BUCKET_FOTOS).remove([caminho]);
    throw new Error(`Falha ao registrar a foto: ${error.message}`);
  }
  await registrarLog("FOTO_ADICIONADA", opcoes.sku, { etapa: opcoes.etapa, caminho });
}

export async function excluirFoto(foto: FotoMoto): Promise<void> {
  const { data, error } = await supabase.from("fotos_moto").delete().eq("id", foto.id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Só quem enviou a foto pode excluí-la.");
  await supabase.storage.from(BUCKET_FOTOS).remove([foto.caminho]);
  await registrarLog("FOTO_REMOVIDA", foto.sku || "N/A", { etapa: foto.etapa, caminho: foto.caminho });
}
