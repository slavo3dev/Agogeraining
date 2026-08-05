import { describe, expect, it } from "vitest";
import {
  JourneyError, PLAN_TEMPLATES, SESSION_LIBRARY, addDays, adjustPlan, canExtend, checkpointsFor, createJourney, creditDay,
  extendJourney, generateSessions, localDateFor, nextCheckpoint, pauseJourney, phaseFor, progressView, recommendPlan, resumeJourney,
  sessionFor, trainingMix, validatePlanInputs, weekdayOf, type Journey, type PlanInputs, type PlannedSession,
} from "./index";

const MON = "2026-11-09"; // a Monday
const inputs: PlanInputs = {
  experience: "returning", focus: "hybrid", availableWeekdays: [0, 2, 4, 5], sportDays: [], sportName: null,
  maxSessionMinutes: 60, equipment: "home_basic", hasLimitations: false, recoveryStyle: "active", eventDate: null,
};

/** Play a journey day by day, doing exactly what each planned session asks. */
function playDays(j: Journey, from: string, n: number): { j: Journey; date: string } {
  let date = from;
  for (let i = 0; i < n; i++) {
    const s = sessionFor(j, j.credited.length + 1)!;
    const act = s.sessionType === "recovery" ? { activityType: "recovery" as const, durationSeconds: 0 } : { activityType: s.primary.allowedActivityTypes[0]!, durationSeconds: s.primary.minDurationSeconds };
    const r = creditDay(j, date, act);
    expect(r.credited, `day ${j.credited.length + 1} on ${date}: ${r.reason}`).toBe(true);
    j = r.journey; date = addDays(date, 1);
  }
  return { j, date };
}

describe("plan catalog", () => {
  it("offers exactly six horizons, two prep and four campaigns", () => {
    expect(PLAN_TEMPLATES.map((p) => p.durationDays)).toEqual([3, 9, 30, 60, 90, 300]);
    expect(PLAN_TEMPLATES.filter((p) => p.tier === "prep").map((p) => p.durationDays)).toEqual([3, 9]);
  });
  it("checkpoints at 3/9/30/60/90/300 within the horizon; Day 3 is readiness, never a promotion", () => {
    expect(checkpointsFor(3)).toEqual([{ day: 3, kind: "readiness", rankKey: null }]);
    expect(checkpointsFor(90).map((c) => c.day)).toEqual([3, 9, 30, 60, 90]);
    expect(checkpointsFor(90).find((c) => c.day === 9)?.rankKey).toBe("hoplites");
    expect(checkpointsFor(300).at(-1)).toEqual({ day: 300, kind: "promotion", rankKey: "polemarchos" });
    expect(nextCheckpoint(90, 9)?.day).toBe(30);
    expect(nextCheckpoint(9, 9)).toBeNull();
  });
  it("extension only grows the horizon; shortening is refused explicitly", () => {
    expect(canExtend(3, 9)).toEqual({ ok: true });
    expect(canExtend(30, 300)).toEqual({ ok: true });
    expect(canExtend(90, 30)).toEqual({ ok: false, reason: "shortening_not_supported" });
    expect(canExtend(30, 30)).toEqual({ ok: false, reason: "same_horizon" });
    expect(canExtend(30, 45)).toEqual({ ok: false, reason: "unknown_plan" });
  });
  it("recommendation is a suggestion that scales with readiness", () => {
    expect(recommendPlan({ experience: "new", availableDays: 2, focus: "hybrid", hasLimitations: false, daysToEvent: null })).toBe("initiation-3");
    expect(recommendPlan({ experience: "new", availableDays: 4, focus: "hybrid", hasLimitations: false, daysToEvent: null })).toBe("agoge-9");
    expect(recommendPlan({ experience: "returning", availableDays: 4, focus: "hybrid", hasLimitations: true, daysToEvent: null })).toBe("initiation-3");
    expect(recommendPlan({ experience: "regular", availableDays: 4, focus: "cardio", hasLimitations: false, daysToEvent: 60 })).toBe("transformation-90");
    expect(recommendPlan({ experience: "experienced", availableDays: 5, focus: "general_health", hasLimitations: false, daysToEvent: null })).toBe("legacy-300");
  });
});

