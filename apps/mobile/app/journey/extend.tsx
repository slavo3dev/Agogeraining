import { checkpointsFor, extensionOptions, generateSessions, planByKey, type PlanInputs } from "@agogeraining/campaigns";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ConfirmationSheet, SpartanCard } from "../../src/components/game";
import { AppText, Button, ErrorState, Loading, Screen } from "../../src/components/ui";
import { PlanCards, PlanPreview } from "../../src/features/journey/components";
import { nextAnchor, useCommandCenter, useJourneyPlan, checkpointLabel, journeyErrorMessage, track, useApi, invalidateGame, useRewards } from "@agogeraining/app-core";

/** Extend Journey: preview → explicit confirmation → future-only regeneration on the server. */
export default function ExtendJourney() {
  const api = useApi(); const router = useRouter();
  const cc = useCommandCenter(); const camp = cc.data?.campaign ?? null;
  const plan = useJourneyPlan(camp?.id);
  const [target, setTarget] = useState<string | undefined>();
  const [confirm, setConfirm] = useState(false);
  const to = target ? planByKey(target) : undefined;

  const preview = useMemo(() => {
    if (!camp || !to || !camp.planInputs) return null;
    const fromDay = camp.qualifiedDays + 1;
    const future = generateSessions({ horizon: to.durationDays, inputs: camp.planInputs as PlanInputs, anchor: nextAnchor(camp.qualifiedToday), fromDay });
    const kept = (plan.data?.sessions ?? []).filter((s) => s.programDay < fromDay);
    return { fromDay, sessions: [...kept, ...future] };
  }, [camp, to, plan.data]);

  const extend = useMutation({
    mutationFn: () => api.extendJourney(target!),
    onSuccess: async (r) => {
      track("journey_extended", { from: camp?.templateKey ?? null, to: target ?? null, atDay: camp?.qualifiedDays ?? 0 });
      useRewards.getState().show(r.newRewards);
      await invalidateGame();
      router.replace("/(tabs)");
    },
  });

  if (cc.isLoading || plan.isLoading) return <Screen><Loading /></Screen>;
  if (!camp) return <Screen><ErrorState message="No journey to extend." /></Screen>;
  if (extensionOptions(camp.totalDays).length === 0) return <Screen><AppText>You're already on the longest journey.</AppText></Screen>;

  const earned = checkpointsFor(camp.totalDays).filter((c) => c.day <= camp.qualifiedDays);
  return (
    <Screen>
      <AppText variant="headline">Extend your journey</AppText>
      <AppText muted>You're on Day {camp.qualifiedDays} of {camp.planName}. Extending keeps every eligible day, workout, XP point, measurement, reward and rank — you continue at Day {camp.qualifiedDays + 1}.</AppText>
      <PlanCards minDays={camp.totalDays} selected={target} onSelect={(k) => { setTarget(k); track("plan_selected", { plan: k, context: "extend" }); }} />
      {to && preview ? (<>
        <SpartanCard accent="olive">
          <AppText variant="title">What stays</AppText>
          <AppText>✓ Days 1–{camp.qualifiedDays} and all their workouts</AppText>
          {earned.length ? <AppText>✓ Milestones earned: {earned.map(checkpointLabel).join(", ")}</AppText> : null}
          <AppText>✓ XP, coins, rewards, measurements and rank</AppText>
          <AppText variant="title" style={{ marginTop: 8 }}>What changes</AppText>
          <AppText>Days {preview.fromDay}–{to.durationDays} are planned for the {to.durationDays}-day horizon (week {Math.floor((preview.fromDay - 1) / 7) + 1} onward).</AppText>
        </SpartanCard>
        <PlanPreview horizon={to.durationDays} sessions={preview.sessions} credited={camp.qualifiedDays} planName={to.name} sportName={camp.planInputs?.sportName} />
        {extend.isError ? <ErrorState message={journeyErrorMessage(extend.error)} /> : null}
        <Button title={`Extend to ${to.name}`} onPress={() => setConfirm(true)} loading={extend.isPending} />
      </>) : null}
      <ConfirmationSheet visible={confirm} title={`Extend to ${to?.name ?? ""}?`}
        body={`You'll continue at Day ${camp.qualifiedDays + 1} of ${to?.durationDays ?? ""}. Only future days are re-planned. Journeys can't be shortened afterwards — you can always pause.`}
        confirmLabel="Confirm extension" onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); extend.mutate(); }} />
    </Screen>
  );
}
