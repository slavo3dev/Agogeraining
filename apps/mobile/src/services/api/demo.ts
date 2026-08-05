/**
 * LOCAL DEMO MODE — DEV BUILDS ONLY. A single-device simulation of the server rules using the same
 * pure packages (game-engine, campaigns). Nothing here touches Supabase, leaderboards or real accounts, and
 * the UI labels it as a demo everywhere. A production build never enables it (see config/env.ts).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  JourneyError, addDays, adjustPlan, checkpointsFor, createJourney, creditDay, extendJourney, localDateFor, pauseJourney,
  planByKey, resumeJourney, sessionFor, validatePlanInputs, weekDays, type Journey, type PlanInputs,
} from "@agogeraining/campaigns";
import { validateGoalDraft } from "@agogeraining/challenges";
import {
  RANK_META, RANK_REQUIREMENTS_V1, RULES_V1, calculateQuestReward, evaluateQuestCompletion, evaluateRankEligibility, evaluateTrial,
  isDailyCapped, levelForTotalXp, type QuestSpec, type XpSourceType,
} from "@agogeraining/game-engine";
import type {
  AssessmentRow, AttemptResult, ChallengeRow, CommandCenter, GoalRow, MeasurementRow, MutationResult, NewReward, PlanChangeRow,
  PromotionEvaluation, ReflectionRow, WorkoutRow,
} from "@agogeraining/shared-types";
import { convert, type ActivityType, type Unit } from "@agogeraining/training";
import { ApiError, type GameApi } from "./types";

const KEY = "agogeraining.demo.v1";
/** Read synchronously by the UI to compute the simulated "today". */
export const demoClock = { offsetDays: 0 };
type Ledger = { source: XpSourceType; sourceId: string; xp: number; coins: number; localDay: string; at: string };
interface State {
  profile: { displayName: string; avatarId: string; primaryFocus?: string } | null;
  unitSystem: "metric" | "imperial";
  timezone: string;
  journey: Journey | null;
  journeyId: string;
  /** Credited days from earlier, finished journeys (rank gates count lifetime eligible days, like the server). */
  priorCreditedDays: number;
  workouts: Array<WorkoutRow & { key: string }>;
  ledger: Ledger[];
  rankKey: string;
  challenges: Array<ChallengeRow & { attemptKeys: string[]; resolvedAttemptValue?: number }>;
  measurements: MeasurementRow[];
  reflections: ReflectionRow[];
  goals: GoalRow[];
  assessments: Array<AssessmentRow & { journeyId: string }>;
  offsetDays: number;
  /** pre-journey demo state (migrated on load) */
  campaign?: { records: Array<{ programDay: number; localDate: string }> } | null;
}
const fresh = (): State => ({
  profile: null, unitSystem: "metric", timezone: "UTC", journey: null, journeyId: "demo-journey", priorCreditedDays: 0, workouts: [], ledger: [],
  rankKey: "agoge_trainee", challenges: [], measurements: [], reflections: [], goals: [], assessments: [], offsetDays: 0,
});

const DEFAULT_INPUTS: PlanInputs = {
  experience: "new", focus: "hybrid", availableWeekdays: [0, 2, 4], sportDays: [], sportName: null, maxSessionMinutes: 45,
  equipment: "none", hasLimitations: false, recoveryStyle: "active", eventDate: null,
};

