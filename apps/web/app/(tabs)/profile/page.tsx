"use client";
import { BRAND } from "@agogeraining/design-tokens";
import { RANK_META } from "@agogeraining/game-engine";
import { movingAverage, convert } from "@agogeraining/training";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { ConfirmationSheet, ProgressChart, RankEmblem, SpartanCard, StatTile, XPBar } from "../../../src/components/game";
import { AppText, Button, Chip, DemoBanner, ErrorState, Row, Screen, StatusTag, ToggleSwitch } from "../../../src/components/ui";
import { FEATURE_STATUS, todayLocal, useApi, demoApi, invalidateGame, analytics, useSession } from "@agogeraining/app-core";
import { usePrefs } from "../../../src/theme";

export default function Profile() {
  const api = useApi(); const router = useRouter(); const mode = useSession((s) => s.mode); const signOut = useSession((s) => s.signOut);
  const prefs = usePrefs();
  const [confirmOut, setConfirmOut] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
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

  /** Web equivalent of the native share sheet: download the export as a JSON file. */
  const exportData = async () => {
    setExportError(null);
    try {
      const data = await api.exportMyData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = `my-spartan-levels-data-${todayLocal()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setExportError(`Export failed: ${e instanceof Error ? e.message : "Unknown error"}`); }
  };

  return (
    <Screen>
      {mode === "demo" ? <DemoBanner /> : null}
      <Row gap={16}>
        <RankEmblem rankKey={player?.rankKey ?? "agoge_trainee"} size={88} />
        <div className="grow"><AppText variant="headline">{cc.data?.profile.displayName ?? "Player"}</AppText><AppText muted>{cc.data?.profile.rankName}</AppText></div>
      </Row>
      {player ? <XPBar totalXp={player.lifetimeXp} /> : null}
      {player ? <Row gap={8}><StatTile label="Level" value={String(player.level)} /><StatTile label="XP" value={String(player.lifetimeXp)} /><StatTile label="Coins" value={String(player.coins)} /></Row> : null}

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
        <Button title="Add measurement" variant="secondary" href="/measurement" />
      </SpartanCard>

      <SpartanCard>
        <AppText variant="title">Stoic journal</AppText>
        <AppText variant="caption" muted>Private. Never shared automatically.</AppText>
        {(refl.data ?? []).length === 0 ? <AppText muted>No reflections yet.</AppText> : refl.data!.slice(0, 5).map((r) => <div key={r.localDate}><AppText variant="caption" muted>{r.localDate}</AppText><AppText>{r.body}</AppText></div>)}
      </SpartanCard>

      <SpartanCard>
        <AppText variant="title">Settings</AppText>
        <AppText muted>Appearance</AppText>
        <Row gap={8}>{(["dark", "light", "system"] as const).map((s) => <Chip key={s} label={s} selected={prefs.scheme === s} onPress={() => prefs.set({ scheme: s })} />)}</Row>
        <SettingRow label="Reduce motion (in addition to system setting)"><ToggleSwitch label="Reduce motion" value={prefs.reducedMotionOverride} onChange={(v) => prefs.set({ reducedMotionOverride: v })} /></SettingRow>
        <SettingRow label="Anonymous usage analytics"><ToggleSwitch label="Anonymous usage analytics" value={analyticsValue} onChange={(v) => void setAnalytics(v)} /></SettingRow>
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
        {exportError ? <ErrorState message={exportError} /> : null}
        <AppText variant="caption" muted>Account deletion: contact support in the beta (self-serve deletion is planned before public release).</AppText>
        <Button title="Sign out" variant="ghost" onPress={() => setConfirmOut(true)} />
      </SpartanCard>

      <SpartanCard>
        <AppText variant="title">Feature status</AppText>
        {Object.entries(FEATURE_STATUS).map(([k, v]) => <Row key={k} between><AppText variant="caption">{k}</AppText><StatusTag status={v} /></Row>)}
        <AppText variant="caption" muted>{BRAND.name} is a working title pending trademark review. General fitness guidance, not medical advice.</AppText>
      </SpartanCard>
      <ConfirmationSheet visible={confirmOut} title="Sign out?" body={mode === "demo" ? "This clears the local demo." : "Unsynced workout drafts stay on this device."} confirmLabel="Sign out" onCancel={() => setConfirmOut(false)} onConfirm={() => { setConfirmOut(false); void signOut(); }} />
    </Screen>
  );
}
function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <Row between gap={12} style={{ minHeight: 44 }}><AppText className="grow">{label}</AppText>{children}</Row>;
}
