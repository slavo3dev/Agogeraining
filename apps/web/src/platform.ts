/**
 * Web adapter for @agogeraining/app-core. Imported first by app/providers.tsx (client only), so the
 * shared code has storage, the Supabase client and UUIDs before any screen renders.
 */
import { configurePlatform, type KeyValueStore } from "@agogeraining/app-core";
import { createClient } from "@supabase/supabase-js";
import { backendConfigured, env } from "./env";

const isBrowser = typeof window !== "undefined";

/** localStorage behind the async interface the shared code expects. No-op during server prerender. */
const storage: KeyValueStore = {
  async getItem(k) { return isBrowser ? window.localStorage.getItem(k) : null; },
  async setItem(k, v) { if (isBrowser) window.localStorage.setItem(k, v); },
  async removeItem(k) { if (isBrowser) window.localStorage.removeItem(k); },
};

/** Only the public anon key reaches the browser. Service-role keys are server-side only. */
export const supabase = backendConfigured && isBrowser
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

configurePlatform({
  storage,
  supabase,
  randomUUID: () => crypto.randomUUID(),
  isDev: process.env.NODE_ENV !== "production",
  demoEnabled: env.demoEnabled,
  envFile: "apps/web/.env.local",
});
