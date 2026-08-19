import type { AttemptResult, ChallengeRow, CommandCenter, MeasurementRow, MutationResult, ReflectionRow, WorkoutRow } from "@agogeraining/shared-types";
import { MutationResult as MutationResultSchema } from "@agogeraining/shared-types";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { ApiError, type GameApi } from "./types";

const client = () => {
  if (!supabase) throw new ApiError("backend_not_configured", "Backend is not configured. Copy .env.example to apps/mobile/.env.");
  return supabase;
};

/** Maps DB/network failures to stable codes. Network failures are retryable (drafts stay queued). */
function fail(error: PostgrestError | { message: string; code?: string } | null): never {
  const msg = error?.message ?? "unknown_error";
  const network = /network request failed|failed to fetch|timeout|offline/i.test(msg);
  const known = msg.match(/^[a-z_]+/)?.[0] ?? "error";
  throw new ApiError(network ? "network" : known, msg, network || error?.code === "PGRST301");
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) fail(error);
  return data as T;
}
async function rows<T>(q: PromiseLike<{ data: T[] | null; error: PostgrestError | null }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) fail(error);
  return data ?? [];
}

export const remoteApi: GameApi = {
  mode: "remote",
  async hasProfile() {
    const { data, error } = await client().from("profiles").select("user_id").maybeSingle();
    if (error) fail(error);
    return data !== null;
  },
  async createProfile(i) {
    await rpc("create_player_profile", {
      p_display_name: i.displayName, p_avatar_id: i.avatarId, p_timezone: i.timezone, p_unit_system: i.unitSystem,
      p_age_band: i.ageBand ?? null, p_primary_focus: i.primaryFocus, p_secondary_focuses: i.secondaryFocuses,
    });
  },
  async recordConsent(type, granted) {
    await rpc("record_consent", { p_type: type, p_version: "2026-11", p_granted: granted });
  },
  async enroll(i) {
    await rpc("create_campaign_enrollment", { p_template_key: i.templateKey, p_baseline: i.baseline, p_preferences: i.preferences });
  },
  async getCommandCenter(localDate) {
    return rpc<CommandCenter>("get_command_center", { p_local_date: localDate });
  },
  async completeWorkout(i) {
    const raw = await rpc<unknown>("complete_workout", {
      p_idempotency_key: i.idempotencyKey, p_activity_type: i.activityType, p_started_at: i.startedAt,
      p_duration_seconds: i.durationSeconds, p_distance_m: i.distanceM ?? null, p_rpe: i.rpe ?? null,
      p_notes: i.notes ?? null, p_local_day: i.localDay, p_timezone: i.timezone,
    });
    return MutationResultSchema.parse(raw) as MutationResult;
  },
  async listWorkouts() {
    const r = await rows<Record<string, unknown>>(
      client().from("workout_sessions").select("id,activity_type,started_at,local_day,duration_seconds,distance_m,rpe").order("completed_at", { ascending: false }).limit(60),
    );
    return r.map((w): WorkoutRow => ({
      id: String(w.id), activityType: String(w.activity_type), startedAt: String(w.started_at), localDay: String(w.local_day),
      durationSeconds: Number(w.duration_seconds), distanceM: w.distance_m === null ? null : Number(w.distance_m), rpe: w.rpe === null ? null : Number(w.rpe),
    }));
  },
  async recordReflection(localDate, promptKey, text) {
    const raw = await rpc<unknown>("record_stoic_reflection", { p_local_date: localDate, p_prompt_key: promptKey, p_text: text });
    return MutationResultSchema.parse(raw) as MutationResult;
  },
  async listReflections() {
    const r = await rows<Record<string, unknown>>(client().from("stoic_reflections").select("local_date,prompt_key,body").order("local_date", { ascending: false }).limit(60));
    return r.map((x): ReflectionRow => ({ localDate: String(x.local_date), promptKey: String(x.prompt_key), body: String(x.body) }));
  },
  async recordMeasurement(i) {
    await rpc("record_measurement", { p_metric: i.metricType, p_value: i.value, p_unit: i.unit, p_method: i.method ?? null, p_measured_at: i.measuredAt });
  },
  async listMeasurements() {
    const r = await rows<Record<string, unknown>>(client().from("body_measurements").select("id,measured_at,metric_type,value,unit").order("measured_at", { ascending: true }).limit(500));
    return r.map((m): MeasurementRow => ({ id: String(m.id), measuredAt: String(m.measured_at), metricType: m.metric_type as MeasurementRow["metricType"], value: Number(m.value), unit: String(m.unit) }));
  },
  async createChallenge(i) {
    return rpc<string>("create_personal_challenge", {
      p_title: i.title, p_metric: i.metric, p_direction: i.direction, p_baseline: i.baseline ?? null, p_target: i.target, p_unit: i.unit,
      p_due_date: i.dueDate, p_pass_rule: i.passRule, p_safety_notes: i.safetyNotes ?? null, p_linked_rank_key: i.linkedRankKey ?? null,
    });
  },
  async listChallenges() {
    const r = await rows<Record<string, unknown>>(
      client().from("user_challenges").select("id,title,metric,direction,baseline,target,unit,due_date,state,linked_rank_key,pass_rule,resolved:challenge_attempts!user_challenges_resolved_attempt_fk(evidence_type)").order("created_at", { ascending: false }).limit(60),
    );
    return r.map((c): ChallengeRow => {
      const resolved = c.resolved as { evidence_type?: ChallengeRow["evidenceLevel"] } | null;
      return {
        id: String(c.id), title: String(c.title), metric: String(c.metric), direction: c.direction as ChallengeRow["direction"],
        baseline: c.baseline === null ? null : Number(c.baseline), target: Number(c.target), unit: String(c.unit), dueDate: String(c.due_date),
        state: c.state as ChallengeRow["state"], linkedRankKey: (c.linked_rank_key as string | null) ?? null,
        passRule: c.pass_rule as ChallengeRow["passRule"], evidenceLevel: resolved?.evidence_type ?? null,
      };
    });
  },
  async submitAttempt(challengeId, value, unit, key) {
    return rpc<AttemptResult>("submit_challenge_attempt", { p_challenge_id: challengeId, p_value: value, p_unit: unit, p_idempotency_key: key });
  },
  async retryChallenge(id) {
    await rpc("retry_challenge", { p_challenge_id: id });
  },
  async evaluatePromotion(rankKey) {
    return rpc("evaluate_promotion_eligibility", { p_rank_key: rankKey });
  },
  async claimPromotion(rankKey, key) {
    const raw = await rpc<unknown>("claim_promotion", { p_rank_key: rankKey, p_idempotency_key: key });
    return MutationResultSchema.parse(raw) as MutationResult;
  },
  async getSettings() {
    const { data, error } = await client().from("user_settings").select("timezone,unit_system").maybeSingle();
    if (error) fail(error);
    return { timezone: data?.timezone ?? "UTC", unitSystem: (data?.unit_system ?? "metric") as "metric" | "imperial" };
  },
  async exportMyData() {
    return rpc("export_my_data");
  },
  async signOut() {
    await client().auth.signOut();
  },
};
