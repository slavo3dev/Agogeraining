/**
 * Deterministic, template-based programming (MVP). The SQL function `internal.generate_sessions` re-implements
 * this exactly and `pnpm db:test` asserts parity on fixtures — change both together.
 *
 * Integer-only arithmetic on purpose (no float rounding drift between JS and Postgres).
 * Safety rules baked in: no daily high intensity, at most one "tempo" slot per rotation and only for
 * experienced athletes without limitations in a build/peak phase, recovery after every fixed sport day,
 * at least one non-training weekday per week (validated in PlanInputs), never all-out sessions.
 */
import type { ActivityType } from "@agogeraining/training";
import { addDays } from "./clock";
import { RANK_GATE_BY_DAY, type Checkpoint, checkpointsFor } from "./plans";

export type Phase = "preparation" | "base" | "build" | "peak" | "event" | "transition";
export type SessionType =
  | "orientation" | "strength" | "aerobic" | "tempo" | "mobility" | "recovery" | "sport"
  | "assessment" | "trial_prep" | "trial" | "event";
export type Intensity = "rest" | "easy" | "moderate" | "hard";
export type Experience = "new" | "returning" | "regular" | "experienced";
export type Focus = "strength" | "cardio" | "hybrid" | "mobility" | "general_health";
export type Equipment = "none" | "home_basic" | "full_gym";

export interface PlanInputs {
  experience: Experience;
  focus: Focus;
  /** Weekdays you can train, 0 = Monday … 6 = Sunday. 1–6 entries: at least one rest weekday is always kept. */
  availableWeekdays: number[];
  /** Fixed weekly sport (e.g. Thursday soccer). Counts as a hard session; the next day is recovery. */
  sportDays: number[];
  sportName: string | null;
  maxSessionMinutes: number;
  equipment: Equipment;
  hasLimitations: boolean;
  recoveryStyle: "active" | "full_rest";
  eventDate: string | null;
}

export interface QuestSpecJson { type: string; allowedActivityTypes: ActivityType[]; minDurationSeconds: number }
export interface SideQuestJson extends QuestSpecJson { label: string }
export interface Alternatives { noGym: string; indoorOnly: string; limitedTime: string; mobility: string }
export interface ExerciseRx { slug: string; sets: number; reps: string }

export interface PlannedSession {
  programDay: number;
  scheduledFor: string;
  phase: Phase;
  week: number;
  deload: boolean;
  sessionType: SessionType;
  intensity: Intensity;
  plannedMinutes: number;
  title: string;
  description: string;
  primary: QuestSpecJson;
  side: SideQuestJson[];
  alternatives: Alternatives;
  exercises: ExerciseRx[];
  checkpoint: Checkpoint | null;
}

export interface SessionArchetype {
  questType: "strength" | "cardio" | "mobility" | "skill" | "recovery" | "custom";
  title: string;
  description: string;
  allowedActivityTypes: ActivityType[];
  intensity: Intensity;
  /** % of the athlete's base minutes. Ignored when fixedMinutes is set. */
  factorPct: number;
  fixedMinutes: number | null;
  side: SideQuestJson[];
  alternatives: Alternatives;
}

const ANY_CARDIO: ActivityType[] = ["walking", "hiking", "running", "cycling", "swimming"];
const BROAD: ActivityType[] = ["strength", "running", "walking", "hiking", "cycling", "swimming", "obstacle", "mobility", "custom"];
const sideMobility: SideQuestJson = { type: "mobility", label: "5-minute mobility flow", allowedActivityTypes: ["mobility"], minDurationSeconds: 300 };
const sideWalk: SideQuestJson = { type: "cardio", label: "10-minute easy walk", allowedActivityTypes: ["walking", "hiking"], minDurationSeconds: 600 };
const restAlt: Alternatives = { noGym: "Nothing needed.", indoorOnly: "Nothing needed.", limitedTime: "Marking rest is enough.", mobility: "Breathing and gentle range-of-motion work." };

