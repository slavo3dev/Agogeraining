/**
 * LOCAL DEMO MODE — DEV BUILDS ONLY. A single-device simulation of the server rules using the same
 * pure packages (game-engine, campaigns). Nothing here touches Supabase, leaderboards or real accounts, and
 * the UI labels it as a demo everywhere. A production build never enables it (see config/env.ts).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AGOGE_9, addDays, applyQualifyingActivity, localDateFor, newCampaign, weekDays, type CampaignProgress } from "@agogeraining/campaigns";
import { validateGoalDraft } from "@agogeraining/challenges";
import {
  RANK_META, RANK_REQUIREMENTS_V1, RULES_V1, calculateQuestReward, evaluateQuestCompletion, evaluateRankEligibility, evaluateTrial,
  isDailyCapped, levelForTotalXp, type QuestSpec, type XpSourceType,
} from "@agogeraining/game-engine";
import type {
  AttemptResult, ChallengeRow, CommandCenter, MeasurementRow, MutationResult, NewReward, PromotionEvaluation, ReflectionRow, WorkoutRow,
} from "@agogeraining/shared-types";
import { convert, type Unit } from "@agogeraining/training";
import { ApiError, type GameApi } from "./types";

const KEY = "agogeraining.demo.v1";
/** Read synchronously by the UI to compute the simulated "today". */
export const demoClock = { offsetDays: 0 };
type Ledger = { source: XpSourceType; sourceId: string; xp: number; coins: number; localDay: string; at: string };
interface State {
  profile: { displayName: string; avatarId: string } | null;
  unitSystem: "metric" | "imperial";
  timezone: string;
  campaign: (CampaignProgress & { sides: string[] }) | null;
  workouts: Array<WorkoutRow & { key: string }>;
  ledger: Ledger[];
  rankKey: string;
  challenges: Array<ChallengeRow & { attemptKeys: string[]; resolvedAttemptValue?: number }>;
  measurements: MeasurementRow[];
  reflections: ReflectionRow[];
  offsetDays: number;
}
const fresh = (): State => ({ profile: null, unitSystem: "metric", timezone: "UTC", campaign: null, workouts: [], ledger: [], rankKey: "agoge_trainee", challenges: [], measurements: [], reflections: [], offsetDays: 0 });

let cache: State | null = null;
async function load(): Promise<State> {
  if (cache) return cache;
  const raw = await AsyncStorage.getItem(KEY);
  cache = raw ? ({ ...fresh(), ...(JSON.parse(raw) as State) }) : fresh();
  demoClock.offsetDays = cache.offsetDays;
  return cache;
}
const save = async (s: State) => { cache = s; demoClock.offsetDays = s.offsetDays; await AsyncStorage.setItem(KEY, JSON.stringify(s)); };
const id = () => `demo-${Math.random().toString(36).slice(2, 10)}`;

const nowDate = (s: State) => new Date(Date.now() + s.offsetDays * 86_400_000);
const today = (s: State) => localDateFor(nowDate(s), s.timezone);
const xpTotal = (s: State) => s.ledger.reduce((a, l) => a + l.xp, 0);
const coinTotal = (s: State) => s.ledger.reduce((a, l) => a + l.coins, 0);
const rankName = (k: string) => RANK_META.find((r) => r.rankKey === k)?.name ?? k;

function playerState(s: State): MutationResult["playerState"] {
  const xp = xpTotal(s);
  return { lifetimeXp: xp, level: levelForTotalXp(xp), coins: coinTotal(s), rankKey: s.rankKey, qualifiedDays: s.campaign?.records.length ?? 0, campaignState: s.campaign?.state ?? "none" };
}

function award(s: State, source: XpSourceType, sourceId: string, localDay: string): { xp: number; coins: number } {
  if (s.ledger.some((l) => l.source === source && l.sourceId === sourceId)) return { xp: 0, coins: 0 };
  const used = s.ledger.filter((l) => l.localDay === localDay && isDailyCapped(l.source)).reduce((a, l) => a + l.xp, 0);
  const r = calculateQuestReward(source, RULES_V1, used);
  s.ledger.push({ source, sourceId, xp: r.xp, coins: r.coins, localDay, at: nowDate(s).toISOString() });
  return { xp: r.xp, coins: r.coins };
}

