"use client";

import { useTheme } from "next-themes";

// Cores dos gráficos (validadas para daltonismo com o script da skill de visualização):
// - desfecho da moto, nesta ORDEM de empilhamento: aprovada → retrabalho → em andamento → avaria;
// - série única: azul; segunda série: amarelo;
// - texto nunca usa a cor do dado (fica na tinta do tema).

export interface CoresGrafico {
  aprovado: string;
  retrabalho: string;
  andamento: string;
  avaria: string;
  serie1: string;
  serie2: string;
  /** Rampa ordinal (etapas do funil), da primeira à última. */
  etapas: [string, string, string, string];
  tinta: string;
  sutil: string;
  grade: string;
  superficie: string;
}

const CLARO: CoresGrafico = {
  aprovado: "#008300",
  retrabalho: "#eda100",
  andamento: "#2a78d6",
  avaria: "#e34948",
  serie1: "#2a78d6",
  serie2: "#eda100",
  etapas: ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab"],
  tinta: "#0b0b0b",
  sutil: "#75746e",
  grade: "#e1e0d9",
  superficie: "#fcfcfb",
};

const ESCURO: CoresGrafico = {
  aprovado: "#008300",
  retrabalho: "#c98500",
  andamento: "#3987e5",
  avaria: "#e66767",
  serie1: "#3987e5",
  serie2: "#c98500",
  etapas: ["#184f95", "#256abf", "#3987e5", "#6da7ec"],
  tinta: "#f5f5f3",
  sutil: "#9a9990",
  grade: "#2c2c2a",
  superficie: "#1a1a19",
};

export function useCoresGrafico(): CoresGrafico {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? ESCURO : CLARO;
}
