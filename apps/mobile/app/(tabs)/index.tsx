import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { BossTrialCard, CampaignPath, QuestCard, RankEmblem, SpartanCard, StatTile, StoicReflectionCard, XPBar } from "../../src/components/game";
import { DraftsBanner } from "../../src/components/DraftsBanner";
import { AppText, Button, DemoBanner, ErrorState, Loading, Screen } from "../../src/components/ui";
import { buildWorkout, submitWorkout } from "../../src/features/workouts/submit";
import { promptForDate } from "../../src/features/stoic/prompts";
import { todayLocal } from "../../src/lib/dates";
import { useApi } from "../../src/services/api";
import { invalidateGame } from "../../src/services/queryClient";
import { useRewards } from "../../src/stores/rewards";
import { useSession } from "../../src/stores/session";
import { v4 } from "../../src/lib/uuid";

export default function Home() {
  const api = useApi(); const router = useRouter(); const mode = useSession((s) => s.mode);
  const today = todayLocal();
  const q = useQuery({ queryKey: ["cc", today, mode], queryFn: () => api.getCommandCenter(today) });
  const rest = useMutation({ mutationFn: () => submitWorkout(buildWorkout({ activityType: "recovery", durationSeconds: 0 })) });
  const claim = useMutation({
    mutationFn: async (rankKey: string) => api.claimPromotion(rankKey, v4()),
    onSuccess: async (r) => { useRewards.getState().show(r.newRewards); await invalidateGame(); },
  });

  if (q.isLoading) return <Screen><Loading label="Loading command center" /></Screen>;
  if (q.isError || !q.data) return <Screen><ErrorState message={`Couldn't reach the server. Your drafts are safe. (${(q.error as Error | null)?.message ?? "error"})`} onRetry={() => void q.refetch()} /></Screen>;
  const d = q.data; const camp = d.campaign;
  const isRecovery = camp?.day.focus === "recovery";
  const prompt = promptForDate(today);
  const reflected = camp?.sideQuests.find((s) => s.type === "reflection")?.completed ?? false;

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
      <View style={{ flexDirection: "row", gap: 8 }}>
        <StatTile label="Program day" value={camp ? `${camp.qualifiedDays}/${camp.totalDays}` : "—"} hint="qualified" />
        <StatTile label="Lifetime XP" value={String(d.player.lifetimeXp)} />
        <StatTile label="Coins" value={String(d.player.coins)} hint="cosmetic" />
      </View>

      {camp ? (<>
        <QuestCard kind={isRecovery ? "recovery" : "primary"} title={`Day ${camp.programDay}: ${camp.day.title}`} body={camp.day.description} done={camp.qualifiedToday}>
          {camp.qualifiedToday ? <AppText>✓ Today qualified. Extra effort is optional — rest is allowed.</AppText> : isRecovery ? (
            <Button title="Mark planned recovery done" onPress={() => rest.mutate()} loading={rest.isPending} />
          ) : camp.day.focus === "trial" ? (
            <Button title="Go to your trial" onPress={() => router.push("/(tabs)/trials")} />
          ) : <Button title="Log workout" onPress={() => router.push("/log-workout")} />}
          {rest.isError ? <ErrorState message={(rest.error as Error).message} /> : null}
          <AppText variant="caption" muted>No gym? {camp.day.spec.alternatives.noGym}  Short on time? {camp.day.spec.alternatives.limitedTime}  Limited mobility? {camp.day.spec.alternatives.mobility}</AppText>
        </QuestCard>
        {camp.sideQuests.filter((s) => s.type !== "reflection").map((s) => <QuestCard key={s.index} kind="side" title={s.label} done={s.completed} />)}
        <SpartanCard><AppText variant="caption" muted>Campaign path</AppText><CampaignPath qualifiedDays={camp.qualifiedDays} total={camp.totalDays} /></SpartanCard>
      </>) : <SpartanCard><AppText>No active campaign.</AppText></SpartanCard>}

      {d.nextRank ? <BossTrialCard evaluation={d.nextRank} onPrepare={() => router.push("/(tabs)/trials")} onClaim={() => d.nextRank?.rankKey && claim.mutate(d.nextRank.rankKey)} claiming={claim.isPending} /> : null}
      {claim.isError ? <ErrorState message={(claim.error as Error).message} /> : null}

      <StoicReflectionCard prompt={prompt.text} done={reflected} onPress={() => router.push({ pathname: "/reflection", params: { prompt: prompt.key } })} />

      <SpartanCard>
        <AppText variant="caption" muted>Recent XP (server ledger)</AppText>
        {d.recentXp.length === 0 ? <AppText muted>Your first quest awaits.</AppText> : d.recentXp.map((x, i) => <AppText key={i}>+{x.xp} XP · {x.source.replace(/_/g, " ")}</AppText>)}
      </SpartanCard>
    </Screen>
  );
}
