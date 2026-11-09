import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";
import { demoApi } from "./api/demo";
import { platform } from "./platform";

type Mode = "none" | "remote" | "demo";
interface SessionState {
  ready: boolean;
  mode: Mode;
  session: Session | null;
  hasProfile: boolean | null;
  setHasProfile: (v: boolean) => void;
  startDemo: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  ready: false,
  mode: "none",
  session: null,
  hasProfile: null,
  setHasProfile: (hasProfile) => set({ hasProfile }),
  startDemo: async () => { await demoApi.getSettings(); /* loads persisted demo state + clock */ set({ mode: "demo", session: null, hasProfile: null, ready: true }); },
  signOut: async () => {
    if (get().mode === "demo") await demoApi.reset();
    else await platform().supabase?.auth.signOut();
    set({ mode: "none", session: null, hasProfile: null });
  },
}));

/** Call once at app start. */
export async function bootstrapSession(): Promise<void> {
  const { supabase } = platform();
  if (!supabase) { useSession.setState({ ready: true }); return; }
  const { data } = await supabase.auth.getSession();
  useSession.setState({ ready: true, session: data.session, mode: data.session ? "remote" : "none" });
  supabase.auth.onAuthStateChange((_event, session) => {
    const mode = useSession.getState().mode;
    if (mode === "demo") return;
    useSession.setState({ session, mode: session ? "remote" : "none", hasProfile: session ? useSession.getState().hasProfile : null });
  });
}
