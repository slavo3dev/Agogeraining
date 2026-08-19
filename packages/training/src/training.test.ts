import { describe, expect, it } from "vitest";
import { convert, formatDuration, parseDuration, toBase } from "./units";
import { movingAverage, weeklyVolume } from "./stats";
import { EXERCISES } from "./exercises";

describe("units", () => {
  it("mi <-> km", () => {
    expect(convert(3, "mi", "km")).toBeCloseTo(4.828032, 5);
    expect(convert(5, "km", "mi")).toBeCloseTo(3.10686, 4);
  });
  it("kg <-> lb round trip", () => {
    expect(convert(convert(80, "kg", "lb"), "lb", "kg")).toBeCloseTo(80, 9);
    expect(convert(100, "lb", "kg")).toBeCloseTo(45.359237, 6);
  });
  it("rejects cross-dimension conversion", () => {
    expect(() => convert(1, "kg", "km")).toThrow();
  });
  it("toBase", () => {
    expect(toBase(30, "min")).toBe(1800);
    expect(toBase(1, "mi")).toBeCloseTo(1609.344);
  });
  it("parses and formats durations", () => {
    expect(parseDuration("30:00")).toBe(1800);
    expect(parseDuration("1:05:30")).toBe(3930);
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("12:75")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(formatDuration(1800)).toBe("30:00");
    expect(formatDuration(3930)).toBe("1:05:30");
  });
});

describe("stats", () => {
  it("weekly volume separates training and recovery days", () => {
    const week = ["2026-11-02", "2026-11-03", "2026-11-04"];
    const v = weeklyVolume(
      [
        { activityType: "strength", durationSeconds: 1800, origin: "manual", localDay: "2026-11-02" },
        { activityType: "recovery", durationSeconds: 600, origin: "manual", localDay: "2026-11-03" },
        { activityType: "running", durationSeconds: 1200, distanceM: 3000, origin: "manual", localDay: "2026-11-09" },
      ],
      week,
    );
    expect(v).toEqual({ sessions: 2, minutes: 40, distanceM: 0, trainingDays: 1, recoveryDays: 1 });
  });
  it("moving average smooths", () => {
    expect(movingAverage([1, 3, 5], 2)).toEqual([1, 2, 4]);
  });
});

describe("exercise catalog", () => {
  it("slugs are unique and alternatives resolve", () => {
    const slugs = new Set(EXERCISES.map((e) => e.slug));
    expect(slugs.size).toBe(EXERCISES.length);
    for (const e of EXERCISES) for (const a of e.alternatives) expect(slugs.has(a)).toBe(true);
  });
});
