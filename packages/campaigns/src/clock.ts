export interface Clock { now(): Date }
export const systemClock: Clock = { now: () => new Date() };
export function fixedClock(iso: string): Clock {
  const d = new Date(iso);
  return { now: () => new Date(d) };
}

/** YYYY-MM-DD for an instant as seen in an IANA timezone. DST- and travel-safe (computed per instant). */
export function localDateFor(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const ms = (s: string) => Date.parse(`${s}T00:00:00Z`);
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

/** The 7 local dates (Mon..Sun) containing `localDate`. */
export function weekDays(localDate: string): string[] {
  const dow = (new Date(`${localDate}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon=0
  const monday = addDays(localDate, -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
