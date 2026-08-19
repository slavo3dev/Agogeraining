import { zodResolver } from "@hookform/resolvers/zod";
import { CampaignEnrollmentInput, CreatePlayerProfileInput } from "@agogeraining/shared-types";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Switch, View } from "react-native";
import { z } from "zod";
import { AppText, Button, Chip, DemoBanner, ErrorState, FormField, Screen } from "../src/components/ui";
import { deviceTimeZone } from "../src/lib/dates";
import { getApi } from "../src/services/api";
import { useSession } from "../src/stores/session";

const FOCUS = [["strength", "Strength"], ["cardio", "Cardio"], ["hybrid", "Hybrid / Spartan"], ["mobility", "Mobility"], ["general_health", "General health"]] as const;
const AVATARS = ["laurel", "shield", "spear", "column", "torch", "scroll"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const Schema = z.object({
  displayName: z.string().trim().min(2, "At least 2 characters").max(32),
  avatarId: z.string(),
  unitSystem: z.enum(["metric", "imperial"]),
  ageBand: z.enum(["18-29", "30-39", "40-49", "50-59", "60+"], { error: "Choose an age band (18+ only)" }),
  primaryFocus: z.enum(["strength", "cardio", "hybrid", "mobility", "general_health"]),
  secondaryFocuses: z.array(z.string()),
  pushUps: z.string().regex(/^\d{0,3}$/, "Whole number").optional(),
  walkMinutes: z.string().regex(/^\d{0,3}$/, "Whole number").optional(),
  equipment: z.enum(["none", "home_basic", "full_gym"]),
  preferredDays: z.array(z.number()),
  limitations: z.string().max(500).optional(),
  difficulty: z.enum(["gentle", "standard", "challenging"]),
  notifications: z.boolean(),
  socialSharing: z.boolean(),
});
type Form = z.infer<typeof Schema>;
const STEP_FIELDS: Array<Array<keyof Form>> = [["displayName", "avatarId", "ageBand"], ["primaryFocus", "unitSystem"], ["pushUps", "walkMinutes"], ["equipment", "preferredDays", "difficulty"], []];
const TITLES = ["Your name", "Your focus", "Your baseline", "Your training week", "Privacy & start"];

export default function Onboarding() {
  const router = useRouter(); const mode = useSession((s) => s.mode); const setHasProfile = useSession((s) => s.setHasProfile);
  const [step, setStep] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, trigger, watch, setValue, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: { displayName: "", avatarId: "laurel", unitSystem: "metric", primaryFocus: "hybrid", secondaryFocuses: [], equipment: "none", preferredDays: [0, 2, 4], difficulty: "standard", notifications: false, socialSharing: false },
  });
  const v = watch();

  const next = async () => { if (await trigger(STEP_FIELDS[step])) setStep((s) => s + 1); };
  const finish = handleSubmit(async (f) => {
    setBusy(true); setError(null);
    try {
      const api = getApi();
      const profile = CreatePlayerProfileInput.parse({ displayName: f.displayName, avatarId: f.avatarId, timezone: deviceTimeZone(), unitSystem: f.unitSystem, ageBand: f.ageBand, primaryFocus: f.primaryFocus, secondaryFocuses: f.secondaryFocuses.filter((x) => x !== f.primaryFocus) });
      await api.createProfile(profile);
      await api.recordConsent("terms", true); await api.recordConsent("privacy", true);
      if (f.notifications) await api.recordConsent("notifications", true);
      if (f.socialSharing) await api.recordConsent("social_sharing", true);
      await api.enroll(CampaignEnrollmentInput.parse({ templateKey: "agoge-9", baseline: { pushUps: f.pushUps ? Number(f.pushUps) : undefined, walkMinutes: f.walkMinutes ? Number(f.walkMinutes) : undefined }, preferences: { preferredDays: f.preferredDays, equipment: f.equipment, limitations: f.limitations || undefined, difficulty: f.difficulty } }));
      setHasProfile(true);
      router.replace("/(tabs)");
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); }
  });

  return (
    <Screen>
      {mode === "demo" ? <DemoBanner /> : null}
      <AppText variant="caption" muted>Step {step + 1} of {TITLES.length}</AppText>
      <AppText variant="headline">{TITLES[step]}</AppText>

      {step === 0 && (<>
        <Controller control={control} name="displayName" render={({ field }) => <FormField label="Display name" value={field.value} onChangeText={field.onChange} error={errors.displayName?.message} />} />
        <AppText muted>Avatar</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{AVATARS.map((a) => <Chip key={a} label={a} selected={v.avatarId === a} onPress={() => setValue("avatarId", a)} />)}</View>
        <AppText muted>Age band (beta is for adults 18+)</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{["18-29", "30-39", "40-49", "50-59", "60+"].map((a) => <Chip key={a} label={a} selected={v.ageBand === a} onPress={() => setValue("ageBand", a as Form["ageBand"], { shouldValidate: true })} />)}</View>
        {errors.ageBand ? <AppText style={{ color: "#C45151" }}>⚠ {errors.ageBand.message}</AppText> : null}
      </>)}

      {step === 1 && (<>
        <AppText muted>Primary focus</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{FOCUS.map(([k, l]) => <Chip key={k} label={l} selected={v.primaryFocus === k} onPress={() => setValue("primaryFocus", k)} />)}</View>
        <AppText muted>Also interested in (optional)</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{FOCUS.filter(([k]) => k !== v.primaryFocus).map(([k, l]) => <Chip key={k} label={l} selected={v.secondaryFocuses.includes(k)} onPress={() => setValue("secondaryFocuses", v.secondaryFocuses.includes(k) ? v.secondaryFocuses.filter((x) => x !== k) : [...v.secondaryFocuses, k])} />)}</View>
        <AppText muted>Units</AppText>
        <View style={{ flexDirection: "row", gap: 8 }}><Chip label="Metric (kg, km)" selected={v.unitSystem === "metric"} onPress={() => setValue("unitSystem", "metric")} /><Chip label="Imperial (lb, mi)" selected={v.unitSystem === "imperial"} onPress={() => setValue("unitSystem", "imperial")} /></View>
      </>)}

      {step === 2 && (<>
        <AppText muted>Low-risk self-report. Skip anything you're unsure about — you can add measurements later. This is not medical advice; see a professional for injuries or concerning symptoms.</AppText>
        <Controller control={control} name="pushUps" render={({ field }) => <FormField label="Push-ups you can do with good form (optional)" keyboardType="number-pad" value={field.value ?? ""} onChangeText={field.onChange} error={errors.pushUps?.message} />} />
        <Controller control={control} name="walkMinutes" render={({ field }) => <FormField label="Minutes you can walk briskly without stopping (optional)" keyboardType="number-pad" value={field.value ?? ""} onChangeText={field.onChange} error={errors.walkMinutes?.message} />} />
      </>)}

      {step === 3 && (<>
        <AppText muted>Preferred training days</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{DAYS.map((d, i) => <Chip key={d} label={d} selected={v.preferredDays.includes(i)} onPress={() => setValue("preferredDays", v.preferredDays.includes(i) ? v.preferredDays.filter((x) => x !== i) : [...v.preferredDays, i])} />)}</View>
        <AppText muted>Equipment</AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{([["none", "None / bodyweight"], ["home_basic", "Home basics"], ["full_gym", "Full gym"]] as const).map(([k, l]) => <Chip key={k} label={l} selected={v.equipment === k} onPress={() => setValue("equipment", k)} />)}</View>
        <AppText muted>Difficulty</AppText>
        <View style={{ flexDirection: "row", gap: 8 }}>{(["gentle", "standard", "challenging"] as const).map((k) => <Chip key={k} label={k} selected={v.difficulty === k} onPress={() => setValue("difficulty", k)} />)}</View>
        <Controller control={control} name="limitations" render={({ field }) => <FormField multiline label="Movement limitations (optional)" value={field.value ?? ""} onChangeText={field.onChange} hint="Used only to pick alternatives. Stays private." />} />
      </>)}

      {step === 4 && (<>
        <AppText muted>Your data is private by default. Turn on only what you want — you can change these anytime.</AppText>
        <ToggleRow label="Notifications (planned — preference saved for later)" value={v.notifications} onChange={(x) => setValue("notifications", x)} />
        <ToggleRow label="Social sharing (planned — Phalanx isn't released yet)" value={v.socialSharing} onChange={(x) => setValue("socialSharing", x)} />
        <AppText variant="caption" muted>Health-device access isn't requested. It will be asked for later, at the moment a feature needs it.</AppText>
        <AppText muted>Your first journey: nine qualifying days, including planned recovery, ending with a personal trial that compares you with your own baseline.</AppText>
        {error ? <ErrorState message={error} /> : null}
      </>)}

      <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
        {step > 0 ? <View style={{ flex: 1 }}><Button title="Back" variant="secondary" onPress={() => setStep((s) => s - 1)} /></View> : null}
        <View style={{ flex: 2 }}>{step < TITLES.length - 1 ? <Button title="Continue" onPress={() => void next()} /> : <Button title="Take the Oath" loading={busy} onPress={() => void finish()} />}</View>
      </View>
    </Screen>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 }}>
      <AppText style={{ flex: 1 }}>{label}</AppText>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} />
    </View>
  );
}
