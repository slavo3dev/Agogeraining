import type { LoggedActivity } from "./activity";

export function weeklyVolume(activities: LoggedActivity[], weekDays: string[]) {
  const set = new Set(weekDays);
  const inWeek = activities.filter((a) => set.has(a.localDay));
  return {
    sessions: inWeek.length,
    minutes: Math.round(inWeek.reduce((s, a) => s + a.durationSeconds, 0) / 60),
    distanceM: inWeek.reduce((s, a) => s + (a.distanceM ?? 0), 0),
    trainingDays: new Set(inWeek.filter((a) => a.activityType !== "recovery").map((a) => a.localDay)).size,
    recoveryDays: new Set(inWeek.filter((a) => a.activityType === "recovery").map((a) => a.localDay)).size,
  };
}

/** Simple moving average to show trends rather than day-to-day noise. */
export function movingAverage(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}
