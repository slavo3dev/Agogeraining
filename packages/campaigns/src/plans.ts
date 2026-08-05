/**
 * Choose Your Journey — versioned plan templates, checkpoints and the (non-binding) recommendation.
 *
 * Separate concepts, never synonyms:
 *  - plan horizon     = durationDays of the selected template (3/9/30/60/90/300)
 *  - journey days     = eligible program days credited so far (one per local date, never shrinks)
 *  - training phase   = preparation/base/build/peak/event/transition (see programming.ts)
 *  - XP level         = game-engine levels (XP ledger)
 *  - Spartan rank     = earned only through a validated promotion trial (game-engine ranks)
 * Choosing a long plan never grants rank and is never locked behind experience.
 */
export type PlanTier = "prep" | "campaign";

export interface PlanTemplate {
  key: string;
  tier: PlanTier;
  durationDays: number;
  version: number;
  name: string;
  tagline: string;
  suits: string;
  commitment: string;
  intensity: string;
  sampleDay: string;
  earnable: string[];
}

export const PLAN_TEMPLATES: readonly PlanTemplate[] = [
  {
    key: "initiation-3", tier: "prep", durationDays: 3, version: 1, name: "3-Day Initiation",
    tagline: "Three gentle days to find your footing.",
    suits: "Brand new, returning after a long break, or unsure what you can manage.",
    commitment: "10–15 minutes a day for three days.",
    intensity: "Easy. Conversation pace and technique only.",
    sampleDay: "Day 2: full-body technique — squat, push, pull, hinge at easy effort.",
    earnable: ["Readiness review at Day 3", "Orientation milestone (not a rank)"],
  },
  {
    key: "agoge-9", tier: "prep", durationDays: 9, version: 1, name: "9-Day Agōgē",
    tagline: "Build a rhythm and earn your first trial.",
    suits: "Anyone ready for a short, structured start with planned recovery.",
    commitment: "15–35 minutes on training days; two or more recovery days.",
    intensity: "Easy to moderate. Never all-out.",
    sampleDay: "Day 5: controlled strength progress — repeat Day 2 and add a rep where it felt easy.",
    earnable: ["Readiness review at Day 3", "Hoplitēs promotion trial at Day 9"],
  },
  {
    key: "forge-30", tier: "campaign", durationDays: 30, version: 1, name: "30-Day Forge",
    tagline: "Consistency, basic strength and conditioning.",
    suits: "People who want a month-long habit with simple weekly progression.",
    commitment: "Your chosen training days per week, 20–50 minutes.",
    intensity: "Easy to moderate, progressing a little each week.",
    sampleDay: "Strength: 3 rounds of goblet squat, push-up, row, hinge and plank.",
    earnable: ["Day 3 and Day 9 checkpoints", "Enōmotarchēs promotion trial at Day 30"],
  },
  {
    key: "discipline-60", tier: "campaign", durationDays: 60, version: 1, name: "60-Day Discipline",
    tagline: "Progressive strength and endurance, with real recovery.",
    suits: "People who've trained before and want steady, structured progress.",
    commitment: "Your chosen training days, 25–55 minutes, with lighter deload weeks.",
    intensity: "Moderate, with an optional quality cardio day in the build phase.",
    sampleDay: "Build week: 3×8 strength circuit, then a 5-minute mobility flow.",
    earnable: ["Day 3/9/30 checkpoints", "Pentēkontēr promotion trial at Day 60"],
  },
  {
    key: "transformation-90", tier: "campaign", durationDays: 90, version: 1, name: "90-Day Transformation",
    tagline: "A personalized, periodized program — with an optional event taper.",
    suits: "Any level. Beginners get beginner sessions; the horizon is just longer.",
    commitment: "Your chosen training days, scaled to your baseline.",
    intensity: "Preparation → base → build; taper before your event if you add one.",
    sampleDay: "Base week: 35-minute Zone 2 session you can hold a conversation through.",
    earnable: ["Day 3/9/30/60 checkpoints", "Lochagos promotion trial at Day 90"],
  },
  {
    key: "legacy-300", tier: "campaign", durationDays: 300, version: 1, name: "300-Day Legacy",
    tagline: "Long-term, sustainable development.",
    suits: "People building a lifelong habit. Pause anytime without losing progress.",
    commitment: "Your chosen training days, adjustable whenever life changes.",
    intensity: "Periodized blocks with planned transition weeks.",
    sampleDay: "Transition week: shorter, easier sessions to absorb months of work.",
    earnable: ["Day 3/9/30/60/90 checkpoints", "Polemarchos final trial at Day 300"],
  },
];