/** Session content library. Generated into SQL (`session_archetypes`) by scripts/gen-reference-sql.ts. */
export const SESSION_LIBRARY: Readonly<Record<SessionType, SessionArchetype>> = {
  orientation: {
    questType: "cardio", title: "Take the Oath", intensity: "easy", factorPct: 100, fixedMinutes: 10,
    description: "Finish your baseline and do 10+ minutes of easy movement you enjoy. Start where you are.",
    allowedActivityTypes: [...ANY_CARDIO, "mobility", "strength", "custom"], side: [sideMobility],
    alternatives: { noGym: "Walk around the block.", indoorOnly: "March in place or follow a mobility routine.", limitedTime: "10 minutes is the whole quest.", mobility: "Gentle seated or standing mobility counts." },
  },
  strength: {
    questType: "strength", title: "Strength session", intensity: "moderate", factorPct: 100, fixedMinutes: null,
    description: "Squat, push, pull and hinge patterns with controlled reps. Stop 2–3 reps before failure and keep form crisp.",
    allowedActivityTypes: ["strength", "obstacle"], side: [sideWalk],
    alternatives: { noGym: "Bodyweight squats, incline push-ups, table rows, hip hinges.", indoorOnly: "Same session at home.", limitedTime: "One round of each pattern counts if you hit the minimum time.", mobility: "Box squats and wall push-ups; skip any painful movement." },
  },
  aerobic: {
    questType: "cardio", title: "Zone 2 endurance", intensity: "easy", factorPct: 100, fixedMinutes: null,
    description: "Steady effort at a conversational pace — walk, jog, bike or swim. You should finish feeling you could do more.",
    allowedActivityTypes: ANY_CARDIO, side: [sideMobility],
    alternatives: { noGym: "Brisk walk outdoors.", indoorOnly: "Stationary bike, treadmill or stairs.", limitedTime: "The minimum time counts.", mobility: "Low impact: bike, pool or water walking." },
  },
  tempo: {
    questType: "cardio", title: "Tempo intervals", intensity: "hard", factorPct: 80, fixedMinutes: null,
    description: "Warm up 10 minutes, then 3–5 × 3 minutes comfortably hard with 2 minutes easy between. Controlled, never all-out.",
    allowedActivityTypes: ANY_CARDIO, side: [sideMobility],
    alternatives: { noGym: "Brisk uphill walking intervals.", indoorOnly: "Bike or treadmill intervals.", limitedTime: "Three intervals is a full session.", mobility: "Swap for an easy Zone 2 session if anything aches." },
  },
  mobility: {
    questType: "mobility", title: "Mobility & core", intensity: "easy", factorPct: 50, fixedMinutes: null,
    description: "Slow, controlled range-of-motion work for hips, spine and shoulders. Breathe and stay pain-free.",
    allowedActivityTypes: ["mobility"], side: [sideWalk],
    alternatives: { noGym: "Floor only — no equipment needed.", indoorOnly: "Same session indoors.", limitedTime: "Ten minutes counts.", mobility: "Seated or supported versions are fine." },
  },
  recovery: {
    questType: "recovery", title: "Planned recovery", intensity: "rest", factorPct: 0, fixedMinutes: 0,
    description: "Rest is training. Light mobility or an easy stroll, or simply check in that you rested.",
    allowedActivityTypes: ["recovery", "mobility", "walking"], side: [sideMobility], alternatives: restAlt,
  },
  sport: {
    questType: "custom", title: "Your sport", intensity: "hard", factorPct: 100, fixedMinutes: 60,
    description: "Your fixed sport day counts as a higher-intensity session. Warm up well; tomorrow is recovery.",
    allowedActivityTypes: ["sport", "running", "obstacle", "custom"], side: [],
    alternatives: { noGym: "Play as usual.", indoorOnly: "Indoor version of your sport counts.", limitedTime: "Thirty minutes of play counts.", mobility: "Play at the level your body allows today." },
  },
  assessment: {
    questType: "skill", title: "Readiness check", intensity: "easy", factorPct: 100, fixedMinutes: 15,
    description: "Easy movement of your choice, then review your baseline, schedule and how your body feels. Not a test.",
    allowedActivityTypes: BROAD, side: [],
    alternatives: { noGym: "A walk counts.", indoorOnly: "Mobility or marching in place counts.", limitedTime: "Ten minutes is enough.", mobility: "Any gentle movement counts." },
  },
  trial_prep: {
    questType: "skill", title: "Trial rehearsal", intensity: "easy", factorPct: 100, fixedMinutes: 15,
    description: "Rehearse the skill for your promotion trial at about 70% effort and confirm how you'll record it.",
    allowedActivityTypes: BROAD, side: [sideMobility],
    alternatives: { noGym: "Rehearse with what you own.", indoorOnly: "Rehearse indoors.", limitedTime: "Ten minutes is enough.", mobility: "Rehearse a modified version." },
  },
  trial: {
    questType: "skill", title: "Promotion trial day", intensity: "moderate", factorPct: 100, fixedMinutes: 20,
    description: "Warm up, then attempt the trial you chose against your own baseline — good form, no all-out risk. Reschedule if you're not feeling right.",
    allowedActivityTypes: BROAD, side: [],
    alternatives: { noGym: "Pick a trial you can do at home.", indoorOnly: "Pick an indoor trial.", limitedTime: "Short trials (push-ups, plank, timed walk) work.", mobility: "Pick a mobility range or supported-strength trial." },
  },
  event: {
    questType: "skill", title: "Event day", intensity: "hard", factorPct: 100, fixedMinutes: 60,
    description: "This is what you prepared for. Warm up, pace yourself, and log your event.",
    allowedActivityTypes: [...ANY_CARDIO, "obstacle", "sport", "strength", "custom"], side: [],
    alternatives: { noGym: "Log the event as it happened.", indoorOnly: "Log the event as it happened.", limitedTime: "Any part of the event counts.", mobility: "Do what's safe today; there will be other events." },
  },
};

