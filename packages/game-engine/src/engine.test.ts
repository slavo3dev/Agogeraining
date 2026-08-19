import { describe, expect, it } from "vitest";
import {
  RULES_V1, RANK_REQUIREMENTS_V1, calculateQuestReward, calculateWeeklyContribution, evaluateQuestCompletion,
  evaluateRankEligibility, evaluateTrial, levelForTotalXp, levelProgress, qualifiesAsCampaignDay, xpToReachLevel,
} from "./index";
import type { QuestSpec } from "./types";

describe("levels", () => {
  it("level 1 needs 0 XP and thresholds are strictly increasing (monotonic)", () => {
    expect(xpToReachLevel(1)).toBe(0);
    for (let l = 2; l <= 100; l++) expect(xpToReachLevel(l)).toBeGreaterThan(xpToReachLevel(l - 1));
  });
  it("early levels are faster than later ones", () => {
    const early = xpToReachLevel(3) - xpToReachLevel(2);
    const late = xpToReachLevel(100) - xpToReachLevel(99);
    expect(late).toBeGreaterThan(early * 10);
  });
  it("level boundaries: exactly at and one below threshold", () => {
    for (let l = 2; l <= 100; l++) {
      const t = xpToReachLevel(l);
      expect(levelForTotalXp(t)).toBe(l);
      expect(levelForTotalXp(t - 1)).toBe(l - 1);
    }
  });
  it("clamps: negative XP is level 1, huge XP is max level", () => {
    expect(levelForTotalXp(-50)).toBe(1);
    expect(levelForTotalXp(1e12)).toBe(100);
  });
  it("level is monotonic in XP", () => {
    let prev = 1;
    for (let xp = 0; xp < 5000; xp += 7) {
      const l = levelForTotalXp(xp);
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
  });
  it("progress fraction is within [0,1)", () => {
    const p = levelProgress(100);
    expect(p.fraction).toBeGreaterThanOrEqual(0);
    expect(p.fraction).toBeLessThan(1);
    expect(levelProgress(1e9).fraction).toBe(1);
  });
  it("the first nine days of ordinary XP land the player at a sane early level", () => {
    expect(levelForTotalXp(9 * 60)).toBeGreaterThanOrEqual(3);
    expect(levelForTotalXp(9 * 60)).toBeLessThan(10);
  });
});

const strengthQuest: QuestSpec = { kind: "primary", type: "strength", allowedActivityTypes: ["strength", "obstacle"], minDurationSeconds: 900 };
const recoveryQuest: QuestSpec = { kind: "primary", type: "recovery", allowedActivityTypes: ["recovery", "mobility", "walking"], minDurationSeconds: 0 };

describe("quest completion", () => {
  it("accepts an equivalent activity", () => {
    expect(evaluateQuestCompletion(strengthQuest, { activityType: "obstacle", durationSeconds: 1200, status: "completed", origin: "manual" }).completed).toBe(true);
  });
  it("rejects wrong activity, too-short and drafts", () => {
    expect(evaluateQuestCompletion(strengthQuest, { activityType: "running", durationSeconds: 1200, status: "completed", origin: "manual" }).reason).toBe("wrong_activity");
    expect(evaluateQuestCompletion(strengthQuest, { activityType: "strength", durationSeconds: 60, status: "completed", origin: "manual" }).reason).toBe("too_short");
    expect(evaluateQuestCompletion(strengthQuest, { activityType: "strength", durationSeconds: 1200, status: "draft", origin: "manual" }).reason).toBe("not_finished");
  });
  it("planned recovery counts as a qualifying day", () => {
    expect(qualifiesAsCampaignDay(recoveryQuest, [{ activityType: "recovery", durationSeconds: 0, status: "completed", origin: "manual" }])).toBe(true);
  });
  it("no activities means no qualification", () => {
    expect(qualifiesAsCampaignDay(strengthQuest, [])).toBe(false);
  });
});

describe("rewards and daily cap", () => {
  it("uses the specified base values", () => {
    expect(calculateQuestReward("primary_quest").xp).toBe(60);
    expect(calculateQuestReward("side_quest").xp).toBe(15);
    expect(calculateQuestReward("reflection").xp).toBe(10);
    expect(calculateQuestReward("personal_record").xp).toBe(25);
    expect(calculateQuestReward("weekly_consistency").xp).toBe(100);
    expect(calculateQuestReward("challenge_pass").xp).toBe(150);
    expect(calculateQuestReward("promotion_boss").xp).toBe(500);
  });
  it("caps ordinary XP at 120/day, partially awarding the last item", () => {
    const r = calculateQuestReward("side_quest", RULES_V1, 110);
    expect(r.xp).toBe(10);
    expect(r.cappedByDailyLimit).toBe(true);
    expect(calculateQuestReward("side_quest", RULES_V1, 120).xp).toBe(0);
    expect(calculateQuestReward("side_quest", RULES_V1, 120).coins).toBe(0);
  });
  it("milestone XP ignores the daily cap", () => {
    expect(calculateQuestReward("promotion_boss", RULES_V1, 120).xp).toBe(500);
    expect(calculateQuestReward("challenge_pass", RULES_V1, 999).cappedByDailyLimit).toBe(false);
  });
  it("max ordinary day is exactly the cap", () => {
    let awarded = 0;
    for (const s of ["primary_quest", "side_quest", "side_quest", "side_quest", "reflection", "personal_record"] as const) {
      awarded += calculateQuestReward(s, RULES_V1, awarded).xp;
    }
    expect(awarded).toBe(120);
  });
  it("weekly contribution is capped and ignores spam on one day", () => {
    expect(calculateWeeklyContribution([{ localDay: "d1", questsCompleted: 50 }])).toBe(20);
    const sevenDays = Array.from({ length: 7 }, (_, i) => ({ localDay: `d${i}`, questsCompleted: 1 }));
    expect(calculateWeeklyContribution(sevenDays)).toBe(120);
    expect(calculateWeeklyContribution([])).toBe(0);
  });
});

describe("rank eligibility", () => {
  const hoplites = RANK_REQUIREMENTS_V1.find((r) => r.rankKey === "hoplites")!;
  const ok = { qualifiedDays: 9, lifetimeXp: 540, passedTrialEvidence: "self_reported" as const };
  it("passes when all gates met", () => expect(evaluateRankEligibility(ok, hoplites).eligible).toBe(true));
  it("rejects missing days", () => expect(evaluateRankEligibility({ ...ok, qualifiedDays: 8 }, hoplites).missing).toEqual(["qualified_days"]));
  it("rejects missing XP", () => expect(evaluateRankEligibility({ ...ok, lifetimeXp: 100 }, hoplites).missing).toEqual(["lifetime_xp"]));
  it("rejects missing/unverified trial", () => expect(evaluateRankEligibility({ ...ok, passedTrialEvidence: null }, hoplites).missing).toEqual(["trial"]));
  it("reports all missing at once", () => expect(evaluateRankEligibility({ qualifiedDays: 0, lifetimeXp: 0, passedTrialEvidence: null }, hoplites).missing).toHaveLength(3));
  it("higher gates demand stronger evidence", () => {
    const loch = RANK_REQUIREMENTS_V1.find((r) => r.rankKey === "lochagos")!;
    expect(evaluateRankEligibility({ qualifiedDays: 90, lifetimeXp: 9999, passedTrialEvidence: "self_reported" }, loch).missing).toEqual(["trial_evidence_level"]);
    expect(evaluateRankEligibility({ qualifiedDays: 90, lifetimeXp: 9999, passedTrialEvidence: "device_recorded" }, loch).eligible).toBe(true);
  });
  it("gates are ordered and never cheaper at higher ranks", () => {
    for (let i = 1; i < RANK_REQUIREMENTS_V1.length; i++) {
      expect(RANK_REQUIREMENTS_V1[i]!.minQualifiedDays).toBeGreaterThan(RANK_REQUIREMENTS_V1[i - 1]!.minQualifiedDays);
      expect(RANK_REQUIREMENTS_V1[i]!.minLifetimeXp).toBeGreaterThan(RANK_REQUIREMENTS_V1[i - 1]!.minLifetimeXp);
    }
  });
  it("Day 9 XP minimum is reachable with 9 ordinary days", () => {
    expect(9 * RULES_V1.xp.primary_quest).toBeGreaterThanOrEqual(hoplites.minLifetimeXp);
  });
});

describe("trial evaluation", () => {
  const threeMile = { metric: "run_time", direction: "lower_better" as const, target: 30, unit: "min" as const, passRule: "meet_target" as const };
  it("normalises units (3 mi run in 28:00 vs 30 min target)", () => {
    expect(evaluateTrial({ value: 1680, unit: "s" }, threeMile, { status: "verified" }).outcome).toBe("passed");
    expect(evaluateTrial({ value: 31, unit: "min" }, threeMile, { status: "verified" }).outcome).toBe("failed");
  });
  it("lb vs kg targets compare correctly", () => {
    const squat = { metric: "squat", direction: "higher_better" as const, target: 100, unit: "kg" as const, passRule: "meet_target" as const };
    expect(evaluateTrial({ value: 225, unit: "lb" }, squat, { status: "verified" }).outcome).toBe("passed"); // 102 kg
    expect(evaluateTrial({ value: 215, unit: "lb" }, squat, { status: "verified" }).outcome).toBe("failed"); // 97.5 kg
  });
  it("never passes before verification, and unit mismatch is invalid", () => {
    expect(evaluateTrial({ value: 1, unit: "min" }, threeMile, { status: "unverified" }).outcome).toBe("pending_verification");
    expect(evaluateTrial({ value: 1, unit: "kg" }, threeMile, { status: "verified" }).outcome).toBe("invalid");
    expect(evaluateTrial({ value: -1, unit: "min" }, threeMile, { status: "verified" }).outcome).toBe("invalid");
    expect(evaluateTrial({ value: 1, unit: "min" }, threeMile, { status: "rejected" }).outcome).toBe("rejected");
  });
  it("Day 9 style: improve on own baseline", () => {
    const pushups = { metric: "pushups", direction: "higher_better" as const, target: 20, unit: "reps" as const, baseline: 8, passRule: "improve_on_baseline" as const };
    expect(evaluateTrial({ value: 9, unit: "reps" }, pushups, { status: "verified" }).outcome).toBe("passed");
    expect(evaluateTrial({ value: 7, unit: "reps" }, pushups, { status: "verified" }).outcome).toBe("failed");
  });
});
