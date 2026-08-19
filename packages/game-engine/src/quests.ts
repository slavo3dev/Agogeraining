import { DAILY_CAPPED_SOURCES, RULES_V1 } from "./rules";
import type {
  CompletedActivity, GameRules, QuestCompletion, QuestSpec, RewardResult, XpSourceType,
} from "./types";

export function evaluateQuestCompletion(
  quest: QuestSpec,
  activity: CompletedActivity,
  _rules: GameRules = RULES_V1,
): QuestCompletion {
  if (activity.status !== "completed") return { completed: false, reason: "not_finished" };
  if (!quest.allowedActivityTypes.includes(activity.activityType)) return { completed: false, reason: "wrong_activity" };
  if (activity.durationSeconds < quest.minDurationSeconds) return { completed: false, reason: "too_short" };
  return { completed: true };
}

export function isDailyCapped(source: XpSourceType): boolean {
  return (DAILY_CAPPED_SOURCES as readonly string[]).includes(source);
}

/**
 * Reward for a completion. `xpAlreadyAwardedToday` counts only capped sources already
 * in today's ledger. Milestone sources bypass the cap.
 */
export function calculateQuestReward(
  source: XpSourceType,
  rules: GameRules = RULES_V1,
  xpAlreadyAwardedToday = 0,
): RewardResult {
  const uncappedXp = rules.xp[source];
  const coins = rules.coins[source];
  if (!isDailyCapped(source)) return { xp: uncappedXp, coins, uncappedXp, cappedByDailyLimit: false };
  const room = Math.max(0, rules.xp.dailyCap - xpAlreadyAwardedToday);
  const xp = Math.min(uncappedXp, room);
  return { xp, coins: xp === 0 ? 0 : coins, uncappedXp, cappedByDailyLimit: xp < uncappedXp };
}

/** A program day qualifies when any completed activity satisfies the day's primary quest. */
export function qualifiesAsCampaignDay(primary: QuestSpec, completedActivities: CompletedActivity[]): boolean {
  return completedActivities.some((a) => evaluateQuestCompletion(primary, a).completed);
}

export function calculateWeeklyContribution(
  events: Array<{ localDay: string; questsCompleted: number }>,
  rules: GameRules = RULES_V1,
): number {
  const { perDay, maxDaysCounted, weeklyCap } = rules.weeklyContribution;
  const activeDays = new Set(events.filter((e) => e.questsCompleted > 0).map((e) => e.localDay)).size;
  return Math.min(weeklyCap, Math.min(activeDays, maxDaysCounted) * perDay);
}
