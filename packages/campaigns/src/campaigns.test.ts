import { describe, expect, it } from "vitest";
import {
  AGOGE_9, addDays, applyQualifyingActivity, daysBetween, fixedClock, localDateFor, newCampaign, pauseCampaign,
  resumeCampaign, weekDays,
} from "./index";

describe("local dates", () => {
  it("same instant is different local days in different zones", () => {
    const t = new Date("2026-11-03T03:30:00Z");
    expect(localDateFor(t, "UTC")).toBe("2026-11-03");
    expect(localDateFor(t, "America/New_York")).toBe("2026-11-02");
    expect(localDateFor(t, "Asia/Tokyo")).toBe("2026-11-03");
  });
  it("DST fall-back (NY 2026-11-01): 25-hour day still maps to one local date per instant", () => {
    expect(localDateFor(new Date("2026-11-01T04:30:00Z"), "America/New_York")).toBe("2026-11-01"); // 00:30 EDT
    expect(localDateFor(new Date("2026-11-01T06:30:00Z"), "America/New_York")).toBe("2026-11-01"); // 01:30 EST
    expect(localDateFor(new Date("2026-11-02T04:59:00Z"), "America/New_York")).toBe("2026-11-01"); // 23:59 EST
    expect(localDateFor(new Date("2026-11-02T05:00:00Z"), "America/New_York")).toBe("2026-11-02");
  });
  it("DST spring-forward (NY 2026-03-08) doesn't skip or duplicate a date", () => {
    expect(localDateFor(new Date("2026-03-08T06:59:00Z"), "America/New_York")).toBe("2026-03-08");
    expect(localDateFor(new Date("2026-03-09T03:59:00Z"), "America/New_York")).toBe("2026-03-08");
    expect(localDateFor(new Date("2026-03-09T04:00:00Z"), "America/New_York")).toBe("2026-03-09");
  });
  it("date arithmetic is calendar-based", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(daysBetween("2026-03-07", "2026-03-10")).toBe(3);
  });
  it("week starts Monday", () => {
    const w = weekDays("2026-11-04");
    expect(w[0]).toBe("2026-11-02");
    expect(w[6]).toBe("2026-11-08");
  });
  it("fixed clock", () => {
    expect(fixedClock("2026-11-02T00:00:00Z").now().toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });
});

describe("campaign progress", () => {
  it("a missed calendar day never erases progress; the next qualifying day continues the count", () => {
    let c = newCampaign(9);
    c = applyQualifyingActivity(c, "2026-11-02").progress;
    c = applyQualifyingActivity(c, "2026-11-03").progress;
    // missed 11-04 .. 11-08
    const r = applyQualifyingActivity(c, "2026-11-09");
    expect(r.programDay).toBe(3);
    expect(r.progress.records).toHaveLength(3);
  });
  it("two qualifying activities on the same local day count once", () => {
    let c = newCampaign(9);
    c = applyQualifyingActivity(c, "2026-11-02").progress;
    const r = applyQualifyingActivity(c, "2026-11-02");
    expect(r.newlyQualified).toBe(false);
    expect(r.progress.records).toHaveLength(1);
  });
  it("travel across timezones: late-evening NY then 'next morning' in Tokyo are different local dates", () => {
    const a = localDateFor(new Date("2026-11-03T02:00:00Z"), "America/New_York"); // 11-02 21:00
    const b = localDateFor(new Date("2026-11-03T08:00:00Z"), "Asia/Tokyo"); // 11-03 17:00
    let c = applyQualifyingActivity(newCampaign(9), a).progress;
    c = applyQualifyingActivity(c, b).progress;
    expect(c.records.map((r) => r.localDate)).toEqual(["2026-11-02", "2026-11-03"]);
  });
  it("pause blocks advancement, resume restores it, history kept", () => {
    let c = applyQualifyingActivity(newCampaign(9), "2026-11-02").progress;
    c = pauseCampaign(c);
    expect(applyQualifyingActivity(c, "2026-11-03").newlyQualified).toBe(false);
    c = resumeCampaign(c);
    const r = applyQualifyingActivity(c, "2026-11-10");
    expect(r.progress.records).toHaveLength(2);
  });
  it("completes after the 9th qualifying day and stops advancing", () => {
    let c = newCampaign(9);
    for (let i = 0; i < 9; i++) c = applyQualifyingActivity(c, addDays("2026-11-02", i)).progress;
    expect(c.state).toBe("completed");
    expect(applyQualifyingActivity(c, "2026-11-20").newlyQualified).toBe(false);
  });
});

describe("9-day template", () => {
  it("has 9 sequential days, recovery days that need no activity, and alternatives everywhere", () => {
    expect(AGOGE_9.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(AGOGE_9.filter((d) => d.focus === "recovery").every((d) => d.primary.minDurationSeconds === 0)).toBe(true);
    expect(AGOGE_9.every((d) => d.alternatives.noGym && d.alternatives.mobility)).toBe(true);
  });
  it("never prescribes maximal-effort daily work", () => {
    expect(AGOGE_9.every((d) => !/max(imal)? effort|to failure|100\/100/i.test(d.description))).toBe(true);
  });
});
