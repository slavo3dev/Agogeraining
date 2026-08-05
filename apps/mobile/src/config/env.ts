export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  /** Local, clearly-labelled demo. Only ever on in dev builds. */
  demoEnabled: __DEV__ && process.env.EXPO_PUBLIC_ENABLE_DEMO_MODE === "true",
};
export const backendConfigured = env.supabaseUrl.length > 0 && env.supabaseAnonKey.length > 0;

/** Honest feature status shown in the UI and docs. */
export const FEATURE_STATUS = {
  manualWorkouts: "implemented",
  chooseYourJourney: "implemented",
  journeyExtension: "implemented",
  personalChallenges: "implemented",
  bodyProgress: "implemented",
  stoicReflection: "implemented",
  phalanx: "planned",
  healthKit: "planned",
  healthConnect: "planned",
  deviceEvidenceForDay90Plus: "planned",
  aiPlanSuggestions: "planned",
  notifications: "planned",
} as const;
