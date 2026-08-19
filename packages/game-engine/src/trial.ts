import { dimensionOf, toBase, type Unit } from "@agogeraining/training";
import { RULES_V1 } from "./rules";
import type { GameRules } from "./types";

export interface TrialGoal {
  metric: string;
  direction: "higher_better" | "lower_better";
  target: number;
  unit: Unit;
  baseline?: number;
  /** `improve_on_baseline` compares to the player's own baseline (used for the Day 9 trial). */
  passRule: "meet_target" | "improve_on_baseline";
}
export interface TrialResult { value: number; unit: Unit }
export interface TrialVerification { status: "unverified" | "verified" | "rejected" }

export type TrialOutcome =
  | { outcome: "passed" | "failed"; reasons: string[] }
  | { outcome: "pending_verification" | "rejected" | "invalid"; reasons: string[] };

export function evaluateTrial(
  result: TrialResult,
  goal: TrialGoal,
  verification: TrialVerification,
  _rules: GameRules = RULES_V1,
): TrialOutcome {
  if (!Number.isFinite(result.value) || result.value < 0) return { outcome: "invalid", reasons: ["result_not_valid"] };
  if (dimensionOf(result.unit) !== dimensionOf(goal.unit)) return { outcome: "invalid", reasons: ["unit_mismatch"] };
  if (verification.status === "rejected") return { outcome: "rejected", reasons: ["verification_rejected"] };
  if (verification.status !== "verified") return { outcome: "pending_verification", reasons: ["awaiting_verification"] };

  const value = toBase(result.value, result.unit);
  const threshold =
    goal.passRule === "improve_on_baseline" && goal.baseline !== undefined
      ? toBase(goal.baseline, goal.unit)
      : toBase(goal.target, goal.unit);
  const improve = goal.passRule === "improve_on_baseline" && goal.baseline !== undefined; // strictly better than own baseline
  const met = goal.direction === "higher_better" ? (improve ? value > threshold : value >= threshold) : improve ? value < threshold : value <= threshold;
  return met ? { outcome: "passed", reasons: [] } : { outcome: "failed", reasons: ["target_not_met"] };
}
