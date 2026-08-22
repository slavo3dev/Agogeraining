import type {
  AssessmentInput, AssessmentRow, AttemptResult, ChallengeRow, CommandCenter, CreateJourneyInput, GoalInput, GoalRow, MeasurementRow,
  MutationResult, PlanChangeRow, PlanInputsDto, PlannedSessionView, PromotionEvaluation, ReflectionRow, WorkoutRow,
} from "@agogeraining/shared-types";
import type { z } from "zod";
import type { CompleteWorkoutInput, CreateChallengeInput, CreatePlayerProfileInput, RecordMeasurementInput } from "@agogeraining/shared-types";

export class ApiError extends Error {
  constructor(public code: string, message?: string, public retryable = false) {
    super(message ?? code);
  }
}

export interface JourneyPlan {
  sessions: PlannedSessionView[];
  credited: Array<{ programDay: number; localDate: string }>;
}

/** Server-authoritative operations. The `remote` and `demo` implementations share this contract. */
export interface GameApi {
  readonly mode: "remote" | "demo";
  hasProfile(): Promise<boolean>;
  createProfile(input: z.infer<typeof CreatePlayerProfileInput>): Promise<void>;
  recordConsent(type: string, granted: boolean): Promise<void>;
  getCommandCenter(localDate: string): Promise<CommandCenter>;
  completeWorkout(input: CompleteWorkoutInput): Promise<MutationResult>;
  listWorkouts(): Promise<WorkoutRow[]>;
  recordReflection(localDate: string, promptKey: string, text: string): Promise<MutationResult>;
  listReflections(): Promise<ReflectionRow[]>;
  recordMeasurement(input: z.infer<typeof RecordMeasurementInput>): Promise<void>;
  listMeasurements(): Promise<MeasurementRow[]>;
  createChallenge(input: z.infer<typeof CreateChallengeInput>): Promise<string>;
  listChallenges(): Promise<ChallengeRow[]>;
  submitAttempt(challengeId: string, value: number, unit: string, idempotencyKey: string): Promise<AttemptResult>;
  retryChallenge(challengeId: string): Promise<void>;
  evaluatePromotion(rankKey: string): Promise<PromotionEvaluation>;
  claimPromotion(rankKey: string, idempotencyKey: string): Promise<MutationResult>;
  getSettings(): Promise<{ timezone: string; unitSystem: "metric" | "imperial"; analyticsOptIn: boolean }>;
  exportMyData(): Promise<unknown>;
  signOut(): Promise<void>;

  // ---- Choose Your Journey ----
  createJourney(input: CreateJourneyInput): Promise<MutationResult>;
  /** Only call after the player confirmed the preview. Never shortens; history is kept. */
  extendJourney(templateKey: string): Promise<MutationResult>;
  setJourneyPaused(paused: boolean): Promise<void>;
  /** `inputs = null` re-projects the remaining days from today (reschedule). */
  updateJourneyPlan(inputs: PlanInputsDto | null, reason: string | null): Promise<void>;
  getJourneyPlan(journeyId: string): Promise<JourneyPlan>;
  listPlanChanges(journeyId: string): Promise<PlanChangeRow[]>;
  listGoals(): Promise<GoalRow[]>;
  addGoal(goal: GoalInput): Promise<void>;
  recordAssessment(input: AssessmentInput): Promise<void>;
  listAssessments(journeyId: string): Promise<AssessmentRow[]>;
}
