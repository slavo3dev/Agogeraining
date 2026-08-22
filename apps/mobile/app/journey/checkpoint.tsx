import { extensionOptions } from "@agogeraining/campaigns";
import { AssessmentInputSchema } from "@agogeraining/shared-types";
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";
import { SpartanCard } from "../../src/components/game";
import { AppText, Button, Chip, ErrorState, FormField, Loading, Screen } from "../../src/components/ui";
import { useCommandCenter, journeyErrorMessage, useApi, invalidateGame } from "@agogeraining/app-core";

function Scale({ label, value, onChange, low, high }: { label: string; value: number; onChange: (v: number) => void; low: string; high: string }) {
  return (
    <View style={{ gap: 6 }}>
      <AppText muted>{label}</AppText>
      <View style={{ flexDirection: "row", gap: 8 }}>{[1, 2, 3, 4, 5].map((n) => <Chip key={n} label={String(n)} selected={value === n} onPress={() => onChange(n)} />)}</View>
      <AppText variant="caption" muted>1 = {low} · 5 = {high}</AppText>
    </View>
  );
}

/** Checkpoint review. Day 3 is a readiness reflection and baseline review — never a hard test, never a promotion. */
export default function CheckpointReview() {
  const { day } = useLocalSearchParams<{ day?: string }>();
  const checkpointDay = Number(day ?? 3);
  const api = useApi(); const router = useRouter();
  const cc = useCommandCenter(); const camp = cc.data?.campaign ?? null;
  const [energy, setEnergy] = useState(3); const [soreness, setSoreness] = useState(2); const [confidence, setConfidence] = useState(3);
  const [scheduleFit, setScheduleFit] = useState<"good" | "too_much" | "too_little">("good");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => api.recordAssessment(AssessmentInputSchema.parse({ checkpointDay, responses: { energy, soreness, scheduleFit, confidence, notes: notes.trim() || undefined } })),
    onSuccess: async () => { setSaved(true); await invalidateGame(); },
  });

  if (cc.isLoading) return <Screen><Loading /></Screen>;
  if (!camp) return <Screen><ErrorState message="No journey found." /></Screen>;
  const isReadiness = checkpointDay === 3;
  const finished = camp.state === "completed";

  if (saved) {
    return (
      <Screen>
        <AppText variant="headline">Review saved</AppText>
        <SpartanCard accent="olive">
          <AppText>{scheduleFit === "too_much" ? "Your plan felt like a lot. Consider fewer training days or shorter sessions — adjust anytime." : scheduleFit === "too_little" ? "Ready for more? A longer journey keeps every day you've earned." : "Your rhythm is working. Keep going."}</AppText>
        </SpartanCard>
        {finished && extensionOptions(camp.totalDays).length ? <Button title="Extend my journey" onPress={() => router.replace("/journey/extend")} /> : null}
        {scheduleFit === "too_much" && !finished ? <Button title="Adjust my schedule" variant="secondary" onPress={() => router.replace("/journey/adjust")} /> : null}
        <Button title="Back to Command" variant="ghost" onPress={() => router.replace("/(tabs)")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppText variant="caption" muted>Day {checkpointDay} checkpoint</AppText>
      <AppText variant="headline">{isReadiness ? "Readiness review" : "Checkpoint review"}</AppText>
      <AppText muted>{isReadiness
        ? "Three days in. This is a reflection on how training fits your life and body — not a test, and not a promotion."
        : "Look back before your trial. Your promotion trial is separate (Trials tab) and is the only thing that changes rank."}</AppText>
      <Scale label="Energy" value={energy} onChange={setEnergy} low="drained" high="energised" />
      <Scale label="Soreness" value={soreness} onChange={setSoreness} low="none" high="very sore" />
      <Scale label="Confidence with the movements" value={confidence} onChange={setConfidence} low="unsure" high="confident" />
      <AppText muted>How did the schedule fit?</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip label="About right" selected={scheduleFit === "good"} onPress={() => setScheduleFit("good")} />
        <Chip label="Too much" selected={scheduleFit === "too_much"} onPress={() => setScheduleFit("too_much")} />
        <Chip label="I want more" selected={scheduleFit === "too_little"} onPress={() => setScheduleFit("too_little")} />
      </View>
      <FormField multiline label="Notes (optional, private)" value={notes} onChangeText={setNotes} maxLength={1000} />
      {soreness >= 4 ? <AppText variant="caption" muted>High soreness is a signal to rest more. Pain that's sharp or persistent deserves a professional's opinion.</AppText> : null}
      {save.isError ? <ErrorState message={journeyErrorMessage(save.error)} /> : null}
      <Button title="Save review" onPress={() => save.mutate()} loading={save.isPending} />
    </Screen>
  );
}
