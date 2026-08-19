import { describe, expect, it } from "vitest";
import { InvalidTransitionError, transition, validateGoalDraft, type ChallengeEvent, type ChallengeState } from "./index";

const run = (events: ChallengeEvent[], start: ChallengeState = "draft") =>
  events.reduce((s, e) => transition(s, e).state, start);

describe("challenge state machine", () => {
  it("happy path draft -> passed", () => {
    expect(run([{ type: "activate" }, { type: "record_attempt" }, { type: "submit" }, { type: "verify" }, { type: "resolve", outcome: "passed" }])).toBe("passed");
  });
  it("failed trials can be retried", () => {
    expect(run([{ type: "activate" }, { type: "record_attempt" }, { type: "submit" }, { type: "verify" }, { type: "resolve", outcome: "failed" }, { type: "retry" }])).toBe("active");
  });
  it("rejects skipping states (can't pass without verification)", () => {
    expect(() => transition("submitted", { type: "resolve", outcome: "passed" })).toThrow(InvalidTransitionError);
    expect(() => transition("draft", { type: "submit" })).toThrow(InvalidTransitionError);
    expect(() => transition("passed", { type: "retry" })).toThrow(InvalidTransitionError);
  });
  it("emits audit events", () => {
    const r = transition("draft", { type: "activate" }, new Date("2026-11-02T00:00:00Z"));
    expect(r.audit).toEqual({ from: "draft", to: "active", event: "activate", at: "2026-11-02T00:00:00.000Z" });
  });
});

describe("goal plausibility", () => {
  const base = { metric: "pushups", baseline: 10, target: 15, direction: "higher_better" as const, startDate: "2026-11-02", dueDate: "2026-11-11" };
  it("accepts a modest improvement", () => expect(validateGoalDraft(base)).toEqual([]));
  it("flags huge jumps and non-improvements", () => {
    expect(validateGoalDraft({ ...base, target: 30 })).toContain("target_more_than_double_baseline_consider_smaller_step");
    expect(validateGoalDraft({ ...base, target: 8 })).toContain("target_not_an_improvement");
  });
  it("lower-is-better direction", () => {
    expect(validateGoalDraft({ ...base, metric: "run", baseline: 40, target: 36, direction: "lower_better" })).toEqual([]);
  });
  it("flags bad dates", () => expect(validateGoalDraft({ ...base, dueDate: "2026-11-01" })).toContain("due_before_start"));
});
