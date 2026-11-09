import type { SupabaseClient } from "@supabase/supabase-js";

/** Async key/value storage: AsyncStorage on mobile, localStorage on web. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Everything platform-specific that the shared client code needs. Each app calls `configurePlatform`
 * once, before rendering (mobile: src/platform.ts, web: src/platform.ts).
 */
export interface Platform {
  /** Durable app storage for the demo state and offline workout drafts. */
  storage: KeyValueStore;
  /** Supabase client with the public anon key, or null when the backend isn't configured. */
  supabase: SupabaseClient | null;
  randomUUID(): string;
  /** Development build: enables the console analytics sink. */
  isDev: boolean;
  /** Local demo mode is offered (dev builds only). */
  demoEnabled: boolean;
  /** Shown when the backend isn't configured, e.g. "apps/web/.env.local". */
  envFile: string;
}

let current: Platform | null = null;
const listeners: Array<(p: Platform) => void> = [];

export function configurePlatform(p: Platform): void {
  current = p;
  for (const l of listeners) l(p);
}
export function platform(): Platform {
  if (!current) throw new Error("configurePlatform() must run before the shared app code is used");
  return current;
}
export function isPlatformConfigured(): boolean { return current !== null; }
/** Run once the platform is configured (immediately if it already is). */
export function onPlatform(fn: (p: Platform) => void): void {
  if (current) fn(current); else listeners.push(fn);
}
export const backendConfigured = (): boolean => platform().supabase !== null;
