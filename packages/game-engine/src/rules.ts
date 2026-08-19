import type { GameRules } from "./types";

/**
 * Rules v1 — mirrors supabase/seed.sql `game_rule_versions`. The server reads rules from the
 * database; this constant is for UI previews and tests. `scripts/check-rules-sync.mjs` guards drift.
 */
export const RULES_V1: GameRules = {
  version: 1,
  xp: {
    primary_quest: 60,
    side_quest: 15,
    reflection: 10,
    personal_record: 25,
    weekly_consistency: 100,
    challenge_pass: 150,
    promotion_boss: 500,
    dailyCap: 120,
  },
  coins: {
    primary_quest: 10,
    side_quest: 3,
    reflection: 2,
    personal_record: 5,
    weekly_consistency: 20,
    challenge_pass: 30,
    promotion_boss: 100,
  },
  levels: { maxLevel: 100, base: 40, exponent: 1.8 },
  weeklyContribution: { perDay: 20, maxDaysCounted: 6, weeklyCap: 120 },
};

/** Sources subject to the ordinary daily cap. Milestone XP is separate and uncapped. */
export const DAILY_CAPPED_SOURCES = ["primary_quest", "side_quest", "reflection", "personal_record"] as const;
