"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Target, ListChecks, PaintBucket, Armchair, Bike, Tag, Cloud, HardDrive, Database,
  ArrowUp, ArrowDown, Trash2, Plus, Save, Loader2, ArrowRight, ChevronDown, ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/sgm/PageHeader";
import { Led } from "@/components/sgm/Led";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getUsuarioLogado } from "@/lib/auth";
import { registrarLog } from "@/lib/logger";
import { CONFIG_GERAL_PADRAO, salvarConfigGeral, useConfigGeral, type ConfigGeral, type OrigemConfig } from "@/lib/config-sistema";
import type { CorCatalogo } from "@/lib/constantes";
import { identificarModelo, VDS_MAP } from "@/lib/model-decoder";

const clonar = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function mover<T>(lista: T[], idx: number, dir: -1 | 1): T[] {
  const alvo = idx + dir;
  if (alvo < 0 || alvo >= lista.length) return lista;
  const nova = [...lista];
  [nova[idx], nova[alvo]] = [nova[alvo], nova[idx]];
  return nova;
}

function BotoesOrdem({ idx, total, onMover, onRemover }: { idx: number; total: number; onMover: (dir: -1 | 1) => void; onRemover: () => void }) {
  return (
    <div className="flex items-center shrink-0">
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMover(-1)} disabled={idx === 0} aria-label="Subir"><ArrowUp className="w-3.5 h-3.5" /></Button>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMover(1)} disabled={idx === total - 1} aria-label="Descer"><ArrowDown className="w-3.5 h-3.5" /></Button>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onRemover} aria-label="Remover"><Trash2 className="w-3.5 h-3.5" /></Button>
    </div>
  );
}

function EditorCores({ titulo, descricao, icone: Icone, cores, onChange }: { titulo: string; descricao: string; icone: typeof PaintBucket; cores: CorCatalogo[]; onChange: (c: CorCatalogo[]) => void }) {
  const alterar = (idx: number, parcial: Partial<CorCatalogo>) => onChange(cores.map((c, i) => (i === idx ? { ...c, ...parcial } : c)));
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Icone className="w-5 h-5 text-muted-foreground" /> {titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {cores.map((cor, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input type="color" value={cor.hex} onChange={(e) => alterar(idx, { hex: e.target.value })} className="h-9 w-10 shrink-0 rounded border border-input bg-transparent cursor-pointer" aria-label={`Cor de exibição de ${cor.nome}`} />
            <Input value={cor.nome} onChange={(e) => alterar(idx, { nome: e.target.value })} placeholder="Nome gravado (ex.: Vermelha)" className="h-9 w-40 sm:w-48 shrink-0" />
            <Input value={cor.descricao || ""} onChange={(e) => alterar(idx, { descricao: e.target.value })} placeholder="Texto exibido na lista" className="h-9" />
            <BotoesOrdem idx={idx} total={cores.length} onMover={(d) => onChange(mover(cores, idx, d))} onRemover={() => onChange(cores.filter((_, i) => i !== idx))} />
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...cores, { nome: "", descricao: "", hex: "#94a3b8" }])}>
          <Plus className="w-4 h-4 mr-1" /> Adicionar cor
        </Button>
      </CardContent>
    </Card>
  );
}

function validar(c: ConfigGeral): string | null {
  const nomesDuplicados = (lista: CorCatalogo[]) => {
    const nomes = lista.map((x) => x.nome.trim().toLowerCase()).filter(Boolean);
    return nomes.find((n, i) => nomes.indexOf(n) !== i);
  };
  if (c.checklist.filter((i) => i.trim()).length === 0) return "O checklist precisa de pelo menos um item.";
  const dupCar = nomesDuplicados(c.coresCarenagem);
  if (dupCar) return `Cor de carenagem repetida: ${dupCar}`;
  const dupBanco = nomesDuplicados(c.coresBanco);
  if (dupBanco) return `Cor de banco repetida: ${dupBanco}`;
  for (const m of c.modelosExtras) {
    if (!/^[A-Z0-9]{6}$/.test(m.vds.trim().toUpperCase())) return `Código VDS inválido: "${m.vds}" (use 6 letras/números).`;
    if (!m.modelo.trim()) return `Informe o nome do modelo para o código ${m.vds}.`;
  }
  const vds = c.modelosExtras.map((m) => m.vds.trim().toUpperCase());
  const dupVds = vds.find((v, i) => vds.indexOf(v) !== i);
  if (dupVds) return `Código VDS repetido: ${dupVds}`;
  return null;
}

