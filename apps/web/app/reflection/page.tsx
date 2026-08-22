"use client";
import { useRouter, useSearchParams } from "next/navigation";
import React, { Suspense, useState } from "react";
import { STOIC_PROMPTS, promptForDate, todayLocal, useApi, invalidateGame, useRewards } from "@agogeraining/app-core";
import { AppText, Button, ErrorState, FormField, Screen } from "../../src/components/ui";

export default function ReflectionPage() {
  return <Suspense fallback={null}><Reflection /></Suspense>;
}

function Reflection() {
  const prompt = useSearchParams().get("prompt") ?? undefined;
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
