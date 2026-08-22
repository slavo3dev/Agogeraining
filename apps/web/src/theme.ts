import { darkColors, lightColors } from "@agogeraining/design-tokens";
import { create } from "zustand";

export type SchemePref = "dark" | "light" | "system";
interface Prefs { scheme: SchemePref; reducedMotionOverride: boolean; set: (p: Partial<Pick<Prefs, "scheme" | "reducedMotionOverride">>) => void }
const KEY = "agogeraining.prefs.v1";

function read(): Partial<Prefs> {
  try { return typeof window === "undefined" ? {} : (JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>); } catch { return {}; }
}
export const usePrefs = create<Prefs>((set, get) => ({
  scheme: "dark", // dark-mode-first, same as mobile
  reducedMotionOverride: false,
  set: (p) => {
    set(p);
    const { scheme, reducedMotionOverride } = get();
    try { window.localStorage.setItem(KEY, JSON.stringify({ scheme, reducedMotionOverride })); } catch { /* private mode */ }
  },
}));
export function loadPrefs() { usePrefs.setState(read()); }

/** Design tokens → CSS custom properties (single source of truth: @agogeraining/design-tokens). */
const vars = (c: Record<string, string>) => Object.entries(c).map(([k, v]) => `--${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v};`).join("");
export const themeCss =
  `:root,[data-theme="dark"]{${vars(darkColors)}color-scheme:dark}` +
  `[data-theme="light"]{${vars(lightColors)}color-scheme:light}` +
  `@media (prefers-color-scheme: light){[data-theme="system"]{${vars(lightColors)}color-scheme:light}}`;
