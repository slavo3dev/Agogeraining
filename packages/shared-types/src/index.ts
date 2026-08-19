import { z } from "zod";

export const ActivityTypeSchema = z.enum([
  "running", "walking", "hiking", "cycling", "swimming", "strength", "mobility", "obstacle", "recovery", "custom",
]);
export const UnitSystemSchema = z.enum(["metric", "imperial"]);
export const GoalFocusSchema = z.enum(["strength", "cardio", "hybrid", "mobility", "general_health"]);
export const EvidenceLevelSchema = z.enum(["self_reported", "device_recorded", "admin_reviewed"]);

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const CreatePlayerProfileInput = z.object({
  displayName: z.string().trim().min(2).max(32),
  avatarId: z.string().min(1).max(40),
  timezone: z.string().min(1),
  unitSystem: UnitSystemSchema,
  ageBand: z.enum(["18-29", "30-39", "40-49", "50-59", "60+"]).optional(),
  primaryFocus: GoalFocusSchema,
  secondaryFocuses: z.array(GoalFocusSchema).max(4).default([]),
});

export const CampaignEnrollmentInput = z.object({
  templateKey: z.string().default("agoge-9"),
  baseline: z.object({
    pushUps: z.number().int().min(0).max(500).optional(),
    walkMinutes: z.number().min(0).max(600).optional(),
    weightKg: z.number().min(20).max(400).optional(),
    notes: z.string().max(500).optional(),
  }),
  preferences: z.object({
    preferredDays: z.array(z.number().int().min(0).max(6)).max(7),
    equipment: z.enum(["none", "home_basic", "full_gym"]),
    limitations: z.string().max(500).optional(),
    difficulty: z.enum(["gentle", "standard", "challenging"]).default("standard"),
  }),
});

export const CompleteWorkoutInput = z.object({
  idempotencyKey: z.string().uuid(),
  activityType: ActivityTypeSchema,
  startedAt: z.string().datetime(),
  durationSeconds: z.number().int().min(0).max(60 * 60 * 12),
  distanceM: z.number().min(0).max(500_000).optional(),
  rpe: z.number().int().min(1).max(10).optional(),
  notes: z.string().max(2000).optional(),
  localDay: localDate,
  timezone: z.string(),
  origin: z.literal("manual"),
});
export type CompleteWorkoutInput = z.infer<typeof CompleteWorkoutInput>;

export const RecordMeasurementInput = z.object({
  metricType: z.enum(["weight", "body_fat", "waist", "pushups_max", "grip"]),
  value: z.number().positive(),
  unit: z.enum(["kg", "lb", "cm", "in", "percent", "reps"]),
  method: z.string().max(80).optional(),
  measuredAt: z.string().datetime(),
});

export const RecordReflectionInput = z.object({ localDate, text: z.string().trim().min(1).max(2000), promptKey: z.string() });

export const CreateChallengeInput = z.object({
  title: z.string().trim().min(3).max(80),
  metric: z.string().min(1).max(40),
  direction: z.enum(["higher_better", "lower_better"]),
  baseline: z.number().nonnegative().optional(),
  target: z.number().positive(),
  unit: z.enum(["kg", "lb", "m", "km", "mi", "s", "min", "h", "reps"]),
  dueDate: localDate,
  evidenceMethod: z.enum(["self_reported"]), // device_recorded / admin_reviewed planned (Phase 4)
  passRule: z.enum(["meet_target", "improve_on_baseline"]).default("meet_target"),
  safetyNotes: z.string().max(500).optional(),
  linkedRankKey: z.string().optional(),
});

export const SubmitAttemptInput = z.object({
  challengeId: z.string().uuid(),
  value: z.number().nonnegative(),
  unit: z.enum(["kg", "lb", "m", "km", "mi", "s", "min", "h", "reps"]),
  idempotencyKey: z.string().uuid(),
});

export const ClaimPromotionInput = z.object({ rankKey: z.string(), idempotencyKey: z.string().uuid() });

export const NewRewardSchema = z.object({
  kind: z.enum(["xp", "coins", "level_up", "rank_unlocked", "campaign_day"]),
  amount: z.number().optional(),
  label: z.string(),
  accessibleText: z.string(),
});
export type NewReward = z.infer<typeof NewRewardSchema>;

export const AuthoritativePlayerState = z.object({
  lifetimeXp: z.number().int(),
  level: z.number().int(),
  coins: z.number().int(),
  rankKey: z.string(),
  qualifiedDays: z.number().int(),
  campaignState: z.enum(["active", "paused", "completed", "none"]),
});
export type AuthoritativePlayerState = z.infer<typeof AuthoritativePlayerState>;

export const MutationResult = z.object({
  playerState: AuthoritativePlayerState,
  newRewards: z.array(NewRewardSchema),
  duplicate: z.boolean().default(false),
});
export type MutationResult = z.infer<typeof MutationResult>;

export type FeatureStatus = "implemented" | "feature_flagged" | "planned";
export * from "./views";
