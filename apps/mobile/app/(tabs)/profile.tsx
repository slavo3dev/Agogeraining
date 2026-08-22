import { BRAND } from "@agogeraining/design-tokens";
import { RANK_META } from "@agogeraining/game-engine";
import { movingAverage, convert } from "@agogeraining/training";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Share, Switch, View } from "react-native";
import { ConfirmationSheet, ProgressChart, RankEmblem, SpartanCard, StatTile, XPBar } from "../../src/components/game";
import { AppText, Button, Chip, DemoBanner, Screen, StatusTag } from "../../src/components/ui";
import { FEATURE_STATUS, todayLocal, useApi, demoApi, invalidateGame, analytics, useSession } from "@agogeraining/app-core";
import { usePrefs } from "../../src/theme";

export default function Profile() {
  const api = useApi(); const router = useRouter(); const mode = useSession((s) => s.mode); const signOut = useSession((s) => s.signOut);
  const prefs = usePrefs();
  const [confirmOut, setConfirmOut] = useState(false);
  const cc = useQuery({ queryKey: ["cc", todayLocal(), mode], queryFn: () => api.getCommandCenter(todayLocal()) });
  const ms = useQuery({ queryKey: ["measurements", mode], queryFn: () => api.listMeasurements() });
  const refl = useQuery({ queryKey: ["reflections", mode], queryFn: () => api.listReflections() });
  const st = useQuery({ queryKey: ["settings", mode], queryFn: () => api.getSettings() });
  const units = st.data?.unitSystem ?? "metric";
  const [analyticsOn, setAnalyticsOn] = useState<boolean | null>(null);
  const analyticsValue = analyticsOn ?? st.data?.analyticsOptIn ?? false;
  const setAnalytics = async (v: boolean) => {
    setAnalyticsOn(v); analytics.setOptIn(v);
    try { await api.recordConsent("analytics", v); } catch { /* demo/offline: preference applies locally */ }
  };

  const weights = (ms.data ?? []).filter((m) => m.metricType === "weight");
  const display = (kg: number) => (units === "metric" ? kg : convert(kg, "kg", "lb"));
  const wPoints = weights.map((m) => ({ t: Date.parse(m.measuredAt), v: display(m.value) }));
  const smooth = movingAverage(wPoints.map((p) => p.v), 3).map((v, i) => ({ t: wPoints[i]!.t, v }));
  const player = cc.data?.player; const earned = new Set(RANK_META.filter((r) => r.ordinal <= (RANK_META.find((x) => x.rankKey === player?.rankKey)?.ordinal ?? 0)).map((r) => r.rankKey));

  const exportData = async () => {
    try { const data = await api.exportMyData(); await Share.share({ message: JSON.stringify(data, null, 2), title: "My Spartan Levels data" }); }
    catch (e) { Alert.alert("Export failed", e instanceof Error ? e.message : "Unknown error"); }
  };

  return (
    <Screen>
      {mode === "demo" ? <DemoBanner /> : null}
      <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
        <RankEmblem rankKey={player?.rankKey ?? "agoge_trainee"} size={88} />
        <View style={{ flex: 1 }}><AppText variant="headline">{cc.data?.profile.displayName ?? "Player"}</AppText><AppText muted>{cc.data?.profile.rankName}</AppText></View>
      </View>
      {player ? <XPBar totalXp={player.lifetimeXp} /> : null}
      {player ? <View style={{ flexDirection: "row", gap: 8 }}><StatTile label="Level" value={String(player.level)} /><StatTile label="XP" value={String(player.lifetimeXp)} /><StatTile label="Coins" value={String(player.coins)} /></View> : null}

      <SpartanCard>
        <AppText variant="title">My Journey</AppText>
        <AppText muted>{cc.data?.campaign ? `${cc.data.campaign.planName} · Day ${cc.data.campaign.qualifiedDays}/${cc.data.campaign.totalDays}` : "No journey yet."}</AppText>
        <Button title={cc.data?.campaign ? "Change, extend or pause" : "Choose your journey"} variant="secondary" onPress={() => router.push(cc.data?.campaign ? "/journey" : "/journey/new")} />
      </SpartanCard>

      <SpartanCard>
        <AppText variant="title">Rank history</AppText>
        {RANK_META.map((r) => <AppText key={r.rankKey} muted={!earned.has(r.rankKey)}>{earned.has(r.rankKey) ? "✓" : "○"} {r.name}</AppText>)}
        <AppText variant="caption" muted>Rank names are game titles inspired by ancient Greek military terms, not historical promotion criteria.</AppText>
      </SpartanCard>

      <SpartanCard>
        <AppText variant="title">Body progress</AppText>
        <AppText variant="caption" muted>Trends over time, not daily judgments. Body-fat values are estimates and never affect rank.</AppText>
        <ProgressChart title="Weight" unit={units === "metric" ? "kg" : "lb"} points={smooth.length ? smooth : []} />
        <Button title="Add measurement" variant="secondary" onPress={() => router.push("/measurement")} />
      </SpartanCard>

      <SpartanCard>
        <AppText variant="title">Stoic journal</AppText>
        <AppText variant="caption" muted>Private. Never shared automatically.</AppText>
        {(refl.data ?? []).length === 0 ? <AppText muted>No reflections yet.</AppText> : refl.data!.slice(0, 5).map((r) => <View key={r.localDate}><AppText variant="caption" muted>{r.localDate}</AppText><AppText>{r.body}</AppText></View>)}
      </SpartanCard>

      <SpartanCard>
        <AppText variant="title">Settings</AppText>
        <AppText muted>Appearance</AppText>
        <View style={{ flexDirection: "row", gap: 8 }}>{(["dark", "light", "system"] as const).map((s) => <Chip key={s} label={s} selected={prefs.scheme === s} onPress={() => prefs.set({ scheme: s })} />)}</View>
        <Row label="Haptics"><Switch accessibilityLabel="Haptics" value={prefs.haptics} onValueChange={(v) => prefs.set({ haptics: v })} /></Row>
        <Row label="Reduce motion (in addition to system setting)"><Switch accessibilityLabel="Reduce motion" value={prefs.reducedMotionOverride} onValueChange={(v) => prefs.set({ reducedMotionOverride: v })} /></Row>
        <Row label="Anonymous usage analytics"><Switch accessibilityLabel="Anonymous usage analytics" value={analyticsValue} onValueChange={(v) => void setAnalytics(v)} /></Row>
        <AppText variant="caption" muted>Units: {units === "metric" ? "metric (kg, km)" : "imperial (lb, mi)"} — set during onboarding.</AppText>
      </SpartanCard>

      {mode === "demo" ? (
        <SpartanCard accent="bronze">
          <AppText variant="title">Demo controls (dev only)</AppText>
          <AppText muted>Simulated clock. Production builds have no way to move time.</AppText>
          <Button title="Advance demo day" variant="secondary" onPress={async () => { await demoApi.advanceDay(); await invalidateGame(); }} />
        </SpartanCard>
      ) : null}

      <SpartanCard>
        <AppText variant="title">Data & privacy</AppText>
        <AppText muted>Your measurements, journal and rank evidence are private to you. Health-device access is not requested.</AppText>
        <Button title="Export my data" variant="secondary" onPress={() => void exportData()} />
        <AppText variant="caption" muted>Account deletion: contact support in the beta (self-serve deletion is planned before public release).</AppText>
        <Button title="Sign out" variant="ghost" onPress={() => setConfirmOut(true)} />
      </SpartanCard>

      <SpartanCard>
        <AppText variant="title">Feature status</AppText>
        {Object.entries(FEATURE_STATUS).map(([k, v]) => <View key={k} style={{ flexDirection: "row", justifyContent: "space-between" }}><AppText variant="caption">{k}</AppText><StatusTag status={v} /></View>)}
        <AppText variant="caption" muted>{BRAND.name} is a working title pending trademark review. General fitness guidance, not medical advice.</AppText>
      </SpartanCard>
      <ConfirmationSheet visible={confirmOut} title="Sign out?" body={mode === "demo" ? "This clears the local demo." : "Unsynced workout drafts stay on this device."} confirmLabel="Sign out" onCancel={() => setConfirmOut(false)} onConfirm={() => { setConfirmOut(false); void signOut(); }} />
    </Screen>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, gap: 12 }}><AppText style={{ flex: 1 }}>{label}</AppText>{children}</View>;
}
