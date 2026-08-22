import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import { ChallengeCard, SpartanCard } from "../../src/components/game";
import { AppText, Button, ErrorState, FormField, Loading, Screen } from "../../src/components/ui";
import { track, v4, useApi, invalidateGame, useRewards, useSession } from "@agogeraining/app-core";

export default function ChallengeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi(); const mode = useSession((s) => s.mode);
  const list = useQuery({ queryKey: ["challenges", mode], queryFn: () => api.listChallenges() });
  const [value, setValue] = useState(""); const [outcome, setOutcome] = useState<string | null>(null);
  const attemptKey = useRef(v4()); // one key per attempt: a double-tap or retry can't submit twice
  const c = list.data?.find((x) => x.id === id);

  const submit = useMutation({
    mutationFn: () => api.submitAttempt(id, Number(value), c!.unit, attemptKey.current),
    onSuccess: async (r) => { if (!r.duplicate) track("trial_attempted", { outcome: r.outcome ?? null, promotion: !!c?.linkedRankKey }); setOutcome(r.outcome ?? null); useRewards.getState().show(r.newRewards); await invalidateGame(); },
  });
  const retry = useMutation({ mutationFn: () => api.retryChallenge(id), onSuccess: async () => { attemptKey.current = v4(); setOutcome(null); setValue(""); await invalidateGame(); } });

  if (list.isLoading) return <Screen><Loading /></Screen>;
  if (!c) return <Screen><ErrorState message="Challenge not found." /></Screen>;
  const state = outcome ?? c.state;

  return (
    <Screen>
      <ChallengeCard c={{ ...c, state: state as typeof c.state }} onPress={() => undefined} />
      {c.state === "active" && !outcome ? (
        <SpartanCard>
          <AppText variant="title">Record your attempt</AppText>
          <FormField label={`Your result (${c.unit})`} keyboardType="decimal-pad" value={value} onChangeText={setValue} />
          <Button title="Submit result" onPress={() => submit.mutate()} loading={submit.isPending} disabled={!/^\d+(\.\d+)?$/.test(value)} />
          <AppText variant="caption" muted>Self-reported. Stop if form breaks or anything hurts — you can retry or reschedule.</AppText>
        </SpartanCard>
      ) : null}
      {submit.isError ? <ErrorState message={(submit.error as Error).message.replace(/_/g, " ")} /> : null}
      {state === "passed" ? <SpartanCard accent="olive"><AppText variant="title">✓ Trial passed</AppText><AppText muted>Head to Trials or Home to claim your promotion if all requirements are met.</AppText></SpartanCard> : null}
      {state === "failed" ? <SpartanCard accent="bronze"><AppText variant="title">Not this time</AppText><AppText muted>No XP is lost. Train, rest, and try again when you're ready.</AppText><Button title="Retry" variant="secondary" onPress={() => retry.mutate()} loading={retry.isPending} /></SpartanCard> : null}
      {state === "needs_review" || state === "submitted" ? <SpartanCard accent="bronze"><AppText variant="title">Held for review</AppText><AppText muted>This result was unusually far from your goal, so it's waiting for a quick check. This isn't an accusation.</AppText></SpartanCard> : null}
    </Screen>
  );
}
