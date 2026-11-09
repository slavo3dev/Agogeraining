/**
 * Shared client code for apps/mobile (Expo) and apps/web (Next.js).
 * Pure game rules live in the domain packages (game-engine, campaigns, …); this package holds the
 * app layer on top of them: API contract + implementations, stores, hooks and display labels.
 * Platform specifics (storage, Supabase client, UUIDs) are injected with `configurePlatform`.
 */
export * from "./platform";
export * from "./config";
export * from "./api";
export { demoClock } from "./api/demo";
export type { JourneyPlan } from "./api/types";
export * from "./session";
export * from "./rewards";
export * from "./queryClient";
export * from "./analytics";
export { createAnalytics, type AnalyticsSink, type AnalyticsProps } from "./analytics-core";
export { draftQueue } from "./drafts";
export { createDraftQueue, type Draft, type FlushResult } from "./drafts-core";
export * from "./dates";
export * from "./units";
export * from "./uuid";
export * from "./stoic";
export * from "./workouts";
export * from "./journey/labels";
export * from "./journey/hooks";
