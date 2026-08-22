/**
 * Product analytics, opt-in only. No vendor SDK ships yet: events go to a pluggable sink (dev console by default).
 * Payloads carry plan/day/rank identifiers only — never measurements, notes, goals or health data.
 */
export type AnalyticsEvent =
  | "plan_viewed" | "plan_selected" | "journey_started" | "day_credited" | "journey_extended" | "trial_attempted" | "rank_unlocked";
export type AnalyticsProps = Record<string, string | number | boolean | null>;
export type AnalyticsSink = (event: AnalyticsEvent, props: AnalyticsProps) => void;

export function createAnalytics(initialSink: AnalyticsSink | null) {
  let optedIn = false;
  let sink = initialSink;
  return {
    setOptIn(v: boolean) { optedIn = v; },
    setSink(s: AnalyticsSink | null) { sink = s; },
    track(event: AnalyticsEvent, props: AnalyticsProps = {}) {
      if (!optedIn || !sink) return;
      try { sink(event, props); } catch { /* analytics must never break gameplay */ }
    },
    /** Derive gameplay events from server-confirmed rewards (never from optimistic client state). */
    trackRewards(rewards: Array<{ kind: string; amount?: number; label: string }>) {
      for (const r of rewards) {
        if (r.kind === "campaign_day") this.track("day_credited", { day: r.amount ?? null });
        if (r.kind === "rank_unlocked") this.track("rank_unlocked", { rank: r.label });
      }
    },
  };
}