let cache: State | null = null;
async function load(): Promise<State> {
  if (cache) return cache;
  const raw = await AsyncStorage.getItem(KEY);
  cache = raw ? ({ ...fresh(), ...(JSON.parse(raw) as State) }) : fresh();
  // migrate a pre-journey demo (fixed nine days) without losing credited days
  if (cache.campaign && !cache.journey) {
    const recs = cache.campaign.records;
    const start = recs[0]?.localDate ?? localDateFor(new Date(), cache.timezone);
    const j = createJourney("agoge-9", DEFAULT_INPUTS, start);
    cache.journey = { ...j, credited: recs.map((r) => ({ ...r, reason: "planned_training" as const })), status: recs.length >= 9 ? "completed" : "active" };
    cache.campaign = null;
  }
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
const lifetimeDays = (s: State) => s.priorCreditedDays + (s.journey?.credited.length ?? 0);

function playerState(s: State): MutationResult["playerState"] {
  const xp = xpTotal(s);
  return { lifetimeXp: xp, level: levelForTotalXp(xp), coins: coinTotal(s), rankKey: s.rankKey, qualifiedDays: lifetimeDays(s), campaignState: s.journey?.status ?? "none" };
}
const ok = (s: State, newRewards: NewReward[] = [], duplicate = false): MutationResult => ({ playerState: playerState(s), newRewards, duplicate });

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

function promotionEval(s: State, rankKey: string): PromotionEvaluation {
  const meta = RANK_META.find((r) => r.rankKey === rankKey);
  const cur = RANK_META.find((r) => r.rankKey === s.rankKey)!;
  if (!meta) return { eligible: false, missing: ["unknown_rank"] };
  if (meta.ordinal <= cur.ordinal) return { eligible: false, missing: ["already_earned"] };
  const req = RANK_REQUIREMENTS_V1.find((r) => r.rankKey === rankKey)!;
  const passed = s.challenges.some((c) => c.linkedRankKey === rankKey && c.state === "passed");
  const e = evaluateRankEligibility({ qualifiedDays: lifetimeDays(s), lifetimeXp: xpTotal(s), passedTrialEvidence: passed ? "self_reported" : null }, req);
  const missing: string[] = [...e.missing];
  if (meta.ordinal !== cur.ordinal + 1) missing.push("not_next_rank");
  return { eligible: missing.length === 0, missing, qualifiedDays: lifetimeDays(s), lifetimeXp: xpTotal(s), requiredDays: req.minQualifiedDays, requiredXp: req.minLifetimeXp, rankKey, rankName: meta.name };
}

function mapJourneyError<T>(fn: () => T): T {
  try { return fn(); } catch (e) { if (e instanceof JourneyError) throw new ApiError(e.code); throw e; }
}

function dayLabel(day: number, total: number): string {
  if (day >= total) return `Day ${day} — journey complete`;
  if (day === 3) return "Day 3 — readiness checkpoint reached";
  if ([9, 30, 60, 90, 300].includes(day)) return `Day ${day} — promotion trial unlocked`;
  return `Day ${day} complete`;
}

export const demoApi: GameApi & { advanceDay(): Promise<void>; reset(): Promise<void> } = {
  mode: "demo",
  async advanceDay() { const s = await load(); s.offsetDays += 1; await save(s); },
  async reset() { cache = fresh(); demoClock.offsetDays = 0; await AsyncStorage.removeItem(KEY); },
  async hasProfile() { return (await load()).profile !== null; },
  async createProfile(i) { const s = await load(); s.profile = { displayName: i.displayName, avatarId: i.avatarId, primaryFocus: i.primaryFocus }; s.unitSystem = i.unitSystem; s.timezone = i.timezone; await save(s); },
  async recordConsent() { /* demo stores no consents */ },

  async getCommandCenter(localDate) {
    const s = await load();
    if (!s.profile) throw new ApiError("profile_required");
    const j = s.journey;
    const idx = RANK_META.findIndex((r) => r.rankKey === s.rankKey);
    const nextKey = RANK_META[idx + 1]?.rankKey;
    let campaign: CommandCenter["campaign"] = null;
    if (j) {
      const rec = j.credited.find((r) => r.localDate === localDate);
      const programDay = rec?.programDay ?? Math.min(j.credited.length + 1, j.targetDays);
      const ses = sessionFor(j, programDay)!;
      const plan = planByKey(j.templateKey)!;
      campaign = {
        id: s.journeyId, state: j.status, qualifiedDays: j.credited.length, totalDays: j.targetDays, programDay, qualifiedToday: !!rec,
        day: { title: ses.title, description: ses.description, focus: ses.sessionType, spec: { primary: ses.primary, theme: ses.title, alternatives: ses.alternatives } },
        sideQuests: ses.side.map((q, i) => ({ ...q, index: i, completed: q.type === "reflection" ? s.reflections.some((r) => r.localDate === localDate) : s.ledger.some((l) => l.source === "side_quest" && l.sourceId === `${s.journeyId}:${programDay}:${i}`) })),
        templateKey: j.templateKey, planName: plan.name, tier: plan.tier, startDate: j.startDate, generation: j.generation, planInputs: j.inputs,
        session: ses, upcoming: j.sessions.filter((x) => x.programDay > j.credited.length).slice(0, 7),
        pendingReviews: checkpointsFor(j.targetDays).map((c) => c.day).filter((d) => d <= j.credited.length && !s.assessments.some((a) => a.journeyId === s.journeyId && a.checkpointDay === d)),
      };
    }
    return {
      player: playerState(s),
      profile: { displayName: s.profile.displayName, avatarId: s.profile.avatarId, rankName: rankName(s.rankKey) },
      campaign,
      nextRank: nextKey ? promotionEval(s, nextKey) : null,
      recentXp: s.ledger.slice(-5).reverse().map((l) => ({ source: l.source, xp: l.xp, at: l.at })),
    } satisfies CommandCenter;
  },

  async completeWorkout(i) {
    const s = await load();
    if (s.workouts.some((w) => w.key === i.idempotencyKey)) return ok(s, [], true);
    const t = today(s);
    if (i.localDay > t || i.localDay < addDays(t, -1)) throw new ApiError("local_day_out_of_range");
    const before = levelForTotalXp(xpTotal(s));
    s.workouts.push({ key: i.idempotencyKey, id: id(), activityType: i.activityType, startedAt: i.startedAt, localDay: i.localDay, durationSeconds: i.durationSeconds, distanceM: i.distanceM ?? null, rpe: i.rpe ?? null });
    let xp = 0, coins = 0; const extra: NewReward[] = [];
    const j = s.journey;
    if (j && j.status === "active") {
      const existing = j.credited.find((r) => r.localDate === i.localDay);
      const r = creditDay(j, i.localDay, { activityType: i.activityType as ActivityType, durationSeconds: i.durationSeconds });
      if (r.credited && r.programDay) {
        s.journey = r.journey;
        const a = award(s, "primary_quest", `${s.journeyId}:day:${r.programDay}`, i.localDay); xp += a.xp; coins += a.coins;
        extra.push({ kind: "campaign_day", amount: r.programDay, label: dayLabel(r.programDay, j.targetDays), accessibleText: `Program day ${r.programDay} of ${j.targetDays} complete.` });
        const wk = new Set(weekDays(i.localDay)); const inWeek = r.journey.credited.filter((c) => wk.has(c.localDate)).length;
        if (inWeek >= 5) { const w = award(s, "weekly_consistency", `${s.journeyId}:week:${weekDays(i.localDay)[0]}`, i.localDay); xp += w.xp; coins += w.coins; }
      } else if (existing) {
        const act = { activityType: i.activityType as ActivityType, durationSeconds: i.durationSeconds, status: "completed" as const, origin: "manual" };
        sessionFor(j, existing.programDay)?.side.forEach((sd, idx) => {
          if (sd.type !== "reflection" && evaluateQuestCompletion({ kind: "side", type: sd.type as QuestSpec["type"], allowedActivityTypes: sd.allowedActivityTypes, minDurationSeconds: sd.minDurationSeconds }, act).completed) {
            const a = award(s, "side_quest", `${s.journeyId}:${existing.programDay}:${idx}`, i.localDay); xp += a.xp; coins += a.coins;
          }
        });
      }
    }
    await save(s);
    return ok(s, rewards(before, s, xp, coins, extra));
  },
  async listWorkouts() { return (await load()).workouts.map(({ key: _k, ...w }) => w).reverse(); },

  async recordReflection(localDate, promptKey, text) {
    const s = await load(); const before = levelForTotalXp(xpTotal(s));
    const i = s.reflections.findIndex((r) => r.localDate === localDate);
    if (i >= 0) s.reflections[i] = { localDate, promptKey, body: text }; else s.reflections.push({ localDate, promptKey, body: text });
    const a = award(s, "reflection", `reflection:${localDate}`, localDate);
    await save(s);
    return ok(s, rewards(before, s, a.xp, a.coins), a.xp === 0 && a.coins === 0);
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
    if (RANK_META.findIndex((r) => r.rankKey === rankKey) <= RANK_META.findIndex((r) => r.rankKey === s.rankKey)) return ok(s, [], true);
    const ev = promotionEval(s, rankKey);
    if (!ev.eligible) throw new ApiError("promotion_not_eligible", `promotion_not_eligible: ${ev.missing.join(",")}`);
    const before = levelForTotalXp(xpTotal(s));
    s.rankKey = rankKey;
    const a = award(s, "promotion_boss", `promotion:${rankKey}`, today(s));
    await save(s);
    return ok(s, rewards(before, s, a.xp, a.coins, [{ kind: "rank_unlocked", label: rankName(rankKey), accessibleText: `You have been promoted to ${rankName(rankKey)}.` }]));
  },
  async getSettings() { const s = await load(); return { timezone: s.timezone, unitSystem: s.unitSystem, analyticsOptIn: false }; },
  async exportMyData() { return load(); },
  async signOut() { /* handled by session store */ },

  // ---- Choose Your Journey ----
  async createJourney(i) {
    const s = await load();
    if (s.journey && s.journey.status !== "completed") return ok(s, [], true);
    const t = today(s);
    const issues = validatePlanInputs(i.planInputs, t);
    if (issues.length) throw new ApiError(issues[0]!);
    const g = i.goal;
    const gi = validateGoalDraft({ metric: g.metric, baseline: g.baseline ?? undefined, target: g.target, direction: g.direction, startDate: t, dueDate: g.targetDate });
    if (gi.includes("due_before_start")) throw new ApiError("invalid_goal: targetDate");
    if (g.baseline && (g.direction === "higher_better" ? g.target / g.baseline : g.baseline / g.target) > 3) throw new ApiError("target_implausible_choose_smaller_step");
    if (s.journey) s.priorCreditedDays += s.journey.credited.length;
    s.journey = mapJourneyError(() => createJourney(i.templateKey, i.planInputs, t));
    s.journeyId = id();
    s.goals.unshift({ id: id(), title: g.title, metric: g.metric, direction: g.direction, baseline: g.baseline, target: g.target, unit: g.unit, targetDate: g.targetDate, status: "active" });
    await save(s);
    return ok(s);
  },
  async extendJourney(templateKey) {
    const s = await load();
    if (!s.journey) throw new ApiError("no_journey");
    s.journey = mapJourneyError(() => extendJourney(s.journey!, templateKey, today(s)));
    await save(s);
    return ok(s);
  },
  async setJourneyPaused(paused) {
    const s = await load();
    if (!s.journey) throw new ApiError("no_journey");
    s.journey = paused ? pauseJourney(s.journey, today(s)) : resumeJourney(s.journey, today(s));
    await save(s);
  },
  async updateJourneyPlan(inputs, reason) {
    const s = await load();
    if (!s.journey || s.journey.status === "completed") throw new ApiError("no_open_journey");
    if (inputs) { const issues = validatePlanInputs(inputs, today(s)); if (issues.length) throw new ApiError(issues[0]!); }
    s.journey = mapJourneyError(() => adjustPlan(s.journey!, inputs, today(s), reason));
    await save(s);
  },
  async getJourneyPlan() {
    const s = await load();
    return { sessions: s.journey?.sessions ?? [], credited: (s.journey?.credited ?? []).map(({ programDay, localDate }) => ({ programDay, localDate })) };
  },
  async listPlanChanges() {
    const s = await load();
    return [...(s.journey?.changes ?? [])].reverse().map((c): PlanChangeRow => ({ kind: c.kind, fromTemplateKey: c.fromTemplateKey, toTemplateKey: c.toTemplateKey, effectiveProgramDay: c.effectiveProgramDay, effectiveDate: c.effectiveDate, reason: c.reason, createdAt: c.effectiveDate }));
  },
  async listGoals() { return (await load()).goals; },
  async addGoal(g) {
    const s = await load();
    if (s.goals.filter((x) => x.status === "active").length >= 5) throw new ApiError("too_many_active_goals");
    s.goals.unshift({ id: id(), title: g.title, metric: g.metric, direction: g.direction, baseline: g.baseline, target: g.target, unit: g.unit, targetDate: g.targetDate, status: "active" });
    await save(s);
  },
  async recordAssessment(i) {
    const s = await load();
    const j = s.journey;
    if (!j) throw new ApiError("no_journey");
    if (!checkpointsFor(j.targetDays).some((c) => c.day === i.checkpointDay)) throw new ApiError("not_a_checkpoint");
    if (j.credited.length < i.checkpointDay) throw new ApiError("checkpoint_not_reached");
    s.assessments = s.assessments.filter((a) => !(a.journeyId === s.journeyId && a.checkpointDay === i.checkpointDay));
    s.assessments.push({ journeyId: s.journeyId, checkpointDay: i.checkpointDay, responses: i.responses, createdAt: nowDate(s).toISOString() });
    await save(s);
  },
  async listAssessments() {
    const s = await load();
    return s.assessments.filter((a) => a.journeyId === s.journeyId).map(({ journeyId: _j, ...a }) => a);
  },
};