function Formulario({ inicial, origem, tabelaAusente, onSalvo }: { inicial: ConfigGeral; origem: OrigemConfig; tabelaAusente: boolean; onSalvo: () => void }) {
  const [base, setBase] = useState<ConfigGeral>(() => clonar(inicial));
  const [cfg, setCfg] = useState<ConfigGeral>(() => clonar(inicial));
  const [salvando, setSalvando] = useState(false);
  const [vinTeste, setVinTeste] = useState("");
  const [verTabela, setVerTabela] = useState(false);
  const alterado = JSON.stringify(cfg) !== JSON.stringify(base);

  useEffect(() => {
    if (!alterado) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [alterado]);

  const set = <K extends keyof ConfigGeral>(chave: K, valor: ConfigGeral[K]) => setCfg((c) => ({ ...c, [chave]: valor }));

  const salvar = async () => {
    const erro = validar(cfg);
    if (erro) return toast.error(erro);
    setSalvando(true);
    try {
      const limpo: ConfigGeral = {
        ...cfg,
        checklist: cfg.checklist.map((i) => i.trim()).filter(Boolean),
        coresCarenagem: cfg.coresCarenagem.filter((c) => c.nome.trim()),
        coresBanco: cfg.coresBanco.filter((c) => c.nome.trim()),
        modelosExtras: cfg.modelosExtras.map((m) => ({ vds: m.vds.trim().toUpperCase(), modelo: m.modelo.trim() })),
      };
      const alteradas = (Object.keys(limpo) as (keyof ConfigGeral)[]).filter((k) => JSON.stringify(limpo[k]) !== JSON.stringify(base[k]));
      const resultado = await salvarConfigGeral(limpo, getUsuarioLogado()?.nome);
      await registrarLog("CONFIGURACAO", "Sistema", { secoes: alteradas, armazenamento: resultado.origem, meta_diaria: limpo.metaDiaria });
      if (resultado.origem === "servidor") toast.success("Configurações salvas para todas as estações.");
      else toast.warning(resultado.tabelaAusente ? "Salvo apenas neste dispositivo: execute a migração do banco (ver abaixo)." : "Servidor indisponível: salvo apenas neste dispositivo.");
      setBase(clonar(limpo));
      setCfg(clonar(limpo));
      onSalvo();
    } finally {
      setSalvando(false);
    }
  };

  const vinNormalizado = vinTeste.trim().toUpperCase();
  const resultadoTeste = vinNormalizado.length >= 9 ? identificarModelo(vinNormalizado, cfg.modelosExtras) : null;

  return (
    <div className="space-y-6">
      {/* Produção e alertas */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Target className="w-5 h-5 text-muted-foreground" /> Produção e alertas</CardTitle>
          <CardDescription>Usados na Torre de Controle e nas telas da linha.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {([
            ["metaDiaria", "Meta diária (motos montadas)", 1, 999, "motos"],
            ["limiteMontagemMin", "Referência por montagem", 1, 999, "min"],
            ["limitePausaMin", "Alerta de pausa longa", 1, 480, "min"],
            ["limiteFilaQA", "Alerta de fila na inspeção", 1, 999, "motos"],
          ] as const).map(([chave, rotulo, min, max, sufixo]) => (
            <label key={chave} className="space-y-1 block">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{rotulo}</span>
              <div className="relative">
                <Input
                  type="number"
                  min={min}
                  max={max}
                  value={cfg[chave]}
                  onChange={(e) => set(chave, Math.max(min, Math.min(max, Number(e.target.value) || min)))}
                  className="h-10 pr-14"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{sufixo}</span>
              </div>
            </label>
          ))}
        </CardContent>
      </Card>

      {/* Checklist */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><ListChecks className="w-5 h-5 text-muted-foreground" /> Checklist de montagem</CardTitle>
          <CardDescription>Itens obrigatórios antes de enviar a moto para a qualidade.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {cfg.checklist.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-6 text-right text-xs font-mono text-muted-foreground shrink-0">{idx + 1}.</span>
              <Input value={item} onChange={(e) => set("checklist", cfg.checklist.map((x, i) => (i === idx ? e.target.value : x)))} className="h-9" />
              <BotoesOrdem idx={idx} total={cfg.checklist.length} onMover={(d) => set("checklist", mover(cfg.checklist, idx, d))} onRemover={() => set("checklist", cfg.checklist.filter((_, i) => i !== idx))} />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => set("checklist", [...cfg.checklist, ""])}><Plus className="w-4 h-4 mr-1" /> Adicionar item</Button>
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => set("checklist", clonar(CONFIG_GERAL_PADRAO.checklist))}>Restaurar padrão</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <EditorCores titulo="Cores de carenagem" descricao="Opções da linha de montagem. O nome é o valor gravado na moto." icone={PaintBucket} cores={cfg.coresCarenagem} onChange={(c) => set("coresCarenagem", c)} />
        <EditorCores titulo="Cores do banco" descricao="Opções da linha de montagem. O nome é o valor gravado na moto." icone={Armchair} cores={cfg.coresBanco} onChange={(c) => set("coresBanco", c)} />
      </div>

      {/* Modelos VDS */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Bike className="w-5 h-5 text-muted-foreground" /> Modelos por código do chassi (VDS)</CardTitle>
          <CardDescription>
            Cadastre lançamentos sem precisar atualizar o sistema. O VDS são os 6 caracteres após os 3 primeiros do chassi
            (ex.: 99H<strong>NJ1125</strong>T8000462). Códigos cadastrados aqui têm prioridade sobre a tabela interna ({Object.keys(VDS_MAP).length} códigos).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {cfg.modelosExtras.length === 0 && <p className="text-sm text-muted-foreground">Nenhum código adicional cadastrado.</p>}
            {cfg.modelosExtras.map((m, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input value={m.vds} onChange={(e) => set("modelosExtras", cfg.modelosExtras.map((x, i) => (i === idx ? { ...x, vds: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) } : x)))} placeholder="VDS" className="h-9 w-28 font-mono uppercase shrink-0" />
                <Input value={m.modelo} onChange={(e) => set("modelosExtras", cfg.modelosExtras.map((x, i) => (i === idx ? { ...x, modelo: e.target.value } : x)))} placeholder="Nome do modelo (ex.: JET 125 2027)" className="h-9" />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={() => set("modelosExtras", cfg.modelosExtras.filter((_, i) => i !== idx))} aria-label="Remover código"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => set("modelosExtras", [...cfg.modelosExtras, { vds: "", modelo: "" }])}><Plus className="w-4 h-4 mr-1" /> Adicionar código</Button>
          </div>

          <div className="space-y-2 rounded-md border bg-background/60 p-3">
            <label className="rotulo text-sutil">Testar um chassi</label>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Input value={vinTeste} onChange={(e) => setVinTeste(e.target.value.toUpperCase())} maxLength={17} placeholder="Cole ou bipe um chassi de 17 caracteres" className="h-9 font-mono uppercase sm:max-w-sm" />
              {resultadoTeste && (
                <span className="flex w-fit items-center gap-1.5 rounded-sm border bg-card px-2 py-1 text-xs font-medium">
                  <Led estado={resultadoTeste === "Modelo Desconhecido" ? "critico" : "bom"} className="size-2" />
                  {resultadoTeste}
                </span>
              )}
            </div>
          </div>

          <button type="button" className="text-xs font-bold text-muted-foreground flex items-center gap-1" onClick={() => setVerTabela((v) => !v)}>
            {verTabela ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Ver tabela interna de códigos
          </button>
          {verTabela && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 text-xs max-h-64 overflow-y-auto p-3 rounded-xl border border-border">
              {Object.entries(VDS_MAP).map(([vds, modelo]) => (
                <div key={vds} className="flex gap-2"><span className="font-mono font-bold w-16 shrink-0">{vds}</span><span className="text-muted-foreground truncate">{modelo}</span></div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Etiquetas */}
      <Card className="py-0 bg-card border-border">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-info/10 text-primary"><Tag className="w-6 h-6" /></div>
            <div>
              <p className="font-bold">Layout das etiquetas</p>
              <p className="text-sm text-muted-foreground">Tamanho, blocos, fontes, código de barras/QR, campos e calibração da impressora.</p>
            </div>
          </div>
          <Link href="/etiquetagem?aba=layout">
            <Button variant="outline">Abrir editor <ArrowRight className="w-4 h-4 ml-2" /></Button>
          </Link>
        </CardContent>
      </Card>

      {/* Armazenamento */}
      <Card className={cn("py-0", tabelaAusente && "border-l-[3px] border-l-warning")}>
        <CardContent className="p-5 flex items-start gap-3">
          <Database className={cn("w-6 h-6 shrink-0 mt-0.5", tabelaAusente ? "text-warning" : "text-muted-foreground")} />
          <div className="text-sm space-y-1">
            <p className="font-bold flex items-center gap-2">
              Armazenamento das configurações
              {origem === "servidor"
                ? <span className="flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-xs font-medium"><Led estado="bom" className="size-2" /><Cloud className="size-3" /> Compartilhado</span>
                : <span className="flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-xs font-medium"><Led estado="atencao" className="size-2" /><HardDrive className="size-3" /> Local</span>}
            </p>
            {tabelaAusente ? (
              <p className="text-muted-foreground">
                A tabela <code className="font-mono">configuracoes_sistema</code> ainda não existe no Supabase, então as alterações ficam só neste navegador.
                Para compartilhar entre todas as estações, execute no SQL Editor do Supabase o arquivo
                <code className="font-mono"> supabase/migrations/20260928120000_configuracoes_sistema.sql</code> do repositório.
              </p>
            ) : (
              <p className="text-muted-foreground">As configurações são gravadas no banco e valem para todas as estações (atualização em até 1 minuto).</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Barra de salvar */}
      <div className="sticky bottom-4 z-30">
        <Card className={cn("gap-0 py-0 shadow-lg", alterado ? "border-foreground" : "bg-card/95")}>
          <CardContent className="p-3 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Led estado={alterado ? "atencao" : "desligado"} piscando={alterado} className="size-2" />
              {alterado ? "Há alterações não salvas." : "Nenhuma alteração pendente."}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={!alterado || salvando} onClick={() => setCfg(clonar(base))}>Descartar</Button>
              <Button disabled={!alterado || salvando} onClick={salvar} className="font-semibold">
                {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ConfiguracoesPage() {
  const { config, origem, tabelaAusente, carregando, recarregar } = useConfigGeral();

  return (
      <div className="space-y-6 pb-10">
        <PageHeader
          titulo="Configurações do sistema"
          descricao="Metas, alertas, checklist, cores e modelos: ajustáveis sem atualizar o sistema."
        />
        {carregando ? (
          <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full rounded-lg" />)}</div>
        ) : (
          <Formulario inicial={config} origem={origem} tabelaAusente={tabelaAusente} onSalvo={recarregar} />
        )}
      </div>
  );
}
