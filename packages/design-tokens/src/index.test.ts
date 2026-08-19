import { describe, expect, it } from "vitest";
import { darkColors, lightColors } from "./index";
import { contrastRatio } from "./contrast";

describe("WCAG AA contrast (4.5:1 body text)", () => {
  it("dark: text and muted text on background and surface", () => {
    for (const bg of [darkColors.background, darkColors.surface, darkColors.surfaceElevated]) {
      expect(contrastRatio(darkColors.text, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(darkColors.textMuted, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("dark: bronze progress readable on surfaces", () => {
    expect(contrastRatio(darkColors.progress, darkColors.surface)).toBeGreaterThanOrEqual(4.5);
  });
  it("light: text on parchment", () => {
    expect(contrastRatio(lightColors.text, lightColors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(lightColors.textMuted, lightColors.background)).toBeGreaterThanOrEqual(4.5);
  });
});
