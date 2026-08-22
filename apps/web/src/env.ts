export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  /** Local, clearly-labelled demo. Only ever on in `next dev`, like the mobile dev-build rule. */
  demoEnabled: process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "true",
};
export const backendConfigured = env.supabaseUrl.length > 0 && env.supabaseAnonKey.length > 0;
