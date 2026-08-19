import type {
  AttemptResult, ChallengeRow, CommandCenter, MeasurementRow, MutationResult, PromotionEvaluation,
  ReflectionRow, WorkoutRow,
} from "@agogeraining/shared-types";
import type { z } from "zod";
import type {
  CampaignEnrollmentInput, CompleteWorkoutInput, CreateChallengeInput, CreatePlayerProfileInput, RecordMeasurementInput,
} from "@agogeraining/shared-types";

export class ApiError extends Error {
  constructor(public code: string, message?: string, public retryable = false) {
    super(message ?? code);
  }
}

/** Server-authoritative operations. The `remote` and `demo` implementations share this contract. */
export interface GameApi {
  readonly mode: "remote" | "demo";
  hasProfile(): Promise<boolean>;
  createProfile(input: z.infer<typeof CreatePlayerProfileInput>): Promise<void>;
  recordConsent(type: string, granted: boolean): Promise<void>;
  enroll(input: z.infer<typeof CampaignEnrollmentInput>): Promise<void>;
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
  getSettings(): Promise<{ timezone: string; unitSystem: "metric" | "imperial" }>;
  exportMyData(): Promise<unknown>;
  signOut(): Promise<void>;
}
