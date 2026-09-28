// Feedback sonoro gerado via Web Audio (não depende de arquivos .mp3 no /public).

type TipoSom = "sucesso" | "erro" | "alerta";

let contexto: AudioContext | null = null;

function obterContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!contexto) contexto = new Ctor();
  if (contexto.state === "suspended") contexto.resume().catch(() => {});
  return contexto;
}

function tom(ctx: AudioContext, frequencia: number, inicio: number, duracao: number, volume = 0.15, forma: OscillatorType = "sine") {
  const osc = ctx.createOscillator();
  const ganho = ctx.createGain();
  osc.type = forma;
  osc.frequency.value = frequencia;
  ganho.gain.setValueAtTime(volume, ctx.currentTime + inicio);
  ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + duracao);
  osc.connect(ganho).connect(ctx.destination);
  osc.start(ctx.currentTime + inicio);
  osc.stop(ctx.currentTime + inicio + duracao + 0.02);
}

export function tocarSom(tipo: TipoSom = "sucesso") {
  try {
    const ctx = obterContexto();
    if (!ctx) return;
    if (tipo === "sucesso") {
      tom(ctx, 880, 0, 0.12);
      tom(ctx, 1320, 0.12, 0.12);
    } else if (tipo === "erro") {
      tom(ctx, 220, 0, 0.25, 0.2, "square");
      tom(ctx, 180, 0.28, 0.3, 0.2, "square");
    } else {
      tom(ctx, 660, 0, 0.15, 0.18, "triangle");
      tom(ctx, 660, 0.25, 0.15, 0.18, "triangle");
      tom(ctx, 990, 0.5, 0.25, 0.18, "triangle");
    }
  } catch {
    // Som é apenas um reforço; nunca deve interromper o fluxo.
  }
}
