import { RULES_V1 } from "./rules";
import type { GameRules } from "./types";

/** Cumulative XP needed to *reach* `level`. Level 1 = 0. Early levels fast, later levels slower. */
export function xpToReachLevel(level: number, rules: GameRules = RULES_V1): number {
  const { maxLevel, base, exponent } = rules.levels;
  const l = Math.min(Math.max(Math.floor(level), 1), maxLevel);
  return Math.round(base * Math.pow(l - 1, exponent));
}

export function levelForTotalXp(totalXp: number, rules: GameRules = RULES_V1): number {
  const xp = Math.max(0, totalXp);
  let lo = 1;
  let hi = rules.levels.maxLevel;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (xpToReachLevel(mid, rules) <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function levelProgress(totalXp: number, rules: GameRules = RULES_V1) {
  const level = levelForTotalXp(totalXp, rules);
  const floor = xpToReachLevel(level, rules);
  if (level >= rules.levels.maxLevel) return { level, xpIntoLevel: totalXp - floor, xpForNext: 0, fraction: 1 };
  const next = xpToReachLevel(level + 1, rules);
  return { level, xpIntoLevel: totalXp - floor, xpForNext: next - floor, fraction: (totalXp - floor) / (next - floor) };
}
