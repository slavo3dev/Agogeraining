import { describe, expect, it } from "vitest";
import { AssessmentInputSchema, CompleteWorkoutInput, CreateChallengeInput, CreateJourneyInput, CreatePlayerProfileInput, PlanInputsSchema } from "./index";

describe("input schemas", () => {
  const base = { idempotencyKey: "11111111-1111-4111-8111-111111111111", activityType: "strength", startedAt: "2026-11-02T10:00:00Z", durationSeconds: 1200, localDay: "2026-11-02", timezone: "UTC", origin: "manual" };
  it("accepts a valid workout", () => expect(CompleteWorkoutInput.safeParse(base).success).toBe(true));
  it("rejects client-supplied XP-ish fields silently stripped and bad data refused", () => {
    expect(CompleteWorkoutInput.parse({ ...base, xp: 99999 })).not.toHaveProperty("xp");
    expect(CompleteWorkoutInput.safeParse({ ...base, durationSeconds: -1 }).success).toBe(false);
    expect(CompleteWorkoutInput.safeParse({ ...base, idempotencyKey: "nope" }).success).toBe(false);
    expect(CompleteWorkoutInput.safeParse({ ...base, origin: "healthkit" }).success).toBe(false);
  });
  it("profile requires a sane display name", () => {
    expect(CreatePlayerProfileInput.safeParse({ displayName: "A", avatarId: "a", timezone: "UTC", unitSystem: "metric", primaryFocus: "hybrid" }).success).toBe(false);
  });
  it("challenge evidence is limited to self_reported in MVP", () => {
    const c = { title: "Push-ups", metric: "pushups", direction: "higher_better", target: 20, unit: "reps", dueDate: "2026-11-11", evidenceMethod: "device_recorded" };
    expect(CreateChallengeInput.safeParse(c).success).toBe(false);
  });
});

describe("journey contracts", () => {
  const inputs = { experience: "new", focus: "hybrid", availableWeekdays: [0, 2, 4], sportDays: [3], sportName: "Soccer", maxSessionMinutes: 45, equipment: "none", hasLimitations: false, recoveryStyle: "active", eventDate: null };
  const goal = { title: "More push-ups", metric: "pushups", direction: "higher_better", baseline: 8, target: 12, unit: "reps", targetDate: "2027-01-30" };
  it("accepts a valid journey and strips client-sent progress fields", () => {
    const parsed = CreateJourneyInput.parse({ templateKey: "transformation-90", planInputs: inputs, baseline: {}, goal, timezone: "UTC", qualifiedDays: 90, rankKey: "polemarchos" });
    expect(parsed).not.toHaveProperty("qualifiedDays");
    expect(parsed).not.toHaveProperty("rankKey");
  });
  it("only the six horizons exist", () => {
    expect(CreateJourneyInput.safeParse({ templateKey: "forever-999", planInputs: inputs, baseline: {}, goal, timezone: "UTC" }).success).toBe(false);
  });
  it("keeps a rest day and bounds sessions", () => {
    expect(PlanInputsSchema.safeParse({ ...inputs, availableWeekdays: [0, 1, 2, 3, 4, 5, 6] }).success).toBe(false);
    expect(PlanInputsSchema.safeParse({ ...inputs, availableWeekdays: [] }).success).toBe(false);
    expect(PlanInputsSchema.safeParse({ ...inputs, availableWeekdays: [1, 1] }).success).toBe(false);
    expect(PlanInputsSchema.safeParse({ ...inputs, maxSessionMinutes: 600 }).success).toBe(false);
    expect(PlanInputsSchema.safeParse({ ...inputs, sportDays: [7] }).success).toBe(false);
  });
  it("a journey requires a measurable goal", () => {
    expect(CreateJourneyInput.safeParse({ templateKey: "agoge-9", planInputs: inputs, baseline: {}, timezone: "UTC" }).success).toBe(false);
    expect(CreateJourneyInput.safeParse({ templateKey: "agoge-9", planInputs: inputs, baseline: {}, goal: { ...goal, target: 0 }, timezone: "UTC" }).success).toBe(false);
  });
  it("checkpoint reviews only on checkpoint days", () => {
    const r = { energy: 3, soreness: 2, scheduleFit: "good", confidence: 4 };
    expect(AssessmentInputSchema.safeParse({ checkpointDay: 3, responses: r }).success).toBe(true);
    expect(AssessmentInputSchema.safeParse({ checkpointDay: 4, responses: r }).success).toBe(false);
  });
});
