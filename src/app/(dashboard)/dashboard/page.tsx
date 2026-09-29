"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/sgm/PageHeader";
import { Dica } from "@/components/sgm/Guia";
import { EVENTO_ABRIR_SOLICITACOES } from "@/components/layout/CentralSolicitacoes";
import { ProducaoHoje } from "@/components/central/ProducaoHoje";
import { EstadoLinha, type AlertaAndon } from "@/components/central/EstadoLinha";
import { MapaFluxo, type EstacaoFluxo } from "@/components/central/MapaFluxo";
import { Montagens, type MotoNaLinha } from "@/components/central/Montagens";
import { ESPERA_QA_ATENCAO_MIN, FilaInspecao, type MotoNaFila } from "@/components/central/FilaInspecao";
import { DiarioBordo, type EventoDiario } from "@/components/central/DiarioBordo";
import type { EstadoLed } from "@/components/sgm/Led";
import { supabase } from "@/lib/supabase";
import { useUsuarioLogado } from "@/lib/auth";
import { pode } from "@/lib/rbac/permissoes";
import { podeAcessarCaminho } from "@/lib/rbac/rotas";
import { useConfigGeral } from "@/lib/config-sistema";
import { formatarDuracaoMin, inicioDoDiaISO, minutosDesde } from "@/lib/datas";
import { primeiroNome } from "@/lib/constantes";
import { cn } from "@/lib/utils";

const INTERVALO_MS = 10_000;

interface MotoLinhaComMontador extends MotoNaLinha {
  montador_id?: string | null;
}

const contagem = () => supabase.from("motos").select("*", { count: "exact", head: true });
type Contagem = ReturnType<typeof contagem>;
const contar = (filtro: (q: Contagem) => Contagem) => filtro(contagem());

async function buscarPainel(verPedidosPausa: boolean) {
  const hoje = inicioDoDiaISO();
  const [
    fila, montagem, pausadasTotal, qualidade, avarias, retrabalho, etiqueta, estoque, entradasHoje, expedidasHoje,
    solicitacoes, ativos, emPausa, aguardandoQA, finalizadas,
  ] = await Promise.all([
    contar((q) => q.eq("status", "aguardando_montagem")),
    contar((q) => q.eq("status", "em_producao")),
    contar((q) => q.eq("status", "pausado")),
    contar((q) => q.eq("status", "em_analise")),
    contar((q) => q.like("status", "avaria_%")),
    contar((q) => q.eq("status", "retrabalho_montagem")),
    contar((q) => q.eq("status", "aguardando_etiqueta")),
    contar((q) => q.eq("status", "estoque")),
    contar((q) => q.gte("created_at", hoje)),
    contar((q) => q.eq("status", "expedido").gte("updated_at", hoje)),
    verPedidosPausa
      ? supabase.from("solicitacoes_pausa").select("*", { count: "exact", head: true }).eq("status", "pendente")
      : Promise.resolve({ count: null, error: null }),
    supabase.from("motos").select(`id, modelo, sku, inicio_montagem, montador_id, montador:funcionarios!motos_montador_id_fkey(nome)`)
      .eq("status", "em_producao").order("inicio_montagem", { ascending: true }),
    supabase.from("motos").select(`id, modelo, sku, updated_at, montador_id, montador:funcionarios!motos_montador_id_fkey(nome)`)
      .eq("status", "pausado").order("updated_at", { ascending: true }),
    supabase.from("motos").select("id, modelo, sku, fim_montagem").eq("status", "em_analise").order("fim_montagem", { ascending: true }).limit(12),
    supabase.from("motos").select("fim_montagem").gte("fim_montagem", hoje).order("fim_montagem", { ascending: true }).limit(1000),
  ]);

  const falhou = [fila, montagem, qualidade, ativos, finalizadas].some((r) => r.error);
  if (falhou) throw new Error("falha ao consultar a linha");

  return {
    n: {
      fila: fila.count ?? 0,
      montagem: montagem.count ?? 0,
      pausadas: pausadasTotal.count ?? 0,
      qualidade: qualidade.count ?? 0,
      avarias: avarias.count ?? 0,
      retrabalho: retrabalho.count ?? 0,
      etiqueta: etiqueta.count ?? 0,
      estoque: estoque.count ?? 0,
      entradasHoje: entradasHoje.count ?? 0,
      expedidasHoje: expedidasHoje.count ?? 0,
      pedidosPausa: verPedidosPausa ? solicitacoes.count ?? 0 : null,
    },
    ativas: (ativos.data ?? []) as unknown as MotoLinhaComMontador[],
    pausadas: (emPausa.data ?? []) as unknown as MotoLinhaComMontador[],
    filaQA: (aguardandoQA.data ?? []) as MotoNaFila[],
    finalizacoes: ((finalizadas.data ?? []) as { fim_montagem: string | null }[]).map((f) => f.fim_montagem).filter((f): f is string => !!f),
  };
}

