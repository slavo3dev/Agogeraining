import type { AuthoritativePlayerState, NewReward } from "./index";

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
export interface CommandCenter {
  player: AuthoritativePlayerState;
  profile: { displayName: string; avatarId: string; rankName: string };
  campaign: null | {
    id: string;
    state: "active" | "paused" | "completed";
    qualifiedDays: number;
    totalDays: number;
    programDay: number;
    qualifiedToday: boolean;
    day: DayView;
    sideQuests: SideQuestView[];
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
