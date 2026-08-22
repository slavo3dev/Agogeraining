import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { View } from "react-native";
import { z } from "zod";
import { AppText, Button, Chip, ErrorState, FormField, Screen } from "../src/components/ui";
import { appNow, useApi, invalidateGame, useSession } from "@agogeraining/app-core";
import { useQuery } from "@tanstack/react-query";

const METRICS = [["weight", "Weight"], ["body_fat", "Body fat (estimate)"], ["waist", "Waist"], ["pushups_max", "Max push-ups"]] as const;
const Schema = z.object({ value: z.string().regex(/^\d+(\.\d+)?$/, "Enter a positive number"), method: z.string().max(80).optional() });

export default function Measurement() {
  const api = useApi(); const router = useRouter(); const mode = useSession((s) => s.mode);
  const st = useQuery({ queryKey: ["settings", mode], queryFn: () => api.getSettings() });
  const imperial = st.data?.unitSystem === "imperial";
  const [metric, setMetric] = useState<(typeof METRICS)[number][0]>("weight");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const { control, handleSubmit, formState: { errors } } = useForm<z.infer<typeof Schema>>({ resolver: zodResolver(Schema), defaultValues: { value: "", method: "" } });
  const unit = metric === "weight" ? (imperial ? "lb" : "kg") : metric === "waist" ? (imperial ? "in" : "cm") : metric === "body_fat" ? "percent" : "reps";

  const submit = handleSubmit(async (f) => {
    setBusy(true); setErr(null);
    try { await api.recordMeasurement({ metricType: metric, value: Number(f.value), unit: unit as "kg", method: f.method || undefined, measuredAt: appNow().toISOString() }); await invalidateGame(); router.back(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save"); } finally { setBusy(false); }
  });
  return (
    <Screen>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{METRICS.map(([k, l]) => <Chip key={k} label={l} selected={metric === k} onPress={() => setMetric(k)} />)}</View>
      <Controller control={control} name="value" render={({ field }) => <FormField label={`Value (${unit})`} keyboardType="decimal-pad" value={field.value} onChangeText={field.onChange} error={errors.value?.message} />} />
      <Controller control={control} name="method" render={({ field }) => <FormField label="Method / source (optional)" value={field.value ?? ""} onChangeText={field.onChange} hint={metric === "body_fat" ? "e.g. smart scale, calipers. This is an estimate, not an exact value." : undefined} />} />
      {err ? <ErrorState message={err} /> : null}
      <Button title="Save" onPress={() => void submit()} loading={busy} />
      <AppText variant="caption" muted>Private to you. Measurements never affect rank or XP.</AppText>
    </Screen>
  );
}
