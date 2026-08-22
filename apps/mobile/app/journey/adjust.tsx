import { addDays, generateSessions, validatePlanInputs, type PlanInputs } from "@agogeraining/campaigns";
import { PlanInputsSchema, type PlanInputsDto } from "@agogeraining/shared-types";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { ConfirmationSheet, SpartanCard } from "../../src/components/game";
import { AppText, Button, Chip, ErrorState, FormField, Loading, Screen } from "../../src/components/ui";
import { ScheduleForm, SessionRow, ToggleRow } from "../../src/features/journey/components";
import { nextAnchor, useCommandCenter, journeyErrorMessage, todayLocal, useApi, invalidateGame } from "@agogeraining/app-core";

/** Adjust availability, fixed sport days, equipment, limitations or an event. Future days only. */
export default function AdjustJourney() {
  const api = useApi(); const router = useRouter();
  const cc = useCommandCenter(); const camp = cc.data?.campaign ?? null;
  const [inputs, setInputs] = useState<PlanInputsDto | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (camp?.planInputs && !inputs) setInputs(camp.planInputs); }, [camp, inputs]);

  const preview = useMemo(() => {
    if (!camp || !inputs || validatePlanInputs(inputs as PlanInputs, todayLocal()).length) return [];
    return generateSessions({ horizon: camp.totalDays, inputs: inputs as PlanInputs, anchor: nextAnchor(camp.qualifiedToday), fromDay: camp.qualifiedDays + 1 }).slice(0, 7);
  }, [camp, inputs]);

  const save = useMutation({
    mutationFn: () => api.updateJourneyPlan(PlanInputsSchema.parse(inputs), reason.trim() || null),
    onSuccess: async () => { await invalidateGame(); router.back(); },
  });

  if (cc.isLoading || !inputs) return <Screen><Loading /></Screen>;
  if (!camp || camp.state === "completed") return <Screen><ErrorState message="No open journey to adjust." /></Screen>;
  const set = (p: Partial<PlanInputsDto>) => setInputs({ ...inputs, ...p });
  const today = todayLocal();

  return (
    <Screen>
      <AppText variant="headline">Adjust your plan</AppText>
      <AppText muted>Changes apply from Day {camp.qualifiedDays + 1}. Completed days and workouts stay exactly as they are.</AppText>
      <ScheduleForm value={inputs} onChange={(v) => setInputs({ ...inputs, ...v, sportName: v.sportDays.length ? v.sportName : null })} />
      <ToggleRow label="Work around a movement limitation" value={inputs.hasLimitations} onChange={(v) => set({ hasLimitations: v })} />
      <AppText muted>Recovery days</AppText>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Chip label="Active" selected={inputs.recoveryStyle === "active"} onPress={() => set({ recoveryStyle: "active" })} />
        <Chip label="Full rest" selected={inputs.recoveryStyle === "full_rest"} onPress={() => set({ recoveryStyle: "full_rest" })} />
      </View>
      <AppText muted>Event (90/300-day plans taper for it)</AppText>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Chip label="No event" selected={!inputs.eventDate} onPress={() => set({ eventDate: null })} />
        {[8, 12, 16].map((w) => <Chip key={w} label={`In ${w} weeks`} selected={inputs.eventDate === addDays(today, w * 7)} onPress={() => set({ eventDate: addDays(today, w * 7) })} />)}
      </View>
      <FormField label="Event date (YYYY-MM-DD)" value={inputs.eventDate ?? ""} maxLength={10} autoCapitalize="none"
        onChangeText={(t) => set({ eventDate: /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : t === "" ? null : inputs.eventDate })} />
      <FormField label="Why the change? (optional)" value={reason} onChangeText={setReason} maxLength={300} placeholder="Soccer moved to Tuesday" />
      {preview.length ? (
        <SpartanCard>
          <AppText variant="caption" muted>Your next seven days after this change</AppText>
          {preview.map((s) => <SessionRow key={s.programDay} s={s} sportName={inputs.sportName} />)}
        </SpartanCard>
      ) : null}
      {err ? <ErrorState message={err} /> : null}
      {save.isError ? <ErrorState message={journeyErrorMessage(save.error)} /> : null}
      <Button title="Review and apply" loading={save.isPending} onPress={() => {
        const issues = validatePlanInputs(inputs as PlanInputs, today);
        if (issues.length) { setErr(journeyErrorMessage(new Error(issues[0]))); return; }
        setErr(null); setConfirm(true);
      }} />
      <ConfirmationSheet visible={confirm} title="Apply schedule change?" body={`Days ${camp.qualifiedDays + 1}–${camp.totalDays} will be re-planned. Nothing you've completed changes.`}
        confirmLabel="Apply" onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); save.mutate(); }} />
    </Screen>
  );
}