const BASE_MINUTES: Record<Experience, number> = { new: 20, returning: 25, regular: 35, experienced: 45 };
const PHASE_PCT: Record<Phase, number> = { preparation: 80, base: 100, build: 100, peak: 60, event: 100, transition: 70 };
const PREP_ROTATION: SessionType[] = ["strength", "aerobic", "mobility"];
export const ROTATIONS: Readonly<Record<Focus, SessionType[]>> = {
  strength: ["strength", "aerobic", "strength", "tempo", "mobility"],
  cardio: ["aerobic", "strength", "tempo", "aerobic", "mobility"],
  hybrid: ["strength", "aerobic", "tempo", "strength", "mobility"],
  mobility: ["mobility", "strength", "aerobic", "mobility", "tempo"],
  general_health: ["aerobic", "strength", "mobility", "aerobic", "tempo"],
};

/** Monday = 0 … Sunday = 6. */
export function weekdayOf(localDate: string): number {
  return (new Date(`${localDate}T00:00:00Z`).getUTCDay() + 6) % 7;
}
const idiv = (a: number, b: number) => Math.floor(a / b); // all operands are non-negative where used
const pct = (m: number, p: number) => idiv(m * p + 50, 100);

export function phaseFor(day: number, horizon: number, eventDay: number | null): Phase {
  if (eventDay !== null && horizon >= 90 && eventDay >= 17 && eventDay <= horizon) {
    if (day === eventDay) return "event";
    if (day >= eventDay - 7 && day < eventDay) return "peak";
    if (day > eventDay && day <= eventDay + 7) return "transition";
  }
  if (day <= 9 || horizon <= 9) return "preparation";
  if (horizon <= 30) return "base";
  if (horizon <= 60) return day <= 33 ? "base" : "build";
  if (horizon <= 90) return day <= 45 ? "base" : "build";
  if (day <= 100) return "base";
  if (day <= 200) return "build";
  if (day <= 214) return "transition";
  return "build";
}
export const isDeload = (day: number, phase: Phase) => (phase === "base" || phase === "build") && idiv(day - 10, 7) % 4 === 3;

function strengthExercises(inputs: PlanInputs, phase: Phase, deload: boolean): ExerciseRx[] {
  const lim = inputs.hasLimitations; const eq = inputs.equipment;
  const sets = phase === "base" || phase === "build" ? (deload ? 2 : 3) : 2;
  const reps = deload ? "10" : ({ preparation: "8", base: "10", build: "8", peak: "6", transition: "10", event: "10" } as const)[phase];
  const list: ExerciseRx[] = [
    { slug: lim ? "box-squat" : eq === "none" ? "bodyweight-squat" : "goblet-squat", sets, reps },
    { slug: lim || inputs.experience === "new" ? "incline-push-up" : "push-up", sets, reps },
    { slug: eq === "none" ? "inverted-row" : eq === "home_basic" ? "band-row" : "dumbbell-row", sets, reps },
    { slug: eq === "none" ? "hip-hinge-drill" : "romanian-deadlift", sets, reps },
    { slug: lim ? "dead-bug" : "plank", sets, reps: "30s" },
  ];
  if (phase === "build" && eq !== "none" && !deload) list.push({ slug: "farmer-carry", sets, reps: "40m" });
  return list;
}

export interface GenerateArgs {
  horizon: number;
  inputs: PlanInputs;
  /** Local date the first generated day (fromDay) is projected onto. */
  anchor: string;
  fromDay: number;
}

