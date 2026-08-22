"use client";
import { BRAND } from "@agogeraining/design-tokens";
import { useRouter } from "next/navigation";
import React from "react";
import { RankEmblem } from "../../../src/components/game";
import { AppText, Button, Col, Screen } from "../../../src/components/ui";
import { backendConfigured, env } from "../../../src/env";
import { useSession } from "@agogeraining/app-core";

export default function Welcome() {
  const router = useRouter(); const startDemo = useSession((s) => s.startDemo);
  return (
    <Screen>
      <Col gap={16} style={{ alignItems: "center", paddingTop: 48 }}>
        <RankEmblem rankKey="agoge_trainee" size={120} />
        <AppText variant="hero" style={{ textAlign: "center" }}>{BRAND.name}</AppText>
        <AppText muted style={{ textAlign: "center" }}>{BRAND.tagline}</AppText>
        <AppText muted style={{ textAlign: "center" }}>Consistency earns XP. Measurable, appropriate progress unlocks rank. Recovery counts as responsible training.</AppText>
      </Col>
      <Col gap={12} style={{ marginTop: 24 }}>
        {backendConfigured ? <Button title="Sign in or create account" onPress={() => router.push("/sign-in")} /> : (
          <AppText role="alert" style={{ textAlign: "center" }}>Backend not configured. Copy apps/web/.env.example to apps/web/.env.local and start Supabase (see README).</AppText>
        )}
        {env.demoEnabled ? <Button title="Try local demo (dev only)" variant="secondary" onPress={() => void startDemo()} accessibilityHint="Simulated in this browser only" /> : null}
      </Col>
    </Screen>
  );
}
