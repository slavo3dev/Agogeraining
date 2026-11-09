import type { CompleteWorkoutInput } from "@agogeraining/shared-types";
import { appNow, deviceTimeZone, todayLocal } from "./dates";
import { draftQueue } from "./drafts";
import { platform } from "./platform";
import { invalidateGame } from "./queryClient";
import { useRewards } from "./rewards";

export type SubmitStatus = "synced" | "queued" | "rejected";

export function buildWorkout(p: Omit<CompleteWorkoutInput, "idempotencyKey" | "startedAt" | "localDay" | "timezone" | "origin"> & { startedAt?: string }): CompleteWorkoutInput {
  return {
    ...p, idempotencyKey: platform().randomUUID(), startedAt: p.startedAt ?? new Date(appNow().getTime() - p.durationSeconds * 1000).toISOString(),
    localDay: todayLocal(), timezone: deviceTimeZone(), origin: "manual",
  };
}

/** Persist the draft first (never lost), then try to sync. XP only ever comes back from the server response. */
export async function submitWorkout(input: CompleteWorkoutInput): Promise<{ status: SubmitStatus; reason?: string }> {
  await draftQueue.enqueue(input);
  const result = await draftQueue.flush();
  if (result.newRewards.length) useRewards.getState().show(result.newRewards);
  await invalidateGame();
  const mine = (await draftQueue.list()).find((d) => d.input.idempotencyKey === input.idempotencyKey);
  if (!mine) return { status: "synced" };
  return mine.status === "rejected" ? { status: "rejected", reason: mine.reason } : { status: "queued" };
}
