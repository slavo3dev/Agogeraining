/**
 * Mobile adapter for @agogeraining/app-core. Imported first by app/_layout.tsx so the shared code
 * has storage, the Supabase client and UUIDs before anything renders.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { configurePlatform } from "@agogeraining/app-core";
import * as Crypto from "expo-crypto";
import { env } from "./config/env";
import { supabase } from "./services/supabase";

configurePlatform({
  storage: AsyncStorage,
  supabase,
  randomUUID: () => Crypto.randomUUID(),
  isDev: __DEV__,
  demoEnabled: env.demoEnabled,
  envFile: "apps/mobile/.env.local",
});
