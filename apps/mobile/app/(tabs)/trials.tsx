import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { BossTrialCard, CampaignPath, ChallengeCard, SpartanCard } from "../../src/components/game";
import { AppText, Button, ErrorState, Loading, Screen } from "../../src/components/ui";
import { todayLocal } from "../../src/lib/dates";
import { v4 } from "../../src/lib/uuid";
import { useApi } from "../../src/services/api";
import { invalidateGame } from "../../src/services/queryClient";
import { useRewards } from "../../src/stores/rewards";
import { useSession } from "../../src/stores/session";

export default function Trials() {
  const api = useApi(); const router = useRouter(); const mode = useSession((s) => s.mode);
  const cc = useQuery({ queryKey: ["cc", todayLocal(), mode], queryFn: () => api.getCommandCenter(todayLocal()) });
  const ch = useQuery({ queryKey: ["challenges", mode], queryFn: () => api.listChallenges() });
  const goals = useQuery({ queryKey: ["goals", mode], queryFn: () => api.listGoals() });
  const claim = useMutation({ mutationFn: (rank: string) => api.claimPromotion(rank, v4()), onSuccess: async (r) => { useRewards.getState().show(r.newRewards); await invalidateGame(); } });

  if (cc.isLoading || ch.isLoading) return <Screen><Loading /></Screen>;
  if (cc.isError || ch.isError) return <Screen><ErrorState message="Couldn't load trials." onRetry={() => { void cc.refetch(); void ch.refetch(); }} /></Screen>;
  const next = cc.data?.nextRank;

  return (
    <Screen>
      <AppText variant="headline">Trials</AppText>
      {cc.data?.campaign ? <SpartanCard><AppText variant="caption" muted>{cc.data.campaign.planName} map</AppText><CampaignPath qualifiedDays={cc.data.campaign.qualifiedDays} total={cc.data.campaign.totalDays} /></SpartanCard> : null}
      {next ? <BossTrialCard evaluation={next} onPrepare={() => router.push({ pathname: "/challenge/new", params: { rank: next.rankKey ?? "" } })} onClaim={() => next.rankKey && claim.mutate(next.rankKey)} claiming={claim.isPending} /> : null}
      {claim.isError ? <ErrorState message={(claim.error as Error).message} /> : null}
      {(goals.data ?? []).filter((g) => g.status === "active").length ? (
        <SpartanCard>
          <AppText variant="title">Your goals</AppText>
          <AppText variant="caption" muted>Set before any attempt. Turn one into a trial when you're ready.</AppText>
          {goals.data!.filter((g) => g.status === "active").map((g) => (
            <View key={g.id} style={{ gap: 4 }}>
              <AppText>{g.title}: {g.baseline !== null ? `${g.baseline} → ` : ""}{g.target} {g.unit} by {g.targetDate}</AppText>
              <Button title="Use as a trial" variant="ghost" onPress={() => router.push({ pathname: "/challenge/new", params: { rank: next?.rankKey ?? "", metric: g.metric, baseline: g.baseline === null ? "" : String(g.baseline), target: String(g.target), unit: g.unit } })} />
            </View>
          ))}
        </SpartanCard>
      ) : null}
      <AppText variant="title">Your challenges</AppText>
      <AppText muted>You choose the goal. A trial counts toward promotion only when it's linked to a rank gate. Results are self-reported and labelled that way.</AppText>
      <Button title="Create a challenge" onPress={() => router.push({ pathname: "/challenge/new", params: { rank: next?.rankKey ?? "" } })} />
      {(ch.data ?? []).length === 0 ? <AppText muted>No challenges yet. Pick something measurable and appropriate for you — like your max push-ups, a timed mile, or a plank hold.</AppText> : ch.data!.map((c) => <ChallengeCard key={c.id} c={c} onPress={() => router.push(`/challenge/${c.id}`)} />)}
    </Screen>
  );
}
