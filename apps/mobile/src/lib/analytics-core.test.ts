import { describe, expect, it } from "vitest";
import { createAnalytics } from "./analytics-core";

describe("analytics", () => {
  it("sends nothing until the player opts in", () => {
    const seen: string[] = [];
    const a = createAnalytics((e) => seen.push(e));
    a.track("plan_viewed");
    expect(seen).toEqual([]);
    a.setOptIn(true);
    a.track("plan_selected", { plan: "forge-30" });
    expect(seen).toEqual(["plan_selected"]);
  });
  it("derives day_credited and rank_unlocked from server rewards only", () => {
    const seen: Array<[string, unknown]> = [];
    const a = createAnalytics((e, p) => seen.push([e, p]));
    a.setOptIn(true);
    a.trackRewards([{ kind: "xp", amount: 60, label: "+60 XP" }, { kind: "campaign_day", amount: 4, label: "Day 4 complete" }, { kind: "rank_unlocked", label: "Hoplitēs" }]);
    expect(seen).toEqual([["day_credited", { day: 4 }], ["rank_unlocked", { rank: "Hoplitēs" }]]);
  });
  it("a throwing sink never breaks gameplay", () => {
    const a = createAnalytics(() => { throw new Error("boom"); });
    a.setOptIn(true);
    expect(() => a.track("journey_started")).not.toThrow();
  });
});
