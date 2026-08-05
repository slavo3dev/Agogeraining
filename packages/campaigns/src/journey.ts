/**
 * Journey state machine (pure). The server (`complete_workout`, `extend_journey`, …) implements the same rules
 * authoritatively; the app uses this for previews and the dev-only local demo.
 */
import type { ActivityType } from "@agogeraining/training";
import { addDays, daysBetween } from "./clock";
import { canExtend, nextCheckpoint, planByKey, type Checkpoint } from "./plans";
import { generateSessions, type PlanInputs, type PlannedSession } from "./programming";

export type JourneyStatus = "active" | "paused" | "completed";
export type EligibilityReason = "planned_training" | "planned_recovery" | "checkpoint";

export interface CreditedDay { programDay: number; localDate: string; reason: EligibilityReason }
export interface PlanChange {
  kind: "created" | "extended" | "plan_adjusted" | "rescheduled" | "paused" | "resumed";
  fromTemplateKey: string | null;
  toTemplateKey: string;
  effectiveProgramDay: number;
  effectiveDate: string;
  fromGeneration: number | null;
  toGeneration: number;
  reason: string | null;
}

export interface Journey {
  templateKey: string;
  targetDays: number;
  status: JourneyStatus;
  startDate: string;
  inputs: PlanInputs;
  credited: CreditedDay[];
  /** Current generation for every program day. Rows for credited days are never rewritten. */
  sessions: PlannedSession[];
  generation: number;
  changes: PlanChange[];
}

export class JourneyError extends Error {
  constructor(public code: string) { super(code); }
}

export const creditedCount = (j: Journey) => j.credited.length;
const lastCredit = (j: Journey) => j.credited[j.credited.length - 1];
export const creditedOn = (j: Journey, localDate: string) => j.credited.find((c) => c.localDate === localDate);

/** Where the next uncredited day is projected: today, or tomorrow if today already earned its credit. */
export function anchorFor(j: Pick<Journey, "credited">, today: string): string {
  return j.credited.some((c) => c.localDate === today) ? addDays(today, 1) : today;
}

export function createJourney(templateKey: string, inputs: PlanInputs, today: string): Journey {
  const plan = planByKey(templateKey);
  if (!plan) throw new JourneyError("unknown_plan");
  return {
    templateKey, targetDays: plan.durationDays, status: "active", startDate: today, inputs, credited: [],
    sessions: generateSessions({ horizon: plan.durationDays, inputs, anchor: today, fromDay: 1 }), generation: 1,
    changes: [{ kind: "created", fromTemplateKey: null, toTemplateKey: templateKey, effectiveProgramDay: 1, effectiveDate: today, fromGeneration: null, toGeneration: 1, reason: null }],
  };
}

export function sessionFor(j: Journey, programDay: number): PlannedSession | undefined {
  return j.sessions.find((s) => s.programDay === programDay);
}

export interface ActivityForCredit { activityType: ActivityType; durationSeconds: number }
export interface CreditResult { journey: Journey; credited: boolean; programDay: number | null; reason: string }

/**
 * Credit at most one program day per local date, in chronological order, only for the planned session.
 * Extra workouts the same date, unplanned activity types, paused/completed journeys and skipped days earn nothing.
 */
export function creditDay(j: Journey, localDate: string, a: ActivityForCredit): CreditResult {
  const no = (reason: string, programDay: number | null = null): CreditResult => ({ journey: j, credited: false, programDay, reason });
  if (j.status !== "active") return no(`journey_${j.status}`);
  const existing = creditedOn(j, localDate);
  if (existing) return no("date_already_credited", existing.programDay);
  const last = lastCredit(j);
  if (last && localDate <= last.localDate) return no("date_before_last_credit");
  const next = j.credited.length + 1;
  if (next > j.targetDays) return no("journey_complete");
  const s = sessionFor(j, next);
  if (!s) return no("no_session");
  if (!s.primary.allowedActivityTypes.includes(a.activityType)) return no("wrong_activity");
  if (a.durationSeconds < s.primary.minDurationSeconds) return no("too_short");
  const reason: EligibilityReason = s.checkpoint ? "checkpoint" : s.sessionType === "recovery" ? "planned_recovery" : "planned_training";
  const credited = [...j.credited, { programDay: next, localDate, reason }];
  return {
    journey: { ...j, credited, status: credited.length >= j.targetDays ? "completed" : "active" },
    credited: true, programDay: next, reason,
  };
}

