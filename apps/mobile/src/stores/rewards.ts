import type { NewReward } from "@agogeraining/shared-types";
import { create } from "zustand";

/** Rewards come from server responses only; this store just queues them for presentation. */
interface RewardsState { queue: NewReward[]; show: (r: NewReward[]) => void; dismiss: () => void }
export const useRewards = create<RewardsState>((set) => ({
  queue: [],
  show: (r) => r.length && set((s) => ({ queue: [...s.queue, ...r] })),
  dismiss: () => set({ queue: [] }),
}));
