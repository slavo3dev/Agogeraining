import { addDays } from "@agogeraining/campaigns";
import { CreateChallengeInput } from "@agogeraining/shared-types";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Switch, View } from "react-native";
import { AppText, Button, Chip, ErrorState, FormField, Screen } from "../../src/components/ui";
import { todayLocal, useApi, invalidateGame } from "@agogeraining/app-core";

const PRESETS = [
  { key: "pushups", title: "Max push-ups (good form)", metric: "pushups", direction: "higher_better", unit: "reps" },
  { key: "mile", title: "Timed mile (walk or run)", metric: "mile_time", direction: "lower_better", unit: "min" },
  { key: "plank", title: "Plank hold", metric: "plank_seconds", direction: "higher_better", unit: "s" },
  { key: "walk", title: "Longest comfortable walk", metric: "walk_distance", direction: "higher_better", unit: "km" },
  { key: "walk_mi", title: "Longest comfortable walk (mi)", metric: "walk_distance", direction: "higher_better", unit: "mi" },
  { key: "squat", title: "Goblet squat", metric: "goblet_squat", direction: "higher_better", unit: "kg" },
  { key: "squat_lb", title: "Goblet squat (lb)", metric: "goblet_squat", direction: "higher_better", unit: "lb" },
] as const;

export default function NewChallenge() {
  const { rank, metric, baseline: gBaseline, target: gTarget, unit: gUnit } = useLocalSearchParams<{ rank?: string; metric?: string; baseline?: string; target?: string; unit?: string }>();
  const api = useApi(); const router = useRouter();
  const fromGoal = PRESETS.find((p) => p.metric === metric && p.unit === gUnit);
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>(fromGoal ?? PRESETS[0]);
  const [baseline, setBaseline] = useState(fromGoal ? gBaseline ?? "" : ""); const [target, setTarget] = useState(fromGoal ? gTarget ?? "" : ""); const [days, setDays] = useState(2);
  const [linked, setLinked] = useState(!!rank); const [improve, setImprove] = useState(!!rank && !fromGoal);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const input = CreateChallengeInput.parse({
        title: preset.title, metric: preset.metric, direction: preset.direction, unit: preset.unit,
        baseline: baseline ? Number(baseline) : undefined, target: Number(improve && baseline ? baseline : target),
        dueDate: addDays(todayLocal(), days), evidenceMethod: "self_reported", passRule: improve ? "improve_on_baseline" : "meet_target",
        linkedRankKey: linked && rank ? rank : undefined,
      });
      const id = await api.createChallenge(input);
      await invalidateGame();
      router.replace(`/challenge/${id}`);
    } catch (e) { setErr(e instanceof Error ? e.message.replace(/_/g, " ") : "Couldn't create"); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <AppText muted>Choose something measurable that's appropriate for you right now.</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{PRESETS.map((p) => <Chip key={p.key} label={p.title} selected={preset.key === p.key} onPress={() => setPreset(p)} />)}</View>
      <FormField label={`Baseline (${preset.unit}) — your recent result`} keyboardType="decimal-pad" value={baseline} onChangeText={setBaseline} />
      <Row label="Pass by beating my own baseline"><Switch accessibilityLabel="Pass by beating my own baseline" value={improve} onValueChange={setImprove} /></Row>
      {!improve ? <FormField label={`Target (${preset.unit})`} keyboardType="decimal-pad" value={target} onChangeText={setTarget} hint={preset.direction === "lower_better" ? "Lower is better for this one." : undefined} /> : null}
      <AppText muted>Due in</AppText>
      <View style={{ flexDirection: "row", gap: 8 }}>{[1, 2, 3, 7].map((d) => <Chip key={d} label={`${d} day${d > 1 ? "s" : ""}`} selected={days === d} onPress={() => setDays(d)} />)}</View>
      {rank ? <Row label="Count as my promotion trial"><Switch accessibilityLabel="Count as my promotion trial" value={linked} onValueChange={setLinked} /></Row> : null}
      <AppText variant="caption" muted>Evidence: self-reported (honestly labelled). Rehearse at about 70% effort first, stop if form breaks or anything hurts, and reschedule if you aren't feeling right. A failed trial never removes XP.</AppText>
      {err ? <ErrorState message={err} /> : null}
      <Button title="Create challenge" onPress={() => void save()} loading={busy} />
    </Screen>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, gap: 12 }}><AppText style={{ flex: 1 }}>{label}</AppText>{children}</View>;
}