/** Rewrite only program days after the last credited day. History is immutable. */
export function regenerateFuture(j: Journey, today: string, change: Omit<PlanChange, "effectiveProgramDay" | "effectiveDate" | "fromGeneration" | "toGeneration">): Journey {
  const fromDay = j.credited.length + 1;
  const anchor = anchorFor(j, today);
  const kept = j.sessions.filter((s) => s.programDay < fromDay);
  const fresh = fromDay <= j.targetDays ? generateSessions({ horizon: j.targetDays, inputs: j.inputs, anchor, fromDay }) : [];
  const generation = j.generation + 1;
  return {
    ...j, sessions: [...kept, ...fresh], generation,
    changes: [...j.changes, { ...change, effectiveProgramDay: fromDay, effectiveDate: anchor, fromGeneration: j.generation, toGeneration: generation }],
  };
}

export function extendJourney(j: Journey, toTemplateKey: string, today: string): Journey {
  const to = planByKey(toTemplateKey);
  if (!to) throw new JourneyError("unknown_plan");
  const check = canExtend(j.targetDays, to.durationDays);
  if (!check.ok) throw new JourneyError(check.reason);
  if (j.status === "paused") throw new JourneyError("resume_before_extending");
  const grown: Journey = { ...j, templateKey: to.key, targetDays: to.durationDays, status: "active" };
  return regenerateFuture(grown, today, { kind: "extended", fromTemplateKey: j.templateKey, toTemplateKey: to.key, reason: null });
}

export function adjustPlan(j: Journey, inputs: PlanInputs | null, today: string, reason: string | null): Journey {
  if (j.status === "completed") throw new JourneyError("journey_completed");
  const next = inputs ? { ...j, inputs } : j;
  return regenerateFuture(next, today, { kind: inputs ? "plan_adjusted" : "rescheduled", fromTemplateKey: j.templateKey, toTemplateKey: j.templateKey, reason });
}

export function pauseJourney(j: Journey, today: string): Journey {
  if (j.status !== "active") return j;
  return { ...j, status: "paused", changes: [...j.changes, { kind: "paused", fromTemplateKey: j.templateKey, toTemplateKey: j.templateKey, effectiveProgramDay: j.credited.length + 1, effectiveDate: today, fromGeneration: j.generation, toGeneration: j.generation, reason: null }] };
}
/** Resuming re-projects the remaining days from today, so the finish forecast moves instead of days being lost. */
export function resumeJourney(j: Journey, today: string): Journey {
  if (j.status !== "paused") return j;
  return regenerateFuture({ ...j, status: "active" }, today, { kind: "resumed", fromTemplateKey: j.templateKey, toTemplateKey: j.templateKey, reason: null });
}

// ---------- read-model helpers (used by both demo and remote views) ----------
export interface JourneyProgressView {
  displayDay: number;
  creditedToday: boolean;
  remaining: number;
  forecastFinish: string | null;
  behindDays: number;
  nextCheckpoint: Checkpoint | null;
}

export function forecastFinish(today: string, remaining: number, creditedToday: boolean): string | null {
  if (remaining <= 0) return null;
  return addDays(today, creditedToday ? remaining : remaining - 1);
}

export function progressView(args: { targetDays: number; credited: number; creditedToday: boolean; todayProgramDay: number | null; nextScheduledFor: string | null; today: string }): JourneyProgressView {
  const remaining = Math.max(0, args.targetDays - args.credited);
  const displayDay = args.todayProgramDay ?? Math.min(args.credited + 1, args.targetDays);
  const behind = args.nextScheduledFor && !args.creditedToday ? Math.max(0, daysBetween(args.nextScheduledFor, args.today)) : 0;
  return {
    displayDay, creditedToday: args.creditedToday, remaining,
    forecastFinish: forecastFinish(args.today, remaining, args.creditedToday), behindDays: behind,
    nextCheckpoint: nextCheckpoint(args.targetDays, args.credited),
  };
}
