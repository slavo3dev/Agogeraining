import { useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";
import { View } from "react-native";
import { draftQueue } from "../services/drafts";
import { useRewards } from "../stores/rewards";
import { AppText, Button } from "./ui";
import { SpartanCard } from "./game";

export function DraftsBanner() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["drafts"], queryFn: () => draftQueue.list(), refetchInterval: 15_000 });
  if (data.length === 0) return null;
  const pending = data.filter((d) => d.status === "pending");
  const rejected = data.filter((d) => d.status === "rejected");
  return (
    <SpartanCard accent="bronze">
      {pending.length ? <AppText>⟳ {pending.length} workout{pending.length > 1 ? "s" : ""} saved on this device, waiting to sync. Nothing is lost.</AppText> : null}
      {rejected.map((d) => (
        <View key={d.input.idempotencyKey} style={{ gap: 6 }}>
          <AppText>⚠ A {d.input.activityType} workout from {d.input.localDay} couldn't be accepted ({d.reason}).</AppText>
          <Button title="Discard this draft" variant="ghost" onPress={async () => { await draftQueue.discard(d.input.idempotencyKey); await qc.invalidateQueries({ queryKey: ["drafts"] }); }} />
        </View>
      ))}
      {pending.length ? <Button title="Sync now" variant="secondary" onPress={async () => { const r = await draftQueue.flush(); useRewards.getState().show(r.newRewards); await qc.invalidateQueries(); }} /> : null}
    </SpartanCard>
  );
}
