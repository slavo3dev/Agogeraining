import { localDateFor } from "@agogeraining/campaigns";
import { demoClock } from "./api/demo";
import { useSession } from "./session";

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
/** "Now" for the app. Equals the real clock except in demo mode, where the dev can step days forward. */
export function appNow(): Date {
  const demo = useSession.getState().mode === "demo";
  return new Date(Date.now() + (demo ? demoClock.offsetDays * 86_400_000 : 0));
}
export function todayLocal(now: Date = appNow(), tz: string = deviceTimeZone()): string {
  return localDateFor(now, tz);
}
export function formatLocalDate(localDate: string, locale?: string): string {
  const [y, m, d] = localDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}