function rewards(before: number, s: State, xp: number, coins: number, extra: NewReward[] = []): NewReward[] {
  const out = [...extra];
  if (xp > 0) out.push({ kind: "xp", amount: xp, label: `+${xp} XP`, accessibleText: `You earned ${xp} experience points.` });
  if (coins > 0) out.push({ kind: "coins", amount: coins, label: `+${coins} coins`, accessibleText: `You earned ${coins} coins.` });
  const level = levelForTotalXp(xpTotal(s));
  if (level > before) out.push({ kind: "level_up", amount: level, label: `Level ${level}`, accessibleText: `You reached level ${level}.` });
  return out;
}

function spec(day: number): QuestSpec | null {
  const d = AGOGE_9[day - 1];
  return d ? { kind: "primary", type: d.primary.type as QuestSpec["type"], allowedActivityTypes: d.primary.allowedActivityTypes, minDurationSeconds: d.primary.minDurationSeconds } : null;
}
function promotionEval(s: State, rankKey: string): PromotionEvaluation {
  const meta = RANK_META.find((r) => r.rankKey === rankKey);
  const cur = RANK_META.find((r) => r.rankKey === s.rankKey)!;
  if (!meta) return { eligible: false, missing: ["unknown_rank"] };
  if (meta.ordinal <= cur.ordinal) return { eligible: false, missing: ["already_earned"] };
  const req = RANK_REQUIREMENTS_V1.find((r) => r.rankKey === rankKey)!;
  const passed = s.challenges.some((c) => c.linkedRankKey === rankKey && c.state === "passed");
  const e = evaluateRankEligibility({ qualifiedDays: s.campaign?.records.length ?? 0, lifetimeXp: xpTotal(s), passedTrialEvidence: passed ? "self_reported" : null }, req);
  const missing: string[] = [...e.missing];
  if (meta.ordinal !== cur.ordinal + 1) missing.push("not_next_rank");
  return { eligible: missing.length === 0, missing, qualifiedDays: s.campaign?.records.length ?? 0, lifetimeXp: xpTotal(s), requiredDays: req.minQualifiedDays, requiredXp: req.minLifetimeXp, rankKey, rankName: meta.name };
}

