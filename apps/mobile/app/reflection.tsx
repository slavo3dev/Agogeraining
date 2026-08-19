import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { STOIC_PROMPTS, promptForDate } from "../src/features/stoic/prompts";
import { AppText, Button, ErrorState, FormField, Screen } from "../src/components/ui";
import { todayLocal } from "../src/lib/dates";
import { useApi } from "../src/services/api";
import { invalidateGame } from "../src/services/queryClient";
import { useRewards } from "../src/stores/rewards";

export default function Reflection() {
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  const api = useApi(); const router = useRouter(); const today = todayLocal();
  const p = STOIC_PROMPTS.find((x) => x.key === prompt) ?? promptForDate(today);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try { const r = await api.recordReflection(today, p.key, text.trim()); useRewards.getState().show(r.newRewards); await invalidateGame(); router.back(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save"); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <AppText display variant="headline">{p.text}</AppText>
      <AppText muted>One or two minutes. Private, never shared, and no streak to protect.</AppText>
      <FormField multiline label="Your reflection" value={text} onChangeText={setText} />
      {err ? <ErrorState message={err} /> : null}
      <Button title="Save reflection" onPress={() => void save()} loading={busy} disabled={text.trim().length === 0} />
    </Screen>
  );
}
