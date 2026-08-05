import type { AuthoritativePlayerState, NewReward, PlanInputsDto } from "./index";

export interface QuestSpecView {
  type: string;
  allowedActivityTypes: string[];
  minDurationSeconds: number;
}
export interface SideQuestView extends QuestSpecView {
  label: string;
  completed: boolean;
  index: number;
}
export interface DayView {
  title: string;
  description: string;
  focus: string;
  spec: {
    primary: QuestSpecView;
    theme: string;
    alternatives: { noGym: string; indoorOnly: string; limitedTime: string; mobility: string };
  };
}
export interface PromotionEvaluation {
  eligible: boolean;
  missing: string[];
  qualifiedDays?: number;
  lifetimeXp?: number;
  requiredDays?: number;
  requiredXp?: number;
  rankKey?: string;
  rankName?: string;
}
export interface CheckpointView { day: number; kind: "readiness" | "promotion"; rankKey: string | null }
export interface PlannedSessionView {
  programDay: number;
  scheduledFor: string;
  phase: "preparation" | "base" | "build" | "peak" | "event" | "transition";
  week: number;
  deload: boolean;
  sessionType: string;
  intensity: "rest" | "easy" | "moderate" | "hard";
  plannedMinutes: number;
  title: string;
  description: string;
  primary: QuestSpecView;
  side: Array<QuestSpecView & { label: string }>;
  alternatives: { noGym: string; indoorOnly: string; limitedTime: string; mobility: string };
  exercises: Array<{ slug: string; sets: number; reps: string }>;
  checkpoint: CheckpointView | null;
}
export interface CommandCenter {
  player: AuthoritativePlayerState;
  profile: { displayName: string; avatarId: string; rankName: string };
  /** The player's current journey (`user_campaigns`). */
  campaign: null | {
    id: string;
    state: "active" | "paused" | "completed";
    qualifiedDays: number;
    totalDays: number;
    programDay: number;
    qualifiedToday: boolean;
    day: DayView;
    sideQuests: SideQuestView[];
    templateKey: string;
    planName: string;
    tier: "prep" | "campaign";
    startDate: string | null;
    generation: number;
    planInputs: PlanInputsDto | null;
    /** Session for `programDay` (today's credited day, or the next one). */
    session: PlannedSessionView | null;
    /** Next uncredited sessions, in order (max 7). */
    upcoming: PlannedSessionView[];
    /** Checkpoint days reached that still have no readiness/checkpoint review. */
    pendingReviews: number[];
  };
  nextRank: PromotionEvaluation | null;
  recentXp: Array<{ source: string; xp: number; at: string }>;
}

export interface WorkoutRow {
  id: string;
  activityType: string;
  startedAt: string;
  localDay: string;
  durationSeconds: number;
  distanceM: number | null;
  rpe: number | null;
}
export interface MeasurementRow {
  id: string;
  measuredAt: string;
  metricType: "weight" | "body_fat" | "waist" | "pushups_max" | "grip";
  value: number;
  unit: string;
}
export type ChallengeStateView = "draft" | "active" | "attempted" | "submitted" | "verified" | "passed" | "failed";
export interface ChallengeRow {
  id: string;
  title: string;
  metric: string;
  direction: "higher_better" | "lower_better";
  baseline: number | null;
  target: number;
  unit: string;
  dueDate: string;
  state: ChallengeStateView;
  linkedRankKey: string | null;
  passRule: "meet_target" | "improve_on_baseline";
  evidenceLevel: "self_reported" | "device_recorded" | "admin_reviewed" | null;
}
export interface ReflectionRow { localDate: string; promptKey: string; body: string }
export interface AttemptResult {
  playerState: AuthoritativePlayerState;
  newRewards: NewReward[];
  duplicate: boolean;
  outcome?: "passed" | "failed" | "needs_review" | string;
}

export interface GoalRow {
  id: string;
  title: string;
  metric: string;
  direction: "higher_better" | "lower_better";
  baseline: number | null;
  target: number;
  unit: string;
  targetDate: string;
  status: "active" | "achieved" | "retired";
}
export interface PlanChangeRow {
  kind: string;
  fromTemplateKey: string | null;
  toTemplateKey: string;
  effectiveProgramDay: number;
  effectiveDate: string;
  reason: string | null;
  createdAt: string;
}
export interface AssessmentRow { checkpointDay: number; responses: Record<string, unknown>; createdAt: string }