async function buscarEventos(): Promise<EventoDiario[]> {
  // O banco devolve só o que o perfil pode ver. Entradas e saídas do sistema ficam só na Auditoria.
  const { data } = await supabase
    .from("logs_sistema")
    .select("id, acao, usuario, referencia, created_at")
    .not("acao", "in", "(LOGIN,LOGIN_FALHA,LOGOUT)")
    .order("created_at", { ascending: false })
    .limit(8);
  return (data || []) as EventoDiario[];
}

type DadosPainel = Awaited<ReturnType<typeof buscarPainel>>;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export default function CentralDaLinhaPage() {
  const usuario = useUsuarioLogado();
  const { config } = useConfigGeral();
  const verPedidosPausa = pode(usuario, "pausas.aprovar");
  const [dados, setDados] = useState<DadosPainel | null>(null);
  const [eventos, setEventos] = useState<EventoDiario[]>([]);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [falha, setFalha] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    try {
      const [d, ev] = await Promise.all([buscarPainel(verPedidosPausa), buscarEventos()]);
      setDados(d);
      setEventos(ev);
      setAtualizadoEm(new Date());
      setFalha(false);
    } catch {
      setFalha(true);
    } finally {
      setAgora(Date.now());
      setAtualizando(false);
    }
  }, [verPedidosPausa]);

  useEffect(() => {
    // Primeira leitura e atualização periódica (a tela fica aberta em monitores da linha)
    const primeira = setTimeout(atualizar, 0);
    const intervalo = setInterval(atualizar, INTERVALO_MS);
    const relogio = setInterval(() => setAgora(Date.now()), 15_000);
    return () => {
      clearTimeout(primeira);
      clearInterval(intervalo);
      clearInterval(relogio);
    };
  }, [atualizar]);

  const carregando = dados === null;
  const n = dados?.n;
  const ativas = dados?.ativas ?? [];
  const pausadas = dados?.pausadas ?? [];
  const filaQA = dados?.filaQA ?? [];
  const link = (href: string) => (podeAcessarCaminho(usuario, href) ? href : undefined);
  const linkProntuario = pode(usuario, "prontuario.ver") ? (chassi: string) => `/prontuario/${encodeURIComponent(chassi)}` : undefined;

  // --- Regras de sinalização (Andon) ---
  const atrasadas = ativas.filter((m) => minutosDesde(m.inicio_montagem, agora) > config.limiteMontagemMin);
  const pausasLongas = pausadas.filter((m) => minutosDesde(m.updated_at, agora) > config.limitePausaMin);
  const esperaQA = filaQA.length ? minutosDesde(filaQA[0].fim_montagem, agora) : 0;
  const filaQAcheia = (n?.qualidade ?? 0) > config.limiteFilaQA;
  const esperaQAlonga = esperaQA > ESPERA_QA_ATENCAO_MIN;

  const alertas: AlertaAndon[] = [];
  if (n) {
    if (n.avarias > 0) {
      alertas.push({ nivel: "critico", codigo: "AV", texto: `${plural(n.avarias, "moto parada", "motos paradas")} no pátio de avarias`, href: link("/avarias") });
    }
    atrasadas.forEach((m) =>
      alertas.push({
        nivel: "atencao",
        codigo: "E2",
        texto: `Montagem de ${m.modelo} (${primeiroNome(m.montador?.nome)}) passa de ${config.limiteMontagemMin} min: ${formatarDuracaoMin(minutosDesde(m.inicio_montagem, agora))}`,
        href: linkProntuario?.(m.sku),
      }),
    );
    pausasLongas.forEach((m) =>
      alertas.push({
        nivel: "atencao",
        codigo: "E2",
        texto: `Pausa de ${primeiroNome(m.montador?.nome)} passa de ${config.limitePausaMin} min: ${formatarDuracaoMin(minutosDesde(m.updated_at, agora))}`,
        href: linkProntuario?.(m.sku),
      }),
    );
    if (filaQAcheia) {
      alertas.push({ nivel: "atencao", codigo: "E3", texto: `Fila de inspeção com ${n.qualidade} motos (limite ${config.limiteFilaQA})`, href: link("/qualidade") });
    }
    if (esperaQAlonga) {
      alertas.push({ nivel: "atencao", codigo: "E3", texto: `Moto aguardando inspeção há ${formatarDuracaoMin(esperaQA)}`, href: link("/qualidade") });
    }
  }

  const montadoresAtivos = new Set([...ativas, ...pausadas].map((m) => m.montador_id ?? m.montador?.nome).filter(Boolean)).size;

  // --- Estações do fluxo ---
  const vaziaOuNormal = (valor: number): EstadoLed => (valor > 0 ? "bom" : "neutro");
  const textosE2 = [
    pausasLongas.length > 0 && plural(pausasLongas.length, "pausa longa", "pausas longas"),
    atrasadas.length > 0 && `${atrasadas.length} acima de ${config.limiteMontagemMin} min`,
  ].filter(Boolean) as string[];
  const textosE3 = [
    filaQAcheia && `acima do limite (${config.limiteFilaQA})`,
    esperaQAlonga && `espera de ${formatarDuracaoMin(esperaQA)}`,
  ].filter(Boolean) as string[];

  const principal: EstacaoFluxo[] = [
    {
      codigo: "E1", titulo: "Entrada", valor: n?.fila ?? 0, unidade: "na fila para montar", estado: vaziaOuNormal(n?.fila ?? 0), href: link("/scanner"),
      explicacao: "O leitor registra a caixa da moto pelo chassi. O modelo é reconhecido pelo código VDS (posições 4 a 9 do chassi) e a moto entra no fim da fila de montagem.",
      entra: "Caixas recebidas no CD", sai: "E2 Montagem, por ordem de chegada",
    },
    {
      codigo: "E2", titulo: "Montagem", valor: (n?.montagem ?? 0) + (n?.pausadas ?? 0),
      unidade: n?.pausadas ? `montando · ${n.pausadas} em pausa` : "montando agora",
      estado: textosE2.length ? "atencao" : vaziaOuNormal((n?.montagem ?? 0) + (n?.pausadas ?? 0)), alerta: textosE2.join(" · ") || undefined, href: link("/montagem"),
      explicacao: "O montador assume a próxima moto da fila (retrabalhos têm prioridade), segue o checklist e informa as cores ao finalizar. Pausas são pedidas ao supervisor, que autoriza ou nega.",
      entra: "Fila da E1 e retrabalhos devolvidos pela E3", sai: "E3 Qualidade, ao finalizar",
    },
    {
      codigo: "E3", titulo: "Qualidade", valor: n?.qualidade ?? 0, unidade: "aguardando inspeção",
      estado: textosE3.length ? "atencao" : vaziaOuNormal(n?.qualidade ?? 0), alerta: textosE3.join(" · ") || undefined, href: link("/qualidade"),
      explicacao: "O inspetor confere as motos na ordem em que foram finalizadas. Aprovada, segue para a etiquetagem; com ajuste simples, volta ao montador (retrabalho); com defeito, vai para o pátio de avarias.",
      entra: "Motos finalizadas na E2 e motos reparadas no pátio de avarias", sai: "E4 se aprovada · E2 em retrabalho · AV com avaria",
    },
    {
      codigo: "E4", titulo: "Etiquetagem", valor: n?.etiqueta ?? 0, unidade: "aguardando etiqueta", estado: vaziaOuNormal(n?.etiqueta ?? 0), href: link("/etiquetagem"),
      explicacao: "Imprime a etiqueta da moto aprovada, no layout definido pela gestão, e a envia para o estoque.",
      entra: "Motos aprovadas na E3", sai: "E5 Estoque, ao imprimir a etiqueta",
    },
    {
      codigo: "E5", titulo: "Estoque", valor: n?.estoque ?? 0, unidade: "prontas no pátio", estado: vaziaOuNormal(n?.estoque ?? 0), href: link("/estoque"),
      explicacao: "Pátio de motos prontas para venda. A saída registra a expedição; o inventário (IN) confere o pátio pela leitura dos chassis.",
      entra: "Motos etiquetadas na E4", sai: "Expedição (saída do estoque)",
    },
  ];
  const saida: EstacaoFluxo = {
    codigo: "EXP", titulo: "Expedição", valor: n?.expedidasHoje ?? 0, unidade: "saídas hoje", estado: vaziaOuNormal(n?.expedidasHoje ?? 0), href: link("/estoque"),
    explicacao: "Motos que deixaram o estoque hoje. O prontuário de cada chassi guarda toda a passagem dela pela linha.",
    entra: "Saídas registradas no Estoque (E5)", sai: "Fim do fluxo no CD",
  };
  const retrabalho: EstacaoFluxo = {
    codigo: "RT", titulo: "Retrabalho", valor: n?.retrabalho ?? 0, unidade: "aguardando o montador", desvio: true, href: link("/montagem"),
    estado: (n?.retrabalho ?? 0) > 0 ? "serio" : "neutro", alerta: (n?.retrabalho ?? 0) > 0 ? "devolvidas pela inspeção" : undefined,
    explicacao: "Moto devolvida pela inspeção para um ajuste. Volta para quem a montou (ou para um supervisor, se o montador saiu da empresa) e aparece como prioridade na Montagem.",
    entra: "Motos devolvidas pela E3", sai: "E3 Qualidade, ao finalizar de novo",
  };
  const avarias: EstacaoFluxo = {
    codigo: "AV", titulo: "Avarias", valor: n?.avarias ?? 0, unidade: "no pátio de avarias", desvio: true, href: link("/avarias"),
    estado: (n?.avarias ?? 0) > 0 ? "critico" : "neutro", alerta: (n?.avarias ?? 0) > 0 ? "aguardando reparo" : undefined,
    explicacao: "Pátio de segregação das motos reprovadas por defeito (mecânica, pintura, estrutura ou peças faltantes). Depois do reparo registrado, a moto volta para uma nova inspeção.",
    entra: "Motos reprovadas na E3", sai: "E3 Qualidade, depois do reparo",
  };

  const hora = atualizadoEm?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        titulo="Central da linha"
        sobretitulo="Controle · visão geral da produção"
        descricao="O que está acontecendo em cada estação agora. A tela se atualiza sozinha a cada 10 segundos."
        acoes={
          <>
            <span className={cn("flex items-center gap-1.5 text-xs", falha ? "font-medium text-foreground" : "text-sutil")} aria-live="polite">
              {falha ? (
                <><WifiOff className="size-3.5 text-destructive" aria-hidden /> Falha ao atualizar{hora ? ` · dados de ${hora}` : ""}</>
              ) : hora ? (
                <>Atualizado às <span className="font-mono tabular-nums text-foreground">{hora}</span></>
              ) : (
                "Lendo a linha…"
              )}
            </span>
            <Button variant="outline" size="sm" onClick={atualizar} disabled={atualizando} className="gap-1.5">
              <RefreshCw className={cn("size-3.5", atualizando && "animate-spin")} /> Atualizar
            </Button>
          </>
        }
      />

      <Dica titulo="Como ler esta tela">
        O fluxo segue da esquerda para a direita: <strong className="font-semibold text-foreground">E1 Entrada → E2 Montagem → E3 Qualidade → E4 Etiquetagem → E5 Estoque</strong>.
        Cada número é quantas motos estão na estação agora. A lâmpada mostra o estado — verde normal, amarela atenção, vermelha crítico — e vem
        sempre com o motivo escrito. Toque numa estação para ver o que acontece nela.
      </Dica>

      <div className="grid gap-6 xl:grid-cols-3">
        <ProducaoHoje
          className="xl:col-span-2"
          montadas={dados?.finalizacoes.length ?? 0}
          meta={config.metaDiaria}
          entradas={n?.entradasHoje ?? 0}
          expedidas={n?.expedidasHoje ?? 0}
          finalizacoes={dados?.finalizacoes ?? []}
          agora={agora}
          carregando={carregando}
        />
        <EstadoLinha
          alertas={alertas}
          montadoresAtivos={montadoresAtivos}
          pedidosPausa={n ? n.pedidosPausa : verPedidosPausa ? 0 : null}
          aoAbrirPedidos={() => window.dispatchEvent(new Event(EVENTO_ABRIR_SOLICITACOES))}
          carregando={carregando}
        />
      </div>

      <MapaFluxo principal={principal} saida={saida} retrabalho={retrabalho} avarias={avarias} />

      <div className="grid gap-6 xl:grid-cols-3">
        <Montagens
          className="xl:col-span-2"
          ativas={ativas}
          pausadas={pausadas}
          limiteMontagemMin={config.limiteMontagemMin}
          limitePausaMin={config.limitePausaMin}
          agora={agora}
          carregando={carregando}
          linkProntuario={linkProntuario}
        />
        <FilaInspecao
          fila={filaQA}
          total={n?.qualidade ?? 0}
          limiteFilaQA={config.limiteFilaQA}
          agora={agora}
          carregando={carregando}
          hrefQualidade={link("/qualidade")}
        />
      </div>

      <DiarioBordo eventos={eventos} carregando={carregando} linkProntuario={linkProntuario} hrefAuditoria={link("/auditoria")} />
    </div>
  );
}
