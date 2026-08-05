import { RANK_META } from "@agogeraining/game-engine";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const PHASE_LABEL: Record<string, string> = {
  preparation: "Preparation", base: "Base", build: "Build", peak: "Taper", event: "Event", transition: "Transition",
};
export const PHASE_HINT: Record<string, string> = {
  preparation: "Learn the movements and build the habit.",
  base: "Aerobic base and steady strength.",
  build: "Gradual progression with one quality day when you're ready.",
  peak: "Less volume, stay sharp for your event.",
  event: "Your event.",
  transition: "Lighter week to absorb the work.",
};
export const INTENSITY_LABEL: Record<string, string> = { rest: "Rest", easy: "Easy", moderate: "Moderate", hard: "Hard (controlled)" };

export function rankLabel(rankKey: string | null): string {
  return RANK_META.find((r) => r.rankKey === rankKey)?.name ?? "";
}

export function checkpointLabel(c: { day: number; kind: string; rankKey: string | null }): string {
  return c.kind === "readiness" ? `Day ${c.day} · Readiness review` : `Day ${c.day} · ${rankLabel(c.rankKey)} trial`;
}

/** "Thu 12 Nov" from a YYYY-MM-DD local date (timezone-independent). */
export function shortDate(localDate: string): string {
  const [y, m, d] = localDate.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[(dt.getUTCDay() + 6) % 7]} ${d} ${dt.toLocaleString("en", { month: "short", timeZone: "UTC" })}`;
}

export const JOURNEY_ERRORS: Record<string, string> = {
  shortening_not_supported: "Journeys can only be extended. To do less, pause or adjust your training days instead.",
  same_horizon: "You're already on that plan.",
  confirmation_required: "Please confirm the change first.",
  resume_before_extending: "Resume your journey before extending it.",
  another_journey_open: "You already have another journey in progress.",
  keep_at_least_one_rest_day: "Keep at least one rest day each week.",
  choose_at_least_one_training_day: "Choose at least one training day.",
  too_many_sport_days: "Up to four fixed sport days per week.",
  event_in_past: "The event date is in the past.",
  event_too_far: "Pick an event within the next 400 days.",
  goal_required: "Choose at least one measurable goal.",
  target_implausible_choose_smaller_step: "That target is more than 3× your baseline — pick a smaller step.",
  checkpoint_not_reached: "You haven't reached that checkpoint yet.",
};
export function journeyErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const code = msg.match(/^[a-z_]+/)?.[0] ?? "";
  return JOURNEY_ERRORS[code] ?? msg.replace(/_/g, " ");
}

/** Personalised display title (e.g. "Soccer" instead of "Your sport"). Content itself comes from the server plan. */
export function sessionTitle(s: { sessionType: string; title: string }, sportName?: string | null): string {
  return s.sessionType === "sport" && sportName ? sportName : s.title;
}