describe("programming", () => {
  const gen = (horizon: number, i: Partial<PlanInputs> = {}, anchor = MON, fromDay = 1) => generateSessions({ horizon, inputs: { ...inputs, ...i }, anchor, fromDay });

  it("is deterministic", () => expect(gen(90)).toEqual(gen(90)));
  it("3- and 9-day plans are preparation only — never all six phases", () => {
    expect(new Set(gen(3).map((s) => s.phase))).toEqual(new Set(["preparation"]));
    expect(new Set(gen(9).map((s) => s.phase))).toEqual(new Set(["preparation"]));
    expect(gen(3).map((s) => s.sessionType)).toEqual(["orientation", expect.any(String), "assessment"]);
  });
  it("30/60 use simple progression; 90/300 are periodized; 300 includes a transition block", () => {
    expect(new Set(gen(30).map((s) => s.phase))).toEqual(new Set(["preparation", "base"]));
    expect(new Set(gen(60).map((s) => s.phase))).toEqual(new Set(["preparation", "base", "build"]));
    expect(new Set(gen(300).map((s) => s.phase))).toEqual(new Set(["preparation", "base", "build", "transition"]));
    expect(gen(60).some((s) => s.deload)).toBe(true);
  });
  it("event date adds a taper (peak), the event day and a transition for 90+ day plans", () => {
    const s = gen(90, { experience: "regular", eventDate: addDays(MON, 59) }); // program day 60 → is a trial day, so use 61
    const s2 = gen(90, { experience: "regular", eventDate: addDays(MON, 69) }); // program day 70
    expect(s2.find((x) => x.programDay === 70)?.sessionType).toBe("event");
    expect(s2.filter((x) => x.phase === "peak").map((x) => x.programDay)).toEqual([63, 64, 65, 66, 67, 68, 69]);
    expect(s2.find((x) => x.programDay === 71)?.phase).toBe("transition");
    expect(s.find((x) => x.programDay === 60)?.sessionType).toBe("trial"); // checkpoint wins over the event slot
    expect(phaseFor(50, 30, 50)).toBe("base"); // no event periodization below 90 days
  });
  it("checkpoint days carry the trial; the day before a gate is a rehearsal", () => {
    const s = gen(90);
    expect(s.find((x) => x.programDay === 3)?.sessionType).toBe("assessment");
    for (const d of [9, 30, 60, 90]) {
      expect(s.find((x) => x.programDay === d)?.sessionType).toBe("trial");
      expect(s.find((x) => x.programDay === d - 1)?.sessionType).toBe("trial_prep");
    }
  });
  it("Thursday soccer is a hard session, Friday is recovery, and no tempo lands the day before", () => {
    const s = gen(90, { experience: "experienced", sportDays: [3], sportName: "Soccer", availableWeekdays: [0, 1, 2, 4, 5] });
    for (const x of s.filter((x) => x.programDay > 10 && x.checkpoint === null && x.sessionType !== "trial_prep")) {
      const wd = weekdayOf(x.scheduledFor);
      if (wd === 3) expect(x.sessionType).toBe("sport");
      if (wd === 4) expect(x.sessionType).toBe("recovery");
      if (wd === 2) expect(x.sessionType).not.toBe("tempo");
    }
    expect(s.find((x) => x.sessionType === "sport")?.intensity).toBe("hard");
  });
  it("never schedules hard sessions on consecutive days and never for beginners or limited athletes", () => {
    const hard = (ss: PlannedSession[]) => ss.filter((x) => x.intensity === "hard").map((x) => x.programDay);
    const s = gen(300, { experience: "experienced", focus: "cardio", availableWeekdays: [0, 1, 2, 3, 4, 5] });
    const h = hard(s);
    for (let i = 1; i < h.length; i++) expect(h[i]! - h[i - 1]!).toBeGreaterThan(1);
    expect(hard(gen(300, { experience: "new" }))).toEqual([]);
    expect(hard(gen(300, { experience: "experienced", hasLimitations: true }))).toEqual([]);
  });
  it("respects availability, rest weekdays and max session length", () => {
    const s = gen(60, { availableWeekdays: [1, 3], maxSessionMinutes: 25 });
    for (const x of s.filter((x) => x.programDay > 3 && !x.checkpoint && x.sessionType !== "trial_prep")) {
      if (![1, 3].includes(weekdayOf(x.scheduledFor))) expect(x.sessionType).toBe("recovery");
    }
    expect(Math.max(...s.filter((x) => x.sessionType !== "recovery").map((x) => x.plannedMinutes))).toBeLessThanOrEqual(25);
  });
  it("recovery days need only a check-in; training days need at least half the planned time (≥5 min)", () => {
    for (const x of gen(90)) {
      if (x.sessionType === "recovery") expect(x.primary.minDurationSeconds).toBe(0);
      else expect(x.primary.minDurationSeconds).toBeGreaterThanOrEqual(300);
    }
  });
  it("equipment and limitations pick safer exercise variants", () => {
    const strength = (i: Partial<PlanInputs>) => gen(30, i).find((x) => x.sessionType === "strength")!.exercises.map((e) => e.slug);
    expect(strength({ equipment: "none" })).toContain("bodyweight-squat");
    expect(strength({ hasLimitations: true })).toEqual(expect.arrayContaining(["box-squat", "incline-push-up", "dead-bug"]));
  });
  it("training mix counts recovery separately", () => {
    const m = trainingMix(gen(9).slice(0, 7));
    expect(m.training + m.recovery + m.sport + m.checkpoint).toBe(7);
    expect(m.recovery).toBeGreaterThan(0);
  });
  it("no library text promises unsafe or maximal effort", () => {
    for (const a of Object.values(SESSION_LIBRARY)) expect(/to failure|max(imal)? effort|all-out(?! risk)(?!\.)|guarantee/i.test(a.description)).toBe(false);
  });
  it("validates plan inputs", () => {
    expect(validatePlanInputs({ ...inputs, availableWeekdays: [0, 1, 2, 3, 4, 5, 6] }, MON)).toContain("keep_at_least_one_rest_day");
    expect(validatePlanInputs({ ...inputs, availableWeekdays: [] }, MON)).toContain("choose_at_least_one_training_day");
    expect(validatePlanInputs({ ...inputs, eventDate: "2026-01-01" }, MON)).toContain("event_in_past");
    expect(validatePlanInputs(inputs, MON)).toEqual([]);
  });
});

