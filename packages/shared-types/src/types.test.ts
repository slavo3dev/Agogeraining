import { describe, expect, it } from "vitest";
import { CompleteWorkoutInput, CreateChallengeInput, CreatePlayerProfileInput } from "./index";

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
