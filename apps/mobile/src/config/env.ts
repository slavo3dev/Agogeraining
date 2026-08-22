export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  /** Local, clearly-labelled demo. Only ever on in dev builds. */
  demoEnabled: __DEV__ && process.env.EXPO_PUBLIC_ENABLE_DEMO_MODE === "true",
};
export const backendConfigured = env.supabaseUrl.length > 0 && env.supabaseAnonKey.length > 0;
