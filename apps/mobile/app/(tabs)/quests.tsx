import { AGOGE_9 } from "@agogeraining/campaigns";
import { EXERCISES, formatDuration } from "@agogeraining/training";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";
import { QuestCard, SpartanCard } from "../../src/components/game";
import { AppText, Button, Chip, ErrorState, Loading, Screen } from "../../src/components/ui";
import { useApi } from "../../src/services/api";
import { useSession } from "../../src/stores/session";
import { formatDistance } from "../../src/lib/units";
import { todayLocal } from "../../src/lib/dates";

export default function Quests() {
  const api = useApi(); const router = useRouter(); const mode = useSession((s) => s.mode);
  const [tab, setTab] = useState<"week" | "history" | "exercises">("week");
  const cc = useQuery({ queryKey: ["cc", todayLocal(), mode], queryFn: () => api.getCommandCenter(todayLocal()) });
  const hist = useQuery({ queryKey: ["workouts", mode], queryFn: () => api.listWorkouts(), enabled: tab === "history" });
  const settings = useQuery({ queryKey: ["settings", mode], queryFn: () => api.getSettings() });
  const done = cc.data?.campaign?.qualifiedDays ?? 0;

  return (
    <Screen>
      <AppText variant="headline">Quests</AppText>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Chip label="9-day plan" selected={tab === "week"} onPress={() => setTab("week")} />
        <Chip label="History" selected={tab === "history"} onPress={() => setTab("history")} />
        <Chip label="Exercises" selected={tab === "exercises"} onPress={() => setTab("exercises")} />
      </View>
      <Button title="Log a workout" onPress={() => router.push("/log-workout")} />

      {tab === "week" && AGOGE_9.map((d) => (
        <QuestCard key={d.day} kind={d.focus === "recovery" ? "recovery" : "primary"} title={`Day ${d.day} · ${d.theme}`} body={d.description} done={d.day <= done}>
          <AppText variant="caption" muted>Alternatives — no gym: {d.alternatives.noGym} Indoor: {d.alternatives.indoorOnly}</AppText>
        </QuestCard>
      ))}

      {tab === "history" && (hist.isLoading ? <Loading /> : hist.isError ? <ErrorState message="Couldn't load history." onRetry={() => void hist.refetch()} /> :
        (hist.data ?? []).length === 0 ? <AppText muted>No workouts logged yet.</AppText> :
        hist.data!.map((w) => (
          <SpartanCard key={w.id}>
            <AppText variant="title">{w.activityType}</AppText>
            <AppText muted>{w.localDay} · {formatDuration(w.durationSeconds)}{w.distanceM ? ` · ${formatDistance(w.distanceM, settings.data?.unitSystem ?? "metric")}` : ""}{w.rpe ? ` · RPE ${w.rpe}` : ""}</AppText>
          </SpartanCard>)))}

      {tab === "exercises" && EXERCISES.map((e) => (
        <SpartanCard key={e.slug}>
          <AppText variant="title">{e.name}</AppText>
          <AppText variant="caption" muted>{e.movementPattern} · {e.equipment}</AppText>
          <AppText>{e.instructions}</AppText>
          {e.alternatives.length ? <AppText variant="caption" muted>Alternatives: {e.alternatives.join(", ")}</AppText> : null}
        </SpartanCard>))}
      <AppText variant="caption" muted>General fitness guidance, not medical advice. Stop if something hurts, and see a qualified professional for injuries or concerning symptoms.</AppText>
    </Screen>
  );
}
