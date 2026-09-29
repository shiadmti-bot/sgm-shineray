"use client";

import { useEffect, useState } from "react";
import { BellRing, Boxes, Camera, FileSearch, GraduationCap, Search, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUsuarioLogado } from "@/lib/auth";

export const EVENTO_ABRIR_NOVIDADES = "sgm:abrir-novidades";
const CHAVE_VISTO = "sgm_novidades_v2_visto";

const ITENS = [
  { icone: ShieldCheck, titulo: "Perfis de acesso", texto: "Cada pessoa vê só as telas e ações do seu perfil. O banco de dados confere as mesmas regras." },
  { icone: FileSearch, titulo: "Prontuário do chassi", texto: "Toda a história de uma moto em uma linha do tempo: entrada, montagem, pausas, QA, avarias, fotos e etiquetas." },
  { icone: Search, titulo: "Busca rápida (Ctrl+K)", texto: "Digite ou bipe o chassi (ou só o final dele) e abra o prontuário de qualquer tela." },
  { icone: Boxes, titulo: "Inventário do pátio", texto: "Conte o estoque bipando as motos e veja na hora as faltas e sobras." },
  { icone: Camera, titulo: "Fotos nas avarias e na qualidade", texto: "Registre o problema e o reparo com fotos tiradas pelo tablet ou celular." },
  { icone: BellRing, titulo: "Central de notificações", texto: "Pedidos de pausa, retrabalhos, avarias e divergências de inventário chegam no sino." },
  { icone: Workflow, titulo: "Central da linha e estações E1…E5", texto: "O menu segue o caminho da moto (Entrada, Montagem, Qualidade, Etiquetagem, Estoque) com a quantidade em cada estação. A Central mostra o fluxo, a meta do dia e os alertas." },
  { icone: GraduationCap, titulo: "Modo guia", texto: "Dicas curtas explicam cada tela. Ligue ou desligue pelo botão Guia no topo." },
];

function jaViu(usuarioId: string) {
  try {
    return (localStorage.getItem(CHAVE_VISTO) || "").split("|").includes(usuarioId);
  } catch {
    return true;
  }
}

function marcarVisto(usuarioId: string) {
  try {
    const vistos = new Set((localStorage.getItem(CHAVE_VISTO) || "").split("|").filter(Boolean));
    vistos.add(usuarioId);
    localStorage.setItem(CHAVE_VISTO, [...vistos].slice(-30).join("|"));
  } catch {
    /* ignore */
  }
}

/** "Novidades da V2": aparece uma vez por usuário e pode ser reaberto pelo menu da conta. */
export function NovidadesV2() {
  const usuario = useUsuarioLogado();
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const abrir = () => setAberto(true);
    window.addEventListener(EVENTO_ABRIR_NOVIDADES, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_NOVIDADES, abrir);
  }, []);

  useEffect(() => {
    if (!usuario || jaViu(usuario.id)) return;
    const id = setTimeout(() => setAberto(true), 800);
    return () => clearTimeout(id);
  }, [usuario]);

  const fechar = () => {
    if (usuario) marcarVisto(usuario.id);
    setAberto(false);
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => (v ? setAberto(true) : fechar())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="size-5 text-sutil" /> Bem-vindo à V2 do SGM
          </DialogTitle>
          <DialogDescription>O que mudou nesta versão:</DialogDescription>
        </DialogHeader>
        <ul className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {ITENS.map(({ icone: Icone, titulo, texto }) => (
            <li key={titulo} className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-card text-foreground">
                <Icone className="size-[18px]" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{titulo}</span>
                <span className="block text-sm text-muted-foreground">{texto}</span>
              </span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={fechar} className="w-full sm:w-auto">Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
