export * from "./contrast";
/** Centralised brand token. "Spartan Levels" is a working title pending trademark review. */
export const BRAND = {
  name: "Spartan Levels",
  tagline: "Train in the real world. Level up in the game.",
  trademarkCleared: false,
} as const;

export const colors = {
  obsidian: "#0D1016",
  charcoal: "#1A2029",
  charcoalElevated: "#252C36",
  spartanCrimson: "#942D3D",
  bronze: "#B68A50",
  antiqueGold: "#D9B56D",
  marbleIvory: "#F1E9DA",
  stoneMuted: "#AFB0AD",
  olive: "#647554",
  danger: "#C45151",
  parchment: "#E8DECA",
} as const;
export type ColorToken = keyof typeof colors;

export const lightColors = {
  background: colors.parchment,
  surface: "#F4EDDD",
  surfaceElevated: "#FBF7EC",
  text: "#1D1A15",
  textMuted: "#5A554B",
  primary: "#7E2434",
  progress: "#8A6431",
  recovery: "#4A5A3C",
  danger: "#9E2F2F",
} as const;

export const darkColors = {
  background: colors.obsidian,
  surface: colors.charcoal,
  surfaceElevated: colors.charcoalElevated,
  text: colors.marbleIvory,
  textMuted: colors.stoneMuted,
  primary: colors.spartanCrimson,
  progress: colors.bronze,
  recovery: colors.olive,
  danger: colors.danger,
} as const;
export type ThemeColors = { [K in keyof typeof darkColors]: string };

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { sm: 6, md: 12, lg: 20 } as const;
export const minTouchTarget = 44;

export const typography = {
  display: { family: "serif", weight: "700" as const },
  body: { family: "System", weight: "400" as const },
  sizes: { caption: 12, body: 16, title: 20, headline: 28, hero: 36 },
} as const;
