import type { CompleteWorkoutInput, MutationResult, NewReward } from "@agogeraining/shared-types";
import { ApiError } from "./api/types";

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
export interface Draft {
  input: CompleteWorkoutInput;
  status: "pending" | "rejected";
  reason?: string;
  createdAt: string;
  attempts: number;
}
export interface FlushResult {
  synced: number;
  pending: number;
  rejected: number;
  newRewards: NewReward[];
}

const KEY = "agogeraining.workout-drafts.v1";

/**
 * Offline workout drafts. Invariants:
 *  - A draft is only removed once the server has accepted it (success or `duplicate: true`).
 *  - Retryable failures (network, expired auth) keep the draft pending; nothing is lost.
 *  - Non-retryable failures keep the draft as `rejected` with a reason so the user can see/fix/discard it.
 *  - XP is never granted locally; the idempotency key makes replays safe.
 */
export function createDraftQueue(store: KeyValueStore, send: (input: CompleteWorkoutInput) => Promise<MutationResult>) {
  const read = async (): Promise<Draft[]> => {
    const raw = await store.getItem(KEY);
    return raw ? (JSON.parse(raw) as Draft[]) : [];
  };
  const write = (d: Draft[]) => store.setItem(KEY, JSON.stringify(d));
  let flushing: Promise<FlushResult> | null = null;

  async function enqueue(input: CompleteWorkoutInput): Promise<void> {
    const drafts = await read();
    if (!drafts.some((d) => d.input.idempotencyKey === input.idempotencyKey)) {
      drafts.push({ input, status: "pending", createdAt: new Date().toISOString(), attempts: 0 });
      await write(drafts);
    }
  }

  async function runFlush(): Promise<FlushResult> {
    const drafts = await read();
    const newRewards: NewReward[] = [];
    let synced = 0;
    const remaining: Draft[] = [];
    let blocked = false;
    for (const d of drafts) {
      if (d.status === "rejected" || blocked) { remaining.push(d); continue; }
      try {
        const res = await send(d.input);
        synced++;
        newRewards.push(...res.newRewards);
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError("unknown", String(e), true);
        if (err.retryable) { blocked = true; remaining.push({ ...d, attempts: d.attempts + 1 }); }
        else remaining.push({ ...d, status: "rejected", reason: err.code, attempts: d.attempts + 1 });
      }
    }
    await write(remaining);
    return {
      synced, newRewards,
      pending: remaining.filter((d) => d.status === "pending").length,
      rejected: remaining.filter((d) => d.status === "rejected").length,
    };
  }

  return {
    enqueue,
    list: read,
    /** Concurrent flushes share one run (no double-send races). */
    flush(): Promise<FlushResult> {
      flushing ??= runFlush().finally(() => { flushing = null; });
      return flushing;
    },
    async discard(idempotencyKey: string): Promise<void> {
      await write((await read()).filter((d) => d.input.idempotencyKey !== idempotencyKey));
    },
  };
}
