import type { CompleteWorkoutInput, MutationResult } from "@agogeraining/shared-types";
import { describe, expect, it } from "vitest";
import { ApiError } from "./api/types";
import { createDraftQueue, type KeyValueStore } from "./drafts-core";

const memory = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v) };
};
const input = (key: string): CompleteWorkoutInput => ({
  idempotencyKey: key, activityType: "strength", startedAt: "2026-11-02T10:00:00Z", durationSeconds: 1200, localDay: "2026-11-02", timezone: "UTC", origin: "manual",
});
const ok = (): MutationResult => ({
  playerState: { lifetimeXp: 60, level: 2, coins: 10, rankKey: "agoge_trainee", qualifiedDays: 1, campaignState: "active" },
  newRewards: [{ kind: "xp", amount: 60, label: "+60 XP", accessibleText: "You earned 60 experience points." }],
  duplicate: false,
});

describe("offline workout drafts", () => {
  it("keeps the draft when offline, then syncs once and awards via the server only", async () => {
    let online = false; const sent: string[] = [];
    const q = createDraftQueue(memory(), async (i) => {
      if (!online) throw new ApiError("network", "offline", true);
      sent.push(i.idempotencyKey); return ok();
    });
    await q.enqueue(input("k1"));
    expect(await q.flush()).toMatchObject({ synced: 0, pending: 1, rejected: 0 });
    expect((await q.list()).length).toBe(1);
    online = true;
    const r = await q.flush();
    expect(r).toMatchObject({ synced: 1, pending: 0 });
    expect(r.newRewards).toHaveLength(1);
    expect(sent).toEqual(["k1"]);
    expect(await q.list()).toEqual([]);
  });

  it("enqueueing the same key twice stores one draft (no double award on retry-taps)", async () => {
    const q = createDraftQueue(memory(), async () => ok());
    await q.enqueue(input("k1")); await q.enqueue(input("k1"));
    expect((await q.list()).length).toBe(1);
  });

  it("treats a server 'duplicate' as success and removes the draft without new rewards", async () => {
    const q = createDraftQueue(memory(), async () => ({ ...ok(), newRewards: [], duplicate: true }));
    await q.enqueue(input("k1"));
    expect(await q.flush()).toMatchObject({ synced: 1, pending: 0, newRewards: [] });
  });

  it("never silently discards: permanent rejection is retained with a reason until the user discards it", async () => {
    const q = createDraftQueue(memory(), async () => { throw new ApiError("local_day_out_of_range"); });
    await q.enqueue(input("k1"));
    expect(await q.flush()).toMatchObject({ rejected: 1, pending: 0 });
    const [d] = await q.list();
    expect(d).toMatchObject({ status: "rejected", reason: "local_day_out_of_range" });
    await q.flush(); // rejected drafts are not re-sent
    expect((await q.list()).length).toBe(1);
    await q.discard("k1");
    expect(await q.list()).toEqual([]);
  });

  it("a retryable failure blocks later drafts to preserve order; a rejected one does not", async () => {
    const calls: string[] = [];
    const q = createDraftQueue(memory(), async (i) => {
      calls.push(i.idempotencyKey);
      if (i.idempotencyKey === "a") throw new ApiError("network", "x", true);
      return ok();
    });
    await q.enqueue(input("a")); await q.enqueue(input("b"));
    await q.flush();
    expect(calls).toEqual(["a"]);
    expect((await q.list()).map((d) => d.status)).toEqual(["pending", "pending"]);
  });

  it("concurrent flushes share one run", async () => {
    let n = 0;
    const q = createDraftQueue(memory(), async () => { n++; await new Promise((r) => setTimeout(r, 10)); return ok(); });
    await q.enqueue(input("k1"));
    await Promise.all([q.flush(), q.flush(), q.flush()]);
    expect(n).toBe(1);
  });

  it("expired auth (retryable) keeps the draft", async () => {
    const q = createDraftQueue(memory(), async () => { throw new ApiError("not_authenticated", "jwt expired", true); });
    await q.enqueue(input("k1"));
    expect(await q.flush()).toMatchObject({ pending: 1, rejected: 0 });
  });
});
