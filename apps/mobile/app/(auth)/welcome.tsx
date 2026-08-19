import { BRAND } from "@agogeraining/design-tokens";
import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { RankEmblem } from "../../src/components/game";
import { AppText, Button, Screen } from "../../src/components/ui";
import { backendConfigured, env } from "../../src/config/env";
import { useSession } from "../../src/stores/session";

export default function Welcome() {
  const router = useRouter(); const startDemo = useSession((s) => s.startDemo);
  return (
    <Screen>
      <View style={{ alignItems: "center", gap: 16, paddingTop: 48 }}>
        <RankEmblem rankKey="agoge_trainee" size={120} />
        <AppText variant="hero" style={{ textAlign: "center" }}>{BRAND.name}</AppText>
        <AppText muted style={{ textAlign: "center" }}>{BRAND.tagline}</AppText>
        <AppText muted style={{ textAlign: "center" }}>Consistency earns XP. Measurable, appropriate progress unlocks rank. Recovery counts as responsible training.</AppText>
      </View>
      <View style={{ gap: 12, marginTop: 24 }}>
        {backendConfigured ? <Button title="Sign in or create account" onPress={() => router.push("/(auth)/sign-in")} /> : (
          <AppText accessibilityRole="alert" style={{ textAlign: "center" }}>Backend not configured. Copy .env.example to apps/mobile/.env and start Supabase (see README).</AppText>
        )}
        {env.demoEnabled ? <Button title="Try local demo (dev only)" variant="secondary" onPress={() => void startDemo()} accessibilityHint="Simulated on this device only" /> : null}
      </View>
    </Screen>
  );
}
