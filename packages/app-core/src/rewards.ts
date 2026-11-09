import type { NewReward } from "@agogeraining/shared-types";
import { create } from "zustand";
import { analytics } from "./analytics";

/** Rewards come from server responses only; this store just queues them for presentation. */
interface RewardsState { queue: NewReward[]; show: (r: NewReward[]) => void; dismiss: () => void }
export const useRewards = create<RewardsState>((set) => ({
  queue: [],
  show: (r) => { if (!r.length) return; analytics.trackRewards(r); set((s) => ({ queue: [...s.queue, ...r] })); },
  dismiss: () => set({ queue: [] }),
}));