export const demoApi: GameApi & { advanceDay(): Promise<void>; reset(): Promise<void> } = {
  mode: "demo",
  async advanceDay() { const s = await load(); s.offsetDays += 1; await save(s); },
  async reset() { cache = fresh(); demoClock.offsetDays = 0; await AsyncStorage.removeItem(KEY); },
  async hasProfile() { return (await load()).profile !== null; },
  async createProfile(i) { const s = await load(); s.profile = { displayName: i.displayName, avatarId: i.avatarId }; s.unitSystem = i.unitSystem; s.timezone = i.timezone; await save(s); },
  async recordConsent() { /* demo stores no consents */ },
  async enroll(i) { const s = await load(); if (!s.campaign) s.campaign = { ...newCampaign(9), sides: [] }; void i; await save(s); },

  async getCommandCenter(localDate) {
    const s = await load();
    if (!s.profile) throw new ApiError("profile_required");
    const c = s.campaign;
    const rec = c?.records.find((r) => r.localDate === localDate);
    const programDay = c ? rec?.programDay ?? Math.min(c.records.length + 1, 9) : 0;
    const d = AGOGE_9[programDay - 1];
    const idx = RANK_META.findIndex((r) => r.rankKey === s.rankKey);
    const nextKey = RANK_META[idx + 1]?.rankKey;
    return {
      player: playerState(s),
      profile: { displayName: s.profile.displayName, avatarId: s.profile.avatarId, rankName: rankName(s.rankKey) },
      campaign: c && d ? {
        id: "demo", state: c.state, qualifiedDays: c.records.length, totalDays: 9, programDay, qualifiedToday: !!rec,
        day: { title: d.title, description: d.description, focus: d.focus, spec: { primary: d.primary, theme: d.theme, alternatives: d.alternatives } },
        sideQuests: d.side.map((q, i) => ({ ...q, index: i, completed: q.type === "reflection" ? s.reflections.some((r) => r.localDate === localDate) : s.ledger.some((l) => l.source === "side_quest" && l.sourceId === `${programDay}:${i}`) })),
      } : null,
      nextRank: nextKey ? promotionEval(s, nextKey) : null,
      recentXp: s.ledger.slice(-5).reverse().map((l) => ({ source: l.source, xp: l.xp, at: l.at })),
    } satisfies CommandCenter;
  },

  async completeWorkout(i) {
    const s = await load();
    if (s.workouts.some((w) => w.key === i.idempotencyKey)) return { playerState: playerState(s), newRewards: [], duplicate: true };
    const t = today(s);
    if (i.localDay > t || i.localDay < addDays(t, -1)) throw new ApiError("local_day_out_of_range");
    const before = levelForTotalXp(xpTotal(s));
    s.workouts.push({ key: i.idempotencyKey, id: id(), activityType: i.activityType, startedAt: i.startedAt, localDay: i.localDay, durationSeconds: i.durationSeconds, distanceM: i.distanceM ?? null, rpe: i.rpe ?? null });
    let xp = 0, coins = 0; const extra: NewReward[] = [];
    const c = s.campaign;
    if (c && c.state === "active") {
      const act = { activityType: i.activityType, durationSeconds: i.durationSeconds, status: "completed" as const, origin: "manual" };
      const existing = c.records.find((r) => r.localDate === i.localDay);
      if (!existing) {
        const next = c.records.length + 1; const q = spec(next);
        if (q && evaluateQuestCompletion(q, act).completed) {
          const r = applyQualifyingActivity(c, i.localDay);
          s.campaign = { ...r.progress, sides: c.sides };
          const a = award(s, "primary_quest", `day:${next}`, i.localDay); xp += a.xp; coins += a.coins;
          extra.push({ kind: "campaign_day", amount: next, label: `Day ${next} complete`, accessibleText: `Program day ${next} of 9 complete.` });
          const wk = new Set(weekDays(i.localDay)); const inWeek = s.campaign.records.filter((r2) => wk.has(r2.localDate)).length;
          if (inWeek >= 5) { const w = award(s, "weekly_consistency", `week:${weekDays(i.localDay)[0]}`, i.localDay); xp += w.xp; coins += w.coins; }
        }
      } else {
        AGOGE_9[existing.programDay - 1]?.side.forEach((sd, idx) => {
          if (sd.type !== "reflection" && evaluateQuestCompletion({ kind: "side", type: sd.type as QuestSpec["type"], allowedActivityTypes: sd.allowedActivityTypes, minDurationSeconds: sd.minDurationSeconds }, act).completed) {
            const a = award(s, "side_quest", `${existing.programDay}:${idx}`, i.localDay); xp += a.xp; coins += a.coins;
          }
        });
      }
    }
    await save(s);
    return { playerState: playerState(s), newRewards: rewards(before, s, xp, coins, extra), duplicate: false };
  },
  async listWorkouts() { return (await load()).workouts.map(({ key: _k, ...w }) => w).reverse(); },

  async recordReflection(localDate, promptKey, text) {
    const s = await load(); const before = levelForTotalXp(xpTotal(s));
    const i = s.reflections.findIndex((r) => r.localDate === localDate);
    if (i >= 0) s.reflections[i] = { localDate, promptKey, body: text }; else s.reflections.push({ localDate, promptKey, body: text });
    const a = award(s, "reflection", `reflection:${localDate}`, localDate);
    await save(s);
    return { playerState: playerState(s), newRewards: rewards(before, s, a.xp, a.coins), duplicate: a.xp === 0 && a.coins === 0 };
  },
  async listReflections() { return [...(await load()).reflections].sort((a, b) => b.localDate.localeCompare(a.localDate)); },

  async recordMeasurement(i) {
    const s = await load();
    const unit = i.unit as Unit | "cm" | "in" | "percent";
    const value = i.unit === "lb" ? convert(i.value, "lb", "kg") : i.unit === "in" ? i.value * 2.54 : i.value;
    const canonical = i.unit === "lb" ? "kg" : i.unit === "in" ? "cm" : unit;
    s.measurements.push({ id: id(), measuredAt: i.measuredAt, metricType: i.metricType, value: Math.round(value * 100) / 100, unit: canonical });
    await save(s);
  },
  async listMeasurements() { return [...(await load()).measurements].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)); },

  async createChallenge(i) {
    const s = await load();
    const issues = validateGoalDraft({ metric: i.metric, baseline: i.baseline, target: i.target, direction: i.direction, startDate: today(s), dueDate: i.dueDate });
    if (issues.includes("due_before_start")) throw new ApiError("due_before_start");
    if (issues.includes("target_more_than_double_baseline_consider_smaller_step")) throw new ApiError("target_implausible_choose_smaller_step");
    const cid = id();
    s.challenges.unshift({ id: cid, title: i.title, metric: i.metric, direction: i.direction, baseline: i.baseline ?? null, target: i.target, unit: i.unit, dueDate: i.dueDate, state: "active", linkedRankKey: i.linkedRankKey ?? null, passRule: i.passRule, evidenceLevel: null, attemptKeys: [] });
    await save(s);
    return cid;
  },
  async listChallenges() { return (await load()).challenges.map(({ attemptKeys: _a, resolvedAttemptValue: _r, ...c }) => c); },
  async submitAttempt(challengeId, value, unit, key): Promise<AttemptResult> {
    const s = await load(); const ch = s.challenges.find((c) => c.id === challengeId);
    if (!ch) throw new ApiError("challenge_not_found");
    if (ch.attemptKeys.includes(key)) return { playerState: playerState(s), newRewards: [], duplicate: true, outcome: ch.state };
    if (ch.state !== "active") throw new ApiError("challenge_not_active");
    ch.attemptKeys.push(key);
    const before = levelForTotalXp(xpTotal(s));
    const result = evaluateTrial({ value, unit: unit as Unit }, { metric: ch.metric, direction: ch.direction, target: ch.target, unit: ch.unit as Unit, baseline: ch.baseline ?? undefined, passRule: ch.passRule }, { status: "verified" });
    if (result.outcome === "invalid") throw new ApiError("unit_mismatch");
    let xp = 0, coins = 0;
    if (result.outcome === "passed") { ch.state = "passed"; ch.evidenceLevel = "self_reported"; const a = award(s, "challenge_pass", ch.id, today(s)); xp = a.xp; coins = a.coins; }
    else ch.state = "failed";
    await save(s);
    return { playerState: playerState(s), newRewards: rewards(before, s, xp, coins), duplicate: false, outcome: ch.state };
  },
  async retryChallenge(cid) { const s = await load(); const c = s.challenges.find((x) => x.id === cid && x.state === "failed"); if (!c) throw new ApiError("challenge_not_retryable"); c.state = "active"; await save(s); },

  async evaluatePromotion(rankKey) { return promotionEval(await load(), rankKey); },
  async claimPromotion(rankKey) {
    const s = await load();
    if (RANK_META.findIndex((r) => r.rankKey === rankKey) <= RANK_META.findIndex((r) => r.rankKey === s.rankKey)) return { playerState: playerState(s), newRewards: [], duplicate: true };
    const ev = promotionEval(s, rankKey);
    if (!ev.eligible) throw new ApiError("promotion_not_eligible", `promotion_not_eligible: ${ev.missing.join(",")}`);
    const before = levelForTotalXp(xpTotal(s));
    s.rankKey = rankKey;
    const a = award(s, "promotion_boss", `promotion:${rankKey}`, today(s));
    await save(s);
    return { playerState: playerState(s), duplicate: false, newRewards: rewards(before, s, a.xp, a.coins, [{ kind: "rank_unlocked", label: rankName(rankKey), accessibleText: `You have been promoted to ${rankName(rankKey)}.` }]) };
  },
  async getSettings() { const s = await load(); return { timezone: s.timezone, unitSystem: s.unitSystem }; },
  async exportMyData() { return load(); },
  async signOut() { /* handled by session store */ },
};