export const PLAN_DURATIONS = PLAN_TEMPLATES.map((p) => p.durationDays);

export function planByKey(key: string): PlanTemplate | undefined {
  return PLAN_TEMPLATES.find((p) => p.key === key);
}
export function planByDuration(days: number): PlanTemplate | undefined {
  return PLAN_TEMPLATES.find((p) => p.durationDays === days);
}

// ---------- checkpoints ----------
export const CHECKPOINT_DAYS = [3, 9, 30, 60, 90, 300] as const;
/** Promotion gates. Rank changes only on a validated trial — never by elapsed days or XP alone. */
export const RANK_GATE_BY_DAY: Readonly<Record<number, string>> = { 9: "hoplites", 30: "enomotarches", 60: "pentekonter", 90: "lochagos", 300: "polemarchos" };

export interface Checkpoint { day: number; kind: "readiness" | "promotion"; rankKey: string | null }

export function checkpointsFor(horizon: number): Checkpoint[] {
  return CHECKPOINT_DAYS.filter((d) => d <= horizon).map((day) => ({
    day, kind: day === 3 ? "readiness" : "promotion", rankKey: RANK_GATE_BY_DAY[day] ?? null,
  }));
}
export function nextCheckpoint(horizon: number, creditedDays: number): Checkpoint | null {
  return checkpointsFor(horizon).find((c) => c.day > creditedDays) ?? null;
}

// ---------- extension ----------
export type ExtendCheck = { ok: true } | { ok: false; reason: "unknown_plan" | "shortening_not_supported" | "same_horizon" };

/** Extending only ever grows the horizon. Shortening is refused explicitly (pause or start fresh instead). */
export function canExtend(fromDays: number, toDays: number): ExtendCheck {
  if (!PLAN_DURATIONS.includes(toDays)) return { ok: false, reason: "unknown_plan" };
  if (toDays === fromDays) return { ok: false, reason: "same_horizon" };
  if (toDays < fromDays) return { ok: false, reason: "shortening_not_supported" };
  return { ok: true };
}
export function extensionOptions(fromDays: number): PlanTemplate[] {
  return PLAN_TEMPLATES.filter((p) => p.durationDays > fromDays);
}

// ---------- recommendation ----------
export interface ReadinessAnswers {
  experience: "new" | "returning" | "regular" | "experienced";
  availableDays: number;
  focus: "strength" | "cardio" | "hybrid" | "mobility" | "general_health";
  hasLimitations: boolean;
  /** Days until an optional event, if any. */
  daysToEvent: number | null;
}

/**
 * A suggestion only — every plan stays selectable. Longer plans scale to the athlete's baseline,
 * so the recommendation is about commitment and support, never about permission.
 */
export function recommendPlan(a: ReadinessAnswers): string {
  if (a.hasLimitations && (a.experience === "new" || a.experience === "returning")) return "initiation-3";
  if (a.experience === "new") return a.availableDays <= 2 ? "initiation-3" : "agoge-9";
  if (a.experience === "returning") return a.availableDays <= 2 ? "agoge-9" : "forge-30";
  const eventSoon = a.daysToEvent !== null && a.daysToEvent >= 17 && a.daysToEvent <= 100;
  if (a.experience === "regular") return eventSoon ? "transformation-90" : "discipline-60";
  if (eventSoon) return "transformation-90";
  return a.focus === "general_health" ? "legacy-300" : "transformation-90";
}