/** Generate the plan from `fromDay` to the horizon. Pure and deterministic. */
export function generateSessions({ horizon, inputs, anchor, fromDay }: GenerateArgs): PlannedSession[] {
  const out: PlannedSession[] = [];
  const checkpoints = new Map(checkpointsFor(horizon).map((c) => [c.day, c]));
  const eventDay = inputs.eventDate ? fromDay + daysBetweenLocal(anchor, inputs.eventDate) : null;
  const sport = new Set(inputs.sportDays); const avail = new Set(inputs.availableWeekdays);
  let k = 0;
  for (let d = fromDay; d <= horizon; d++) {
    const date = addDays(anchor, d - fromDay);
    const wd = weekdayOf(date);
    const phase = phaseFor(d, horizon, eventDay);
    const deload = isDeload(d, phase);
    let type: SessionType;
    if (d === 1) type = "orientation";
    else if (d === 3) type = "assessment";
    else if (RANK_GATE_BY_DAY[d] !== undefined) type = "trial";
    else if (RANK_GATE_BY_DAY[d + 1] !== undefined && d + 1 <= horizon) type = "trial_prep";
    else if (phase === "event") type = "event";
    else if (sport.has(wd)) type = "sport";
    else if (sport.has((wd + 6) % 7)) type = "recovery";
    else if (!avail.has(wd)) type = "recovery";
    else {
      const rot = phase === "preparation" ? PREP_ROTATION : ROTATIONS[inputs.focus];
      type = rot[k % rot.length]!; k++;
      const tempoOk = (phase === "build" || phase === "peak") && !deload && (inputs.experience === "regular" || inputs.experience === "experienced")
        && !inputs.hasLimitations && !sport.has((wd + 1) % 7);
      if (type === "tempo" && !tempoOk) type = "aerobic";
    }
    const a = SESSION_LIBRARY[type];

    let minutes: number;
    if (a.fixedMinutes !== null) minutes = a.fixedMinutes;
    else {
      minutes = BASE_MINUTES[inputs.experience] + (d > 9 ? Math.min(15, 2 * idiv(d - 10, 7)) : 0) + (phase === "build" ? 5 : 0);
      minutes = pct(minutes, a.factorPct);
      minutes = pct(minutes, PHASE_PCT[phase]);
      if (deload) minutes = pct(minutes, 70);
      minutes = Math.max(10, idiv(minutes + 2, 5) * 5);
    }
    if (type !== "sport" && type !== "recovery" && type !== "event") minutes = Math.min(minutes, inputs.maxSessionMinutes);

    let intensity: Intensity = a.intensity;
    if (type === "strength" && (phase === "preparation" || phase === "transition" || deload)) intensity = "easy";

    let exercises: ExerciseRx[] = [];
    if (type === "strength") exercises = strengthExercises(inputs, phase, deload);
    else if (type === "mobility") exercises = ["cat-cow", "worlds-greatest-stretch", "hip-flexor-stretch"].map((slug) => ({ slug, sets: 1, reps: "60s" }));
    else if (type === "aerobic") exercises = [{ slug: inputs.hasLimitations ? "zone2-bike" : inputs.experience === "new" || inputs.experience === "returning" ? "zone2-walk" : "zone2-jog", sets: 1, reps: `${minutes} min` }];

    out.push({
      programDay: d, scheduledFor: date, phase, week: idiv(d - 1, 7) + 1, deload, sessionType: type, intensity, plannedMinutes: minutes,
      title: a.title, description: a.description,
      primary: { type: a.questType, allowedActivityTypes: [...a.allowedActivityTypes], minDurationSeconds: type === "recovery" ? 0 : Math.max(300, idiv(minutes, 2) * 60) },
      side: type === "recovery" && inputs.recoveryStyle === "full_rest" ? [] : a.side.map((s) => ({ ...s, allowedActivityTypes: [...s.allowedActivityTypes] })),
      alternatives: { ...a.alternatives },
      exercises,
      checkpoint: checkpoints.get(d) ?? null,
    });
  }
  return out;
}

function daysBetweenLocal(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Weekly mix for previews: counts of session types in the first `days` sessions. */
export function trainingMix(sessions: PlannedSession[]): Record<"training" | "recovery" | "sport" | "checkpoint", number> {
  const mix = { training: 0, recovery: 0, sport: 0, checkpoint: 0 };
  for (const s of sessions) {
    if (s.sessionType === "recovery") mix.recovery++;
    else if (s.sessionType === "sport") mix.sport++;
    else if (s.sessionType === "assessment" || s.sessionType === "trial" || s.sessionType === "trial_prep") mix.checkpoint++;
    else mix.training++;
  }
  return mix;
}

/** Safety validation shared by UI forms and the server (SQL mirrors these limits). */
export function validatePlanInputs(i: PlanInputs, today: string): string[] {
  const issues: string[] = [];
  const days = new Set(i.availableWeekdays);
  if (days.size < 1) issues.push("choose_at_least_one_training_day");
  if (days.size > 6) issues.push("keep_at_least_one_rest_day");
  if ([...days, ...i.sportDays].some((d) => !Number.isInteger(d) || d < 0 || d > 6)) issues.push("invalid_weekday");
  if (new Set(i.sportDays).size > 4) issues.push("too_many_sport_days");
  if (!(i.maxSessionMinutes >= 10 && i.maxSessionMinutes <= 180)) issues.push("session_minutes_out_of_range");
  if (i.eventDate !== null) {
    const ahead = daysBetweenLocal(today, i.eventDate);
    if (ahead < 0) issues.push("event_in_past");
    if (ahead > 400) issues.push("event_too_far");
  }
  return issues;
}
