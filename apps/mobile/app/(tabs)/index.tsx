import { EXERCISES } from "@agogeraining/training";
import { extensionOptions, progressView } from "@agogeraining/campaigns";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { BossTrialCard, CampaignPath, QuestCard, RankEmblem, SpartanCard, StatTile, StoicReflectionCard, XPBar } from "../../src/components/game";
import { DraftsBanner } from "../../src/components/DraftsBanner";
import { AppText, Button, DemoBanner, ErrorState, Loading, Screen, StatusTag } from "../../src/components/ui";
import { SessionRow } from "../../src/features/journey/components";
import { useCommandCenter, INTENSITY_LABEL, PHASE_LABEL, checkpointLabel, journeyErrorMessage, sessionTitle, shortDate, buildWorkout, submitWorkout, promptForDate, appNow, todayLocal, useApi, invalidateGame, useRewards, useSession, v4 } from "@agogeraining/app-core";

const VIRTUE_INTENTION: Record<string, string> = {
  wisdom: "Train with judgment: notice what your body tells you today.",
  courage: "Do the next hard-but-sensible thing without waiting to feel ready.",
  justice: "Show up for the people around you as well as for yourself.",
  temperance: "Enough is a skill. Leave a little in the tank.",
  control: "Focus only on what is within your control today.",
};

