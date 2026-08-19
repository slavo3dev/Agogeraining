import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
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
  const claim = useMutation({ mutationFn: (rank: string) => api.claimPromotion(rank, v4()), onSuccess: async (r) => { useRewards.getState().show(r.newRewards); await invalidateGame(); } });

  if (cc.isLoading || ch.isLoading) return <Screen><Loading /></Screen>;
  if (cc.isError || ch.isError) return <Screen><ErrorState message="Couldn't load trials." onRetry={() => { void cc.refetch(); void ch.refetch(); }} /></Screen>;
  const next = cc.data?.nextRank;

  return (
    <Screen>
      <AppText variant="headline">Trials</AppText>
      <SpartanCard><AppText variant="caption" muted>Campaign map</AppText><CampaignPath qualifiedDays={cc.data?.campaign?.qualifiedDays ?? 0} /></SpartanCard>
      {next ? <BossTrialCard evaluation={next} onPrepare={() => router.push({ pathname: "/challenge/new", params: { rank: next.rankKey ?? "" } })} onClaim={() => next.rankKey && claim.mutate(next.rankKey)} claiming={claim.isPending} /> : null}
      {claim.isError ? <ErrorState message={(claim.error as Error).message} /> : null}
      <AppText variant="title">Your challenges</AppText>
      <AppText muted>You choose the goal. A trial counts toward promotion only when it's linked to a rank gate. Results are self-reported and labelled that way.</AppText>
      <Button title="Create a challenge" onPress={() => router.push({ pathname: "/challenge/new", params: { rank: next?.rankKey ?? "" } })} />
      {(ch.data ?? []).length === 0 ? <AppText muted>No challenges yet. Pick something measurable and appropriate for you — like your max push-ups, a timed mile, or a plank hold.</AppText> : ch.data!.map((c) => <ChallengeCard key={c.id} c={c} onPress={() => router.push(`/challenge/${c.id}`)} />)}
    </Screen>
  );
}
