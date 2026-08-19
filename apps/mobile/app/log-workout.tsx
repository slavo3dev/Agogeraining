import { zodResolver } from "@hookform/resolvers/zod";
import { ACTIVITY_TYPES, parseDuration, convert } from "@agogeraining/training";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { View } from "react-native";
import { z } from "zod";
import { AppText, Button, Chip, ErrorState, FormField, Screen } from "../src/components/ui";
import { buildWorkout, submitWorkout } from "../src/features/workouts/submit";
import { useApi } from "../src/services/api";
import { useSession } from "../src/stores/session";

const Schema = z.object({
  activityType: z.enum(ACTIVITY_TYPES),
  duration: z.string().refine((s) => { const v = parseDuration(s); return v !== null && v >= 0 && v <= 12 * 3600; }, "Use minutes (e.g. 30) or mm:ss / h:mm:ss"),
  distance: z.string().regex(/^(\d+(\.\d+)?)?$/, "Number only").optional(),
  rpe: z.string().regex(/^([1-9]|10)?$/, "1 to 10").optional(),
  notes: z.string().max(2000).optional(),
});
type Form = z.infer<typeof Schema>;

export default function LogWorkout() {
  const api = useApi(); const router = useRouter(); const mode = useSession((s) => s.mode);
  const st = useQuery({ queryKey: ["settings", mode], queryFn: () => api.getSettings() });
  const units = st.data?.unitSystem ?? "metric";
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm<Form>({ resolver: zodResolver(Schema), defaultValues: { activityType: "strength", duration: "", distance: "", rpe: "", notes: "" } });
  const type = watch("activityType");
  const showDistance = ["running", "walking", "hiking", "cycling", "swimming"].includes(type);

  const submit = handleSubmit(async (f) => {
    setBusy(true); setErr(null);
    // A bare number means minutes; "mm:ss" or "h:mm:ss" means exactly that.
    const secs = /^\d+(\.\d+)?$/.test(f.duration.trim()) ? Math.round(Number(f.duration) * 60) : Math.round(parseDuration(f.duration)!);
    const dist = f.distance ? Number(f.distance) : undefined;
    const distanceM = dist === undefined ? undefined : Math.round(units === "metric" ? convert(dist, "km", "m") : convert(dist, "mi", "m"));
    try {
      const r = await submitWorkout(buildWorkout({ activityType: f.activityType, durationSeconds: secs, distanceM, rpe: f.rpe ? Number(f.rpe) : undefined, notes: f.notes || undefined }));
      if (r.status === "rejected") setErr(`The server couldn't accept this workout (${r.reason}). It is kept on your device; see the banner on Home.`);
      else router.back();
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save"); } finally { setBusy(false); }
  });

  return (
    <Screen>
      <AppText muted>What did you do?</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{ACTIVITY_TYPES.map((a) => <Chip key={a} label={a} selected={type === a} onPress={() => setValue("activityType", a)} />)}</View>
      <Controller control={control} name="duration" render={({ field }) => <FormField label="Duration (minutes, or mm:ss)" keyboardType="numbers-and-punctuation" value={field.value} onChangeText={field.onChange} error={errors.duration?.message} />} />
      {showDistance ? <Controller control={control} name="distance" render={({ field }) => <FormField label={`Distance (${units === "metric" ? "km" : "mi"}, optional)`} keyboardType="decimal-pad" value={field.value ?? ""} onChangeText={field.onChange} error={errors.distance?.message} />} /> : null}
      <Controller control={control} name="rpe" render={({ field }) => <FormField label="Effort, RPE 1–10 (optional)" keyboardType="number-pad" value={field.value ?? ""} onChangeText={field.onChange} hint="1 = very easy, 10 = maximal. Easy days are good days." error={errors.rpe?.message} />} />
      <Controller control={control} name="notes" render={({ field }) => <FormField multiline label="Notes (optional, private)" value={field.value ?? ""} onChangeText={field.onChange} />} />
      {err ? <ErrorState message={err} /> : null}
      <Button title="Save workout" onPress={() => void submit()} loading={busy} />
      <AppText variant="caption" muted>Saved on your device first, then synced. XP is awarded by the server after it accepts the workout — offline logging never loses a session.</AppText>
    </Screen>
  );
}
