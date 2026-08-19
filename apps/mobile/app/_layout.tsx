import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RewardModal } from "../src/components/game";
import { AppText } from "../src/components/ui";
import { getApi } from "../src/services/api";
import { draftQueue } from "../src/services/drafts";
import { queryClient } from "../src/services/queryClient";
import { bootstrapSession, useSession } from "../src/stores/session";
import { useRewards } from "../src/stores/rewards";
import { ThemeProvider, useTheme } from "../src/theme";

function Gate() {
  const { c, isDark } = useTheme();
  const { ready, mode, hasProfile, setHasProfile } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => { void bootstrapSession(); }, []);

  // Resolve whether this account has finished onboarding.
  useEffect(() => {
    if (mode === "none" || hasProfile !== null) return;
    getApi().hasProfile().then(setHasProfile).catch(() => setHasProfile(false));
  }, [mode, hasProfile, setHasProfile]);

  useEffect(() => {
    if (!ready) return;
    const first = segments[0] as string | undefined;
    if (mode === "none") { if (first !== "(auth)") router.replace("/(auth)/welcome"); return; }
    if (hasProfile === null) return;
    if (!hasProfile) { if (first !== "onboarding") router.replace("/onboarding"); return; }
    if (first === "(auth)" || first === "onboarding" || first === undefined) router.replace("/(tabs)");
  }, [ready, mode, hasProfile, segments, router]);

  // Retry offline workout drafts on launch and whenever the app returns to the foreground.
  useEffect(() => {
    if (mode === "none" || !hasProfile) return;
    const sync = () => draftQueue.flush().then((r) => { if (r.synced) { useRewards.getState().show(r.newRewards); void queryClient.invalidateQueries(); } }).catch(() => undefined);
    void sync();
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") void sync(); });
    return () => sub.remove();
  }, [mode, hasProfile]);

  if (!ready || (mode !== "none" && hasProfile === null)) {
    return <View style={{ flex: 1, backgroundColor: c.background, alignItems: "center", justifyContent: "center", gap: 12 }}><ActivityIndicator /><AppText muted>Preparing your training ground…</AppText></View>;
  }
  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack screenOptions={{ headerStyle: { backgroundColor: c.surface }, headerTintColor: c.text, contentStyle: { backgroundColor: c.background } }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="log-workout" options={{ title: "Log workout", presentation: "modal" }} />
        <Stack.Screen name="measurement" options={{ title: "Add measurement", presentation: "modal" }} />
        <Stack.Screen name="reflection" options={{ title: "Stoic reflection", presentation: "modal" }} />
        <Stack.Screen name="challenge/new" options={{ title: "New challenge", presentation: "modal" }} />
        <Stack.Screen name="challenge/[id]" options={{ title: "Challenge" }} />
      </Stack>
      <RewardModal />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider><Gate /></ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
