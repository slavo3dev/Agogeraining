import { checkpointsFor, extensionOptions, progressView } from "@agogeraining/campaigns";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";
import { ConfirmationSheet, SpartanCard, StatTile } from "../../src/components/game";
import { AppText, Button, DemoBanner, ErrorState, Loading, Screen, StatusTag } from "../../src/components/ui";
import { SessionRow } from "../../src/features/journey/components";
import { useCommandCenter } from "../../src/features/journey/hooks";
import { PHASE_HINT, PHASE_LABEL, WEEKDAYS, checkpointLabel, journeyErrorMessage, shortDate } from "../../src/features/journey/labels";
import { todayLocal } from "../../src/lib/dates";
import { useApi } from "../../src/services/api";
import { invalidateGame } from "../../src/services/queryClient";
import { useSession } from "../../src/stores/session";

const CHANGE_LABEL: Record<string, string> = {
  created: "Journey started", migrated: "Migrated from the original 9-day campaign", extended: "Extended", plan_adjusted: "Schedule adjusted",
  rescheduled: "Rescheduled from today", paused: "Paused", resumed: "Resumed",
};

/** My Journey — progress, checkpoints, and every way to change the plan without touching history. */
export default function MyJourney() {
  const api = useApi(); const router = useRouter(); const mode = useSession((s) => s.mode);
  const cc = useCommandCenter();
  const camp = cc.data?.campaign ?? null;
  const changes = useQuery({ queryKey: ["plan-changes", camp?.id, mode], queryFn: () => api.listPlanChanges(camp!.id), enabled: !!camp });
  const goals = useQuery({ queryKey: ["goals", mode], queryFn: () => api.listGoals() });
  const [confirm, setConfirm] = useState<null | "pause" | "resume" | "reschedule">(null);
  const act = useMutation({
    mutationFn: async (a: "pause" | "resume" | "reschedule") => {
      if (a === "reschedule") await api.updateJourneyPlan(null, "Rescheduled from My Journey");
      else await api.setJourneyPaused(a === "pause");
    },
    onSuccess: () => invalidateGame(),
  });

  if (cc.isLoading) return <Screen><Loading /></Screen>;
  if (cc.isError) return <Screen><ErrorState message="Couldn't load your journey." onRetry={() => void cc.refetch()} /></Screen>;
  if (!camp) {
    return (
      <Screen>
        <AppText variant="headline">My Journey</AppText>
        <SpartanCard><AppText>No journey yet.</AppText><Button title="Choose your journey" onPress={() => router.push("/journey/new")} /></SpartanCard>
      </Screen>
    );
  }
  const today = todayLocal();
  const nextSession = camp.upcoming[0] ?? null;
  const v = progressView({ targetDays: camp.totalDays, credited: camp.qualifiedDays, creditedToday: camp.qualifiedToday, todayProgramDay: camp.qualifiedToday ? camp.programDay : null, nextScheduledFor: nextSession?.scheduledFor ?? null, today });
  const inputs = camp.planInputs;
  const canExtend = extensionOptions(camp.totalDays).length > 0;

  return (
    <Screen>
      {mode === "demo" ? <DemoBanner /> : null}
      <AppText variant="caption" muted>My Journey</AppText>
      <AppText variant="headline" display>{camp.planName}</AppText>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <StatusTag status={camp.state} />
        {camp.session ? <StatusTag status={`${PHASE_LABEL[camp.session.phase]} phase`} /> : null}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <StatTile label="Eligible days" value={`${camp.qualifiedDays}/${camp.totalDays}`} />
        <StatTile label="Finish (forecast)" value={v.forecastFinish ? shortDate(v.forecastFinish) : "Done"} hint={camp.state === "paused" ? "paused" : undefined} />
      </View>
      {camp.session ? <AppText variant="caption" muted>{PHASE_HINT[camp.session.phase]}</AppText> : null}

      <SpartanCard>
        <AppText variant="title">Checkpoints</AppText>
        {checkpointsFor(camp.totalDays).map((c) => (
          <View key={c.day} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <AppText style={{ flex: 1 }}>{c.day <= camp.qualifiedDays ? "✓ " : "○ "}{checkpointLabel(c)}</AppText>
            {camp.pendingReviews.includes(c.day) ? <Button title="Review" variant="ghost" onPress={() => router.push({ pathname: "/journey/checkpoint", params: { day: String(c.day) } })} /> : null}
          </View>
        ))}
        <AppText variant="caption" muted>Reaching a checkpoint unlocks its trial. Rank changes only when you pass a verified trial.</AppText>
      </SpartanCard>

      <SpartanCard>
        <AppText variant="title">Change or extend</AppText>
        {canExtend ? <Button title={camp.state === "completed" ? "Extend my journey" : "Extend to a longer plan"} onPress={() => router.push("/journey/extend")} /> : <AppText muted>You're on the longest journey.</AppText>}
        {camp.state !== "completed" ? <Button title="Adjust training days, sport or event" variant="secondary" onPress={() => router.push("/journey/adjust")} /> : null}
        {camp.state === "active" && v.behindDays > 0 ? <Button title={`Reschedule from today (${v.behindDays} day${v.behindDays > 1 ? "s" : ""} behind)`} variant="secondary" onPress={() => setConfirm("reschedule")} /> : null}
        {camp.state === "active" ? <Button title="Pause journey" variant="ghost" onPress={() => setConfirm("pause")} /> : null}
        {camp.state === "paused" ? <Button title="Resume journey" onPress={() => setConfirm("resume")} /> : null}
        {camp.state === "completed" ? <Button title="Start a new journey" variant="secondary" onPress={() => router.push("/journey/new")} /> : null}
        {act.isError ? <ErrorState message={journeyErrorMessage(act.error)} /> : null}
        <AppText variant="caption" muted>Changes only ever affect future days. Completed workouts, XP, measurements, rewards and ranks are never rewritten.</AppText>
      </SpartanCard>

      {inputs ? (
        <SpartanCard>
          <AppText variant="title">Your schedule</AppText>
          <AppText muted>Training days: {inputs.availableWeekdays.map((d) => WEEKDAYS[d]).join(", ")}</AppText>
          {inputs.sportDays.length ? <AppText muted>{inputs.sportName || "Sport"}: {inputs.sportDays.map((d) => WEEKDAYS[d]).join(", ")}</AppText> : null}
          <AppText muted>Up to {inputs.maxSessionMinutes} min · {inputs.equipment.replace("_", " ")}{inputs.eventDate ? ` · event ${inputs.eventDate}` : ""}</AppText>
        </SpartanCard>
      ) : null}

      {camp.upcoming.length ? (
        <SpartanCard>
          <AppText variant="title">Coming up</AppText>
          {camp.upcoming.map((s) => <SessionRow key={s.programDay} s={s} sportName={inputs?.sportName} />)}
        </SpartanCard>
      ) : null}

      <SpartanCard>
        <AppText variant="title">Goals</AppText>
        {(goals.data ?? []).length === 0 ? <AppText muted>No goals yet.</AppText> : goals.data!.map((g) => (
          <AppText key={g.id}>{g.status === "achieved" ? "✓" : "○"} {g.title}: {g.baseline !== null ? `${g.baseline} → ` : ""}{g.target} {g.unit} by {g.targetDate}</AppText>
        ))}
      </SpartanCard>

      <SpartanCard>
        <AppText variant="title">Plan history</AppText>
        {(changes.data ?? []).map((c, i) => (
          <View key={i}>
            <AppText>{CHANGE_LABEL[c.kind] ?? c.kind}{c.kind === "extended" ? `: ${c.fromTemplateKey} → ${c.toTemplateKey}` : ""}</AppText>
            <AppText variant="caption" muted>From Day {c.effectiveProgramDay} · {c.effectiveDate}{c.reason ? ` · ${c.reason}` : ""}</AppText>
          </View>
        ))}
      </SpartanCard>

      <ConfirmationSheet visible={confirm !== null}
        title={confirm === "pause" ? "Pause your journey?" : confirm === "resume" ? "Resume your journey?" : "Reschedule from today?"}
        body={confirm === "pause" ? "Nothing is lost. Days won't be credited while paused, and your finish date moves when you resume."
          : confirm === "resume" ? "Your remaining days are re-planned from today. Completed days stay exactly as they are."
            : "Your remaining days are re-planned starting today. Completed days and workouts stay exactly as they are."}
        confirmLabel={confirm === "pause" ? "Pause" : confirm === "resume" ? "Resume" : "Reschedule"}
        onCancel={() => setConfirm(null)} onConfirm={() => { const a = confirm!; setConfirm(null); act.mutate(a); }} />
    </Screen>
  );
}
