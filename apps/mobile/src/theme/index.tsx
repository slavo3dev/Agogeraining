import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, darkColors, lightColors, radius, spacing, type ThemeColors } from "@agogeraining/design-tokens";
import React, { createContext, useContext, useEffect, useMemo } from "react";
import { Platform, useColorScheme } from "react-native";
import { create } from "zustand";

export type SchemePref = "dark" | "light" | "system";
interface Prefs {
  scheme: SchemePref;
  haptics: boolean;
  reducedMotionOverride: boolean;
  loaded: boolean;
  set: (p: Partial<Pick<Prefs, "scheme" | "haptics" | "reducedMotionOverride">>) => void;
}
const PREFS_KEY = "agogeraining.prefs.v1";

export const usePrefs = create<Prefs>((set, get) => ({
  scheme: "dark", // dark-mode-first
  haptics: true,
  reducedMotionOverride: false,
  loaded: false,
  set: (p) => {
    set(p);
    const { scheme, haptics, reducedMotionOverride } = get();
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ scheme, haptics, reducedMotionOverride })).catch(() => undefined);
  },
}));

export async function loadPrefs() {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (raw) usePrefs.setState({ ...(JSON.parse(raw) as object), loaded: true });
    else usePrefs.setState({ loaded: true });
  } catch { usePrefs.setState({ loaded: true }); }
}

export const fonts = {
  display: Platform.select({ ios: "Georgia", default: "serif" }) as string,
  body: undefined as string | undefined,
};

interface ThemeValue { c: ThemeColors; isDark: boolean; spacing: typeof spacing; radius: typeof radius; raw: typeof colors }
const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const pref = usePrefs((s) => s.scheme);
  useEffect(() => { void loadPrefs(); }, []);
  const isDark = pref === "system" ? system !== "light" : pref === "dark";
  const value = useMemo<ThemeValue>(() => ({ c: isDark ? darkColors : lightColors, isDark, spacing, radius, raw: colors }), [isDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error("ThemeProvider missing");
  return v;
}
