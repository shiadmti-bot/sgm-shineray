import { useCallback, useEffect, useState } from "react";
import { carregarConfig, salvarConfig, type ResultadoConfig } from "../config-sistema";
import { configEtiquetasPadrao, normalizarConfigEtiquetas } from "./padroes";
import type { ConfigEtiquetas, ModeloEtiqueta } from "./tipos";

const CHAVE = "etiquetas";

export async function carregarConfigEtiquetas(): Promise<ResultadoConfig<ConfigEtiquetas>> {
  const r = await carregarConfig<unknown>(CHAVE, configEtiquetasPadrao());
  return { ...r, valor: normalizarConfigEtiquetas(r.valor) };
}

export async function salvarConfigEtiquetas(config: ConfigEtiquetas, usuario?: string | null) {
  return salvarConfig(CHAVE, normalizarConfigEtiquetas(config), usuario);
}

export function modeloPadrao(config: ConfigEtiquetas): ModeloEtiqueta {
  return config.modelos.find((m) => m.id === config.padraoId) || config.modelos[0];
}

export function useConfigEtiquetas() {
  const [estado, setEstado] = useState<ResultadoConfig<ConfigEtiquetas> | null>(null);

  useEffect(() => {
    let ativo = true;
    carregarConfigEtiquetas().then((r) => {
      if (ativo) setEstado(r);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const recarregar = useCallback(async () => {
    const r = await carregarConfigEtiquetas();
    setEstado(r);
    return r;
  }, []);

  /** Atualiza o estado local após salvar (sem nova consulta ao banco). */
  const definir = useCallback((valor: ConfigEtiquetas, origem: ResultadoConfig<ConfigEtiquetas>["origem"], tabelaAusente: boolean) => {
    setEstado({ valor, origem, tabelaAusente });
  }, []);

  return {
    config: estado?.valor ?? null,
    origem: estado?.origem ?? "padrao",
    tabelaAusente: estado?.tabelaAusente ?? false,
    carregando: estado === null,
    recarregar,
    definir,
  };
}