describe("journey acceptance scenarios (pure)", () => {
  it("3-Day Initiation: three eligible dates complete it; no rank is involved", () => {
    const { j } = playDays(createJourney("initiation-3", inputs, MON), MON, 3);
    expect(j.status).toBe("completed");
    expect(j.credited.map((c) => c.reason)).toEqual(["planned_training", expect.any(String), "checkpoint"]);
    expect(nextCheckpoint(j.targetDays, j.credited.length)).toBeNull();
  });
  it("90-Day Transformation chosen directly starts at Day 1/90 with checkpoints 3/9/30/60/90", () => {
    const j = createJourney("transformation-90", { ...inputs, experience: "new" }, MON);
    const v = progressView({ targetDays: j.targetDays, credited: 0, creditedToday: false, todayProgramDay: null, nextScheduledFor: j.sessions[0]!.scheduledFor, today: MON });
    expect(v.displayDay).toBe(1);
    expect(j.sessions).toHaveLength(90);
    expect(j.sessions.filter((s) => s.checkpoint).map((s) => s.programDay)).toEqual([3, 9, 30, 60, 90]);
  });
  it("finish Day 9 then extend to 30: next day is Day 10, history untouched", () => {
    let { j, date } = playDays(createJourney("agoge-9", inputs, MON), MON, 9);
    expect(j.status).toBe("completed");
    const before = j.sessions.slice(0, 9);
    const lastDate = addDays(date, -1);
    j = extendJourney(j, "forge-30", lastDate); // extended the same evening
    expect(j.status).toBe("active");
    expect(j.targetDays).toBe(30);
    expect(j.sessions.slice(0, 9)).toEqual(before);
    expect(j.sessions.find((s) => s.programDay === 10)?.scheduledFor).toBe(date); // tomorrow, since today was credited
    expect(j.changes.at(-1)).toMatchObject({ kind: "extended", fromTemplateKey: "agoge-9", toTemplateKey: "forge-30", effectiveProgramDay: 10 });
    const r = playDays(j, date, 1);
    expect(r.j.credited.at(-1)?.programDay).toBe(10);
  });
  it("early extension (Day 5: 9 → 90) and 3 → 9 both continue the count", () => {
    let { j, date } = playDays(createJourney("agoge-9", inputs, MON), MON, 5);
    j = extendJourney(j, "transformation-90", date);
    expect(j.credited).toHaveLength(5);
    expect(j.sessions).toHaveLength(90);
    expect(sessionFor(j, 6)?.scheduledFor).toBe(date);
    let k = playDays(createJourney("initiation-3", inputs, MON), MON, 3).j;
    k = extendJourney(k, "agoge-9", "2026-11-12");
    expect(k.credited).toHaveLength(3);
    expect(k.status).toBe("active");
  });
  it("shortening and unknown plans throw explicit errors", () => {
    const j = createJourney("transformation-90", inputs, MON);
    expect(() => extendJourney(j, "forge-30", MON)).toThrow(JourneyError);
    expect(() => extendJourney(j, "transformation-90", MON)).toThrow("same_horizon");
  });
  it("recovery qualifies once; extra workouts the same date add nothing; skipped days add nothing", () => {
    let { j, date } = playDays(createJourney("agoge-9", { ...inputs, availableWeekdays: [0] }, MON), MON, 1);
    const recoveryDay = sessionFor(j, 2)!;
    expect(recoveryDay.sessionType).toBe("recovery"); // Tuesday is not a training day
    const r1 = creditDay(j, date, { activityType: "recovery", durationSeconds: 0 });
    expect(r1.credited).toBe(true);
    const r2 = creditDay(r1.journey, date, { activityType: "strength", durationSeconds: 3600 });
    expect(r2.credited).toBe(false);
    expect(r2.reason).toBe("date_already_credited");
    j = r2.journey;
    // skip three calendar days: nothing is credited for them, nothing is lost
    date = addDays(date, 4);
    expect(j.credited).toHaveLength(2);
    const s3 = sessionFor(j, 3)!;
    const r3 = creditDay(j, date, { activityType: s3.primary.allowedActivityTypes[0]!, durationSeconds: s3.primary.minDurationSeconds });
    expect(r3.programDay).toBe(3);
  });
  it("a wrong or too-short activity does not credit the planned day", () => {
    const j = createJourney("agoge-9", inputs, MON);
    expect(creditDay(j, MON, { activityType: "walking", durationSeconds: 60 }).reason).toBe("too_short");
    expect(creditDay(j, MON, { activityType: "recovery", durationSeconds: 0 }).reason).toBe("wrong_activity");
  });
  it("timezone travel and DST cannot double-credit or credit out of order", () => {
    let j = createJourney("agoge-9", inputs, "2026-11-01");
    const tokyo = localDateFor(new Date("2026-11-02T08:00:00Z"), "Asia/Tokyo"); // 11-02
    const ny = localDateFor(new Date("2026-11-02T08:00:00Z"), "America/New_York"); // 11-02 03:00 EST (after fall-back)
    const s1 = sessionFor(j, 1)!;
    const act = { activityType: s1.primary.allowedActivityTypes[0]!, durationSeconds: 3600 };
    j = creditDay(j, tokyo, act).journey;
    expect(creditDay(j, ny, act).credited).toBe(false); // same local date seen from another zone
    expect(creditDay(j, "2026-11-01", act).reason).toBe("date_before_last_credit"); // flying west doesn't re-open yesterday
  });
  it("pause blocks credit and resume re-projects the remaining days (forecast moves, nothing lost)", () => {
    let { j, date } = playDays(createJourney("forge-30", inputs, MON), MON, 4);
    j = pauseJourney(j, date);
    const s = sessionFor(j, 5)!;
    expect(creditDay(j, date, { activityType: s.primary.allowedActivityTypes[0]!, durationSeconds: 3600 }).reason).toBe("journey_paused");
    const later = addDays(date, 10);
    j = resumeJourney(j, later);
    expect(j.status).toBe("active");
    expect(j.credited).toHaveLength(4);
    expect(sessionFor(j, 5)?.scheduledFor).toBe(later);
    expect(progressView({ targetDays: 30, credited: 4, creditedToday: false, todayProgramDay: null, nextScheduledFor: later, today: later }).forecastFinish).toBe(addDays(later, 25));
  });
  it("changing Thursday soccer regenerates only future days", () => {
    let { j, date } = playDays(createJourney("transformation-90", { ...inputs, sportDays: [3], sportName: "Soccer" }, MON), MON, 12);
    const past = j.sessions.slice(0, 12);
    j = adjustPlan(j, { ...j.inputs, sportDays: [1] }, date, "soccer moved to Tuesday");
    expect(j.sessions.slice(0, 12)).toEqual(past);
    const future = j.sessions.filter((s) => s.programDay > 12 && s.sessionType === "sport");
    expect(future.length).toBeGreaterThan(0);
    expect(future.every((s) => weekdayOf(s.scheduledFor) === 1)).toBe(true);
    expect(j.changes.at(-1)?.kind).toBe("plan_adjusted");
  });
  it("progress view reports behind-schedule days for the reschedule prompt", () => {
    const j = createJourney("forge-30", inputs, MON);
    const v = progressView({ targetDays: 30, credited: 0, creditedToday: false, todayProgramDay: null, nextScheduledFor: j.sessions[0]!.scheduledFor, today: addDays(MON, 3) });
    expect(v.behindDays).toBe(3);
  });
});
