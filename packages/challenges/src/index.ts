export type ChallengeState = "draft" | "active" | "attempted" | "submitted" | "verified" | "passed" | "failed";
export type ChallengeEvent =
  | { type: "activate" }
  | { type: "record_attempt" }
  | { type: "submit" }
  | { type: "verify" }
  | { type: "resolve"; outcome: "passed" | "failed" }
  | { type: "retry" };

const TRANSITIONS: Record<ChallengeState, Partial<Record<ChallengeEvent["type"], ChallengeState>>> = {
  draft: { activate: "active" },
  active: { record_attempt: "attempted" },
  attempted: { submit: "submitted" },
  submitted: { verify: "verified" },
  verified: { resolve: undefined }, // resolved below by outcome
  passed: {},
  failed: { retry: "active" },
};

export interface AuditEvent { from: ChallengeState; to: ChallengeState; event: ChallengeEvent["type"]; at: string }

export class InvalidTransitionError extends Error {
  constructor(public from: ChallengeState, public event: ChallengeEvent["type"]) {
    super(`Invalid challenge transition: ${event} from ${from}`);
  }
}

export function transition(state: ChallengeState, event: ChallengeEvent, at: Date = new Date()): { state: ChallengeState; audit: AuditEvent } {
  let to: ChallengeState | undefined;
  if (state === "verified" && event.type === "resolve") to = event.outcome;
  else to = TRANSITIONS[state][event.type];
  if (!to) throw new InvalidTransitionError(state, event.type);
  return { state: to, audit: { from: state, to, event: event.type, at: at.toISOString() } };
}

export const isTerminal = (s: ChallengeState) => s === "passed";

/** Plausibility screen before a goal becomes active. Not a medical check; just obvious-error catching. */
export interface GoalDraft { metric: string; baseline?: number; target: number; direction: "higher_better" | "lower_better"; startDate: string; dueDate: string }
export function validateGoalDraft(g: GoalDraft): string[] {
  const issues: string[] = [];
  if (!(g.target > 0)) issues.push("target_must_be_positive");
  if (g.dueDate < g.startDate) issues.push("due_before_start");
  if (g.baseline !== undefined && g.baseline > 0) {
    const ratio = g.direction === "higher_better" ? g.target / g.baseline : g.baseline / g.target;
    if (ratio > 2) issues.push("target_more_than_double_baseline_consider_smaller_step");
    if (ratio < 1) issues.push("target_not_an_improvement");
  }
  return issues;
}
