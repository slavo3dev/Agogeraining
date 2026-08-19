import type { ActivityType } from "@agogeraining/training";

export type QuestKind = "primary" | "side";
export type QuestType =
  | "strength" | "cardio" | "mobility" | "skill" | "logging" | "reflection" | "recovery" | "custom";

export type XpSourceType =
  | "primary_quest" | "side_quest" | "reflection" | "personal_record"
  | "weekly_consistency" | "challenge_pass" | "promotion_boss";

export type EvidenceLevel = "self_reported" | "device_recorded" | "admin_reviewed";

export interface GameRules {
  version: number;
  xp: Record<XpSourceType, number> & { dailyCap: number };
  coins: Record<XpSourceType, number>;
  levels: { maxLevel: number; base: number; exponent: number };
  weeklyContribution: { perDay: number; maxDaysCounted: number; weeklyCap: number };
}

export interface QuestSpec {
  kind: QuestKind;
  type: QuestType;
  /** Activity types that satisfy this quest (equivalent activities allowed). */
  allowedActivityTypes: ActivityType[];
  minDurationSeconds: number;
}

export interface CompletedActivity {
  activityType: ActivityType;
  durationSeconds: number;
  status: "completed" | "draft";
  origin: string;
}

export interface QuestCompletion {
  completed: boolean;
  reason?: "wrong_activity" | "too_short" | "not_finished";
}

export interface RewardResult {
  xp: number;
  coins: number;
  /** XP the raw rule would have granted before the daily cap. */
  uncappedXp: number;
  cappedByDailyLimit: boolean;
}

export interface RankRequirement {
  rankKey: string;
  rulesVersion: number;
  minQualifiedDays: number;
  minLifetimeXp: number;
  requiresTrial: boolean;
  minEvidenceLevel: EvidenceLevel;
}

export interface PlayerSnapshot {
  qualifiedDays: number;
  lifetimeXp: number;
  /** Highest evidence level among *verified, passed* trials linked to this gate (server-sourced). */
  passedTrialEvidence: EvidenceLevel | null;
}

export interface RankEligibility {
  eligible: boolean;
  missing: Array<"qualified_days" | "lifetime_xp" | "trial" | "trial_evidence_level">;
}
