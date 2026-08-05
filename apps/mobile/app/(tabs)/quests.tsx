import { EXERCISES, formatDuration } from "@agogeraining/training";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";
import { SpartanCard } from "../../src/components/game";
import { SessionRow } from "../../src/features/journey/components";
import { useJourneyPlan } from "../../src/features/journey/hooks";
import { PHASE_LABEL } from "../../src/features/journey/labels";
import { AppText, Button, Chip, ErrorState, Loading, Screen } from "../../src/components/ui";
import { useApi } from "../../src/services/api";
import { useSession } from "../../src/stores/session";
import { formatDistance } from "../../src/lib/units";
import { todayLocal } from "../../src/lib/dates";

export default function Quests() {
  const api = useApi(); const router = useRouter(); const mode = useSession((s) => s.mode);
  const [tab, setTab] = useState<"week" | "history" | "exercises">("week");
  const [showAll, setShowAll] = useState(false);
  const cc = useQuery({ queryKey: ["cc", todayLocal(), mode], queryFn: () => api.getCommandCenter(todayLocal()) });
  const hist = useQuery({ queryKey: ["workouts", mode], queryFn: () => api.listWorkouts(), enabled: tab === "history" });
  const settings = useQuery({ queryKey: ["settings", mode], queryFn: () => api.getSettings() });
  const camp = cc.data?.campaign ?? null;
  const plan = useJourneyPlan(camp?.id);
  const credited = new Map((plan.data?.credited ?? []).map((c) => [c.programDay, c.localDate]));
  const sessions = plan.data?.sessions ?? [];
  const firstOpen = (camp?.qualifiedDays ?? 0) + 1;
  const visible = showAll ? sessions : sessions.filter((x) => x.programDay >= firstOpen - 3 && x.programDay < firstOpen + 14);
  const weeks = [...new Set(visible.map((x) => x.week))];

  return (
    <Screen>
      <AppText variant="headline">Quests</AppText>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Chip label={camp ? camp.planName : "Plan"} selected={tab === "week"} onPress={() => setTab("week")} />
        <Chip label="History" selected={tab === "history"} onPress={() => setTab("history")} />
        <Chip label="Exercises" selected={tab === "exercises"} onPress={() => setTab("exercises")} />
      </View>
      <Button title="Log a workout" onPress={() => router.push("/log-workout")} />

      {tab === "week" && (!camp ? <AppText muted>No journey yet. Choose one from Home.</AppText> : plan.isLoading ? <Loading /> : plan.isError ? <ErrorState message="Couldn't load your plan." onRetry={() => void plan.refetch()} /> : (<>
        {weeks.map((w) => {
          const ws = visible.filter((x) => x.week === w);
          return (
            <SpartanCard key={w}>
              <AppText variant="caption" muted>Week {w} · {PHASE_LABEL[ws[0]!.phase]}{ws.some((x) => x.deload) ? " · lighter week" : ""}</AppText>
              {ws.map((x) => <SessionRow key={x.programDay} s={x} done={credited.has(x.programDay)} doneDate={credited.get(x.programDay)} sportName={camp.planInputs?.sportName} />)}
            </SpartanCard>
          );
        })}
        {sessions.length > visible.length || showAll ? <Button title={showAll ? "Show around today" : `Show all ${sessions.length} days`} variant="ghost" onPress={() => setShowAll((x) => !x)} /> : null}
        <AppText variant="caption" muted>Dates ahead are projections. Only one day is credited per date, missed days simply wait, and the plan re-projects when you reschedule.</AppText>
      </>))}

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
