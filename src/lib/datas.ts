// Utilitários de data/hora sempre no fuso LOCAL do dispositivo.
// Evita o erro clássico de usar `toISOString().split('T')[0]`, que devolve a data em UTC
// (no Brasil, após as 21h o "hoje" em UTC já é o dia seguinte).

/** Meia-noite local do dia informado. */
export function inicioDoDia(data: Date = new Date()): Date {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Meia-noite local de hoje em ISO (UTC), pronta para filtros `gte` no Supabase. */
export function inicioDoDiaISO(data: Date = new Date()): string {
  return inicioDoDia(data).toISOString();
}

/** Primeiro dia do mês local, 00:00, em ISO. */
export function inicioDoMesISO(data: Date = new Date()): string {
  return new Date(data.getFullYear(), data.getMonth(), 1).toISOString();
}

/**
 * Converte "yyyy-MM-dd" (valor de <input type="date">) no início ou fim desse dia
 * no fuso local, em ISO.
 */
export function dataInputParaISO(valor: string, fimDoDia = false): string {
  const [ano, mes, dia] = valor.split("-").map(Number);
  const d = fimDoDia ? new Date(ano, mes - 1, dia, 23, 59, 59, 999) : new Date(ano, mes - 1, dia, 0, 0, 0, 0);
  return d.toISOString();
}

export function minutosDesde(iso?: string | null, agora: number = Date.now()): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((agora - t) / 60000));
}

/** "45 min", "2h 05min", "3d 4h". */
export function formatarDuracaoMin(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos < 0) return "—";
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h ${String(Math.round(minutos % 60)).padStart(2, "0")}min`;
  const dias = Math.floor(horas / 24);
  return `${dias}d ${horas % 24}h`;
}

/** Cronômetro "mm:ss" (ou "h:mm:ss" acima de uma hora). */
export function formatarCronometro(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
}
