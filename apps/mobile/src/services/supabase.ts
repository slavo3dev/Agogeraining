import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { backendConfigured, env } from "../config/env";
import { secureStorage } from "./secureStorage";

/** Only the public anon key lives on the device. Service-role keys are server-side only. */
export const supabase = backendConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
  : null;

if (supabase) {
  AppState.addEventListener("change", (s) => {
    if (s === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