export default function Home() {
  const api = useApi(); const router = useRouter(); const mode = useSession((s) => s.mode);
  const today = todayLocal();
  const q = useCommandCenter();
  const [adapt, setAdapt] = useState(false);
  const rest = useMutation({ mutationFn: () => submitWorkout(buildWorkout({ activityType: "recovery", durationSeconds: 0 })) });
  const resume = useMutation({ mutationFn: () => api.setJourneyPaused(false), onSuccess: () => invalidateGame() });
  const reschedule = useMutation({ mutationFn: () => api.updateJourneyPlan(null, "Rescheduled from Home"), onSuccess: () => invalidateGame() });
  const claim = useMutation({
    mutationFn: async (rankKey: string) => api.claimPromotion(rankKey, v4()),
    onSuccess: async (r) => { useRewards.getState().show(r.newRewards); await invalidateGame(); },
  });

  if (q.isLoading) return <Screen><Loading label="Loading command center" /></Screen>;
  if (q.isError || !q.data) return <Screen><ErrorState message={`Couldn't reach the server. Your drafts are safe. (${(q.error as Error | null)?.message ?? "error"})`} onRetry={() => void q.refetch()} /></Screen>;
  const d = q.data; const camp = d.campaign; const s = camp?.session ?? null;
  const type = s?.sessionType ?? camp?.day.focus;
  const prompt = promptForDate(today);
  const evening = appNow().getHours() >= 15;
  const reflected = camp?.sideQuests.find((x) => x.type === "reflection")?.completed ?? false;
  const v = camp ? progressView({ targetDays: camp.totalDays, credited: camp.qualifiedDays, creditedToday: camp.qualifiedToday, todayProgramDay: camp.qualifiedToday ? camp.programDay : null, nextScheduledFor: camp.upcoming[0]?.scheduledFor ?? null, today }) : null;
  const sportName = camp?.planInputs?.sportName || "your sport";

  return (
    <Screen>
      {mode === "demo" ? <DemoBanner /> : null}
      <DraftsBanner />
      <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
        <RankEmblem rankKey={d.player.rankKey} />
        <View style={{ flex: 1 }}>
          <AppText variant="headline" numberOfLines={1}>{d.profile.displayName}</AppText>
          <AppText muted>{d.profile.rankName}</AppText>
        </View>
      </View>
      <XPBar totalXp={d.player.lifetimeXp} />

      {!camp ? (
        <SpartanCard accent="crimson">
          <AppText variant="title" display>Choose your journey</AppText>
          <AppText muted>3, 9, 30, 60, 90 or 300 days — every journey starts at Day 1 and can be extended without losing progress.</AppText>
          <Button title="Choose your journey" onPress={() => router.push("/journey/new")} />
        </SpartanCard>
      ) : (<>
        {/* Journey banner */}
        <Pressable accessibilityRole="button" accessibilityLabel={`${camp.planName}, day ${camp.programDay} of ${camp.totalDays}. Open My Journey.`} onPress={() => router.push("/journey")}>
          <SpartanCard accent="crimson">
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <AppText variant="caption" muted>{camp.planName}</AppText>
              <AppText variant="caption" muted>My Journey ›</AppText>
            </View>
            <AppText variant="hero" display>Day {camp.programDay} <AppText variant="title" muted>/ {camp.totalDays}</AppText></AppText>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {s ? <StatusTag status={`${PHASE_LABEL[s.phase]} phase`} /> : null}
              {camp.state !== "active" ? <StatusTag status={camp.state} /> : null}
              {v?.nextCheckpoint ? <StatusTag status={`Next: ${checkpointLabel(v.nextCheckpoint)}`} /> : null}
            </View>
            {v?.forecastFinish && camp.state === "active" ? <AppText variant="caption" muted>Forecast finish {shortDate(v.forecastFinish)} · {camp.qualifiedDays} eligible days so far</AppText> : null}
          </SpartanCard>
        </Pressable>

        {camp.state === "paused" ? (
          <SpartanCard accent="bronze">
            <AppText>Journey paused. Nothing is lost — resume when you're ready and the plan picks up from today.</AppText>
            <Button title="Resume journey" onPress={() => resume.mutate()} loading={resume.isPending} />
          </SpartanCard>
        ) : null}

        {camp.state === "completed" ? (
          <SpartanCard accent="olive">
            <AppText variant="title">{camp.planName} complete</AppText>
            <AppText muted>All {camp.totalDays} days earned. Extend to keep going from Day {camp.totalDays + 1} — your workouts, XP, rewards and rank stay intact.</AppText>
            {extensionOptions(camp.totalDays).length ? <Button title="Extend my journey" onPress={() => router.push("/journey/extend")} /> : null}
            <Button title="Start a new journey" variant="ghost" onPress={() => router.push("/journey/new")} />
          </SpartanCard>
        ) : null}

        {camp.pendingReviews.length ? (
          <SpartanCard accent="bronze">
            <AppText variant="title">Day {camp.pendingReviews[0]} checkpoint</AppText>
            <AppText muted>{camp.pendingReviews[0] === 3 ? "Take two minutes to review how the first three days felt. Not a test." : "Review your progress before your trial."}</AppText>
            <Button title="Start review" variant="secondary" onPress={() => router.push({ pathname: "/journey/checkpoint", params: { day: String(camp.pendingReviews[0]) } })} />
          </SpartanCard>
        ) : null}

        {camp.state === "active" && v && v.behindDays >= 2 ? (
          <SpartanCard>
            <AppText>Your plan expected this day on {shortDate(camp.upcoming[0]!.scheduledFor)}. No progress is lost — missed days just wait.</AppText>
            <Button title="Reschedule from today" variant="secondary" onPress={() => reschedule.mutate()} loading={reschedule.isPending} />
            {reschedule.isError ? <ErrorState message={journeyErrorMessage(reschedule.error)} /> : null}
          </SpartanCard>
        ) : null}

        {/* Today's main quest */}
        {camp.state !== "completed" && s ? (
          <QuestCard kind={type === "recovery" ? "recovery" : "primary"} title={`Day ${camp.programDay}: ${sessionTitle(s, camp.planInputs?.sportName)}`} body={s.description} done={camp.qualifiedToday}>
            <AppText variant="caption" muted>{type === "recovery" ? "Check-in only" : `${s.plannedMinutes} min planned · counts from ${Math.round(s.primary.minDurationSeconds / 60)} min`} · {INTENSITY_LABEL[s.intensity]}{s.deload ? " · lighter week" : ""}</AppText>
            {s.exercises.length ? (
              <View style={{ gap: 2 }}>
                {s.exercises.map((e) => <AppText key={e.slug} variant="caption">• {EXERCISES.find((x) => x.slug === e.slug)?.name ?? e.slug} — {e.sets > 1 ? `${e.sets} × ` : ""}{e.reps}</AppText>)}
              </View>
            ) : null}
            {camp.qualifiedToday ? <AppText>✓ Today is credited. Extra effort is optional — rest is allowed.</AppText>
              : camp.state === "paused" ? null
              : type === "recovery" ? <Button title="Check in: I rested today" onPress={() => rest.mutate()} loading={rest.isPending} />
              : type === "trial" ? <Button title="Go to your trial" onPress={() => router.push("/(tabs)/trials")} />
              : type === "sport" ? <Button title={`Log ${sportName}`} onPress={() => router.push({ pathname: "/log-workout", params: { activity: "sport" } })} />
              : <Button title="Log workout" onPress={() => router.push({ pathname: "/log-workout", params: { activity: s.primary.allowedActivityTypes[0] ?? "" } })} />}
            {rest.isError ? <ErrorState message={(rest.error as Error).message} /> : null}
            {!camp.qualifiedToday && type !== "recovery" ? (
              <Button title={adapt ? "Hide adaptations" : "Adapt today (travel, no equipment, short on time)"} variant="ghost" onPress={() => setAdapt((x) => !x)} />
            ) : null}
            {adapt ? (
              <View style={{ gap: 4 }}>
                <AppText variant="caption">Travel / no gym: {s.alternatives.noGym}</AppText>
                <AppText variant="caption">Indoors only: {s.alternatives.indoorOnly}</AppText>
                <AppText variant="caption">Short on time: {s.alternatives.limitedTime}</AppText>
                <AppText variant="caption">Limited mobility: {s.alternatives.mobility}</AppText>
                <AppText variant="caption" muted>Not up to it today? Skip it — the plan waits and nothing is lost. Counts with: {s.primary.allowedActivityTypes.join(", ")}.</AppText>
              </View>
            ) : null}
          </QuestCard>
        ) : null}
        {camp.state !== "completed" ? camp.sideQuests.filter((x) => x.type !== "reflection").map((x) => <QuestCard key={x.index} kind="side" title={x.label} done={x.completed} />) : null}

        {camp.state === "active" && camp.upcoming.length > (camp.qualifiedToday ? 0 : 1) ? (
          <SpartanCard>
            <AppText variant="caption" muted>Coming up</AppText>
            {camp.upcoming.slice(camp.qualifiedToday ? 0 : 1, camp.qualifiedToday ? 3 : 4).map((x) => <SessionRow key={x.programDay} s={x} sportName={camp.planInputs?.sportName} />)}
          </SpartanCard>
        ) : null}

        <View style={{ flexDirection: "row", gap: 8 }}>
          <StatTile label="Eligible days" value={`${camp.qualifiedDays}/${camp.totalDays}`} />
          <StatTile label="Lifetime XP" value={String(d.player.lifetimeXp)} />
          <StatTile label="Coins" value={String(d.player.coins)} hint="cosmetic" />
        </View>
        <SpartanCard><AppText variant="caption" muted>Journey map</AppText><CampaignPath qualifiedDays={camp.qualifiedDays} total={camp.totalDays} /></SpartanCard>
      </>)}

      {d.nextRank ? <BossTrialCard evaluation={d.nextRank} onPrepare={() => router.push("/(tabs)/trials")} onClaim={() => d.nextRank?.rankKey && claim.mutate(d.nextRank.rankKey)} claiming={claim.isPending} /> : null}
      {claim.isError ? <ErrorState message={(claim.error as Error).message} /> : null}

      {!evening ? (
        <SpartanCard accent="olive">
          <AppText variant="caption" muted>Morning intention · {prompt.virtue}</AppText>
          <AppText display>{VIRTUE_INTENTION[prompt.virtue]}</AppText>
        </SpartanCard>
      ) : null}
      <StoicReflectionCard prompt={evening ? prompt.text : `Tonight: ${prompt.text}`} done={reflected} onPress={() => router.push({ pathname: "/reflection", params: { prompt: prompt.key } })} />

      <SpartanCard>
        <AppText variant="caption" muted>Recent XP (server ledger)</AppText>
        {d.recentXp.length === 0 ? <AppText muted>Your first quest awaits.</AppText> : d.recentXp.map((x, i) => <AppText key={i}>+{x.xp} XP · {x.source.replace(/_/g, " ")}</AppText>)}
      </SpartanCard>
    </Screen>
  );
}
