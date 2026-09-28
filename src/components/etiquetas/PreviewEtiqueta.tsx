"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MM_PARA_PX, renderizarEtiquetas } from "@/lib/etiquetas/render";
import type { DadosEtiqueta, ModeloEtiqueta } from "@/lib/etiquetas/tipos";

interface PreviewEtiquetaProps {
  modelo: ModeloEtiqueta;
  dados: DadosEtiqueta;
  /** Zoom máximo (1 = tamanho real na tela). */
  escalaMaxima?: number;
  /** Altura máxima disponível em px (reduz o zoom para caber). */
  alturaMaxima?: number;
  className?: string;
}

// Folga do <body> da pré-visualização (padding + margem inferior da etiqueta).
const FOLGA_PX = 40;

/** Mostra a etiqueta exatamente como será impressa (mesmo HTML da impressão). */
export function PreviewEtiqueta({ modelo, dados, escalaMaxima = 1.5, alturaMaxima, className }: PreviewEtiquetaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  const [html, setHtml] = useState("");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observador = new ResizeObserver(([entrada]) => setLargura(entrada.contentRect.width));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const larguraPx = modelo.largura * MM_PARA_PX + FOLGA_PX;
  const alturaPx = modelo.altura * MM_PARA_PX + FOLGA_PX;
  let escala = largura > 0 ? Math.min(escalaMaxima, largura / larguraPx) : Math.min(escalaMaxima, 1);
  if (alturaMaxima) escala = Math.min(escala, alturaMaxima / alturaPx);
  escala = Math.max(0.2, Math.round(escala * 100) / 100);

  // Chave por conteúdo: objetos recriados a cada renderização do pai não disparam novo desenho.
  const chave = JSON.stringify({ modelo, dados });

  useEffect(() => {
    let ativo = true;
    const { modelo: m, dados: d } = JSON.parse(chave) as { modelo: ModeloEtiqueta; dados: DadosEtiqueta };
    // Pequeno atraso: evita re-renderizar a cada tecla digitada no editor.
    const id = setTimeout(() => {
      renderizarEtiquetas(m, [d], { modo: "preview", escala }).then((h) => {
        if (ativo) setHtml(h);
      });
    }, 120);
    return () => {
      ativo = false;
      clearTimeout(id);
    };
  }, [chave, escala]);

  return (
    <div ref={containerRef} className={cn("w-full", className)}>
      <iframe
        title="Pré-visualização da etiqueta"
        srcDoc={html}
        sandbox=""
        className="w-full border-0 bg-transparent block"
        style={{ height: Math.ceil(alturaPx * escala) + 4 }}
      />
    </div>
  );
}
