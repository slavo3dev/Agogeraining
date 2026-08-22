"use client";
import { addDays, daysBetween, generateSessions, planByKey, recommendPlan, validatePlanInputs } from "@agogeraining/campaigns";
import { GoalInputSchema, PlanInputsSchema, type CreateJourneyInput, type GoalInput, type PlanInputsDto } from "@agogeraining/shared-types";
import React, { useEffect, useMemo, useState } from "react";
import { AppText, Button, Chip, ErrorState, FormField, Row } from "../../components/ui";
import { track, todayLocal, journeyErrorMessage } from "@agogeraining/app-core";
import { PlanCards, PlanPreview, ScheduleForm, ToggleRow, type ScheduleFields } from "./components";

export type JourneyDraft = Omit<CreateJourneyInput, "timezone">;
export interface PreStep { title: string; render: () => React.ReactNode; validate?: () => Promise<boolean> | boolean }

const EXPERIENCE = [
  ["new", "New to training"], ["returning", "Returning after a break"], ["regular", "Training regularly"], ["experienced", "Experienced athlete"],
] as const;
const FOCUS = [["strength", "Strength"], ["cardio", "Endurance"], ["hybrid", "Hybrid / obstacle"], ["mobility", "Mobility"], ["general_health", "General health"]] as const;

function goalPresets(units: "metric" | "imperial") {
  return [
    { key: "pushups", title: "More push-ups (good form)", metric: "pushups", direction: "higher_better", unit: "reps" },
    { key: "plank", title: "Longer plank hold", metric: "plank_seconds", direction: "higher_better", unit: "s" },
    { key: "mile", title: "Faster mile (walk or run)", metric: "mile_time", direction: "lower_better", unit: "min" },
    { key: "walk", title: "Longer comfortable walk", metric: "walk_distance", direction: "higher_better", unit: units === "metric" ? "km" : "mi" },
    { key: "squat", title: "Stronger goblet squat", metric: "goblet_squat", direction: "higher_better", unit: units === "metric" ? "kg" : "lb" },
  ] as const;
}

export function JourneyBuilder({ preSteps = [], finalExtras, beginLabel = "Begin My Journey", units = "metric", onBegin }: {
  preSteps?: PreStep[]; finalExtras?: React.ReactNode; beginLabel?: string; units?: "metric" | "imperial";
  onBegin: (draft: JourneyDraft) => Promise<void>;
}) {
  const today = todayLocal();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // readiness
  const [experience, setExperience] = useState<PlanInputsDto["experience"] | null>(null);
  const [trainingDays, setTrainingDays] = useState<number | null>(null);
  const [focus, setFocus] = useState<PlanInputsDto["focus"]>("hybrid");
  const [hasLimitations, setHasLimitations] = useState(false);
  const [limitationsNote, setLimitationsNote] = useState("");
  const [recoveryStyle, setRecoveryStyle] = useState<PlanInputsDto["recoveryStyle"]>("active");
  const [pushUps, setPushUps] = useState(""); const [walkMinutes, setWalkMinutes] = useState("");
  // schedule
  const [schedule, setSchedule] = useState<ScheduleFields>({ availableWeekdays: [0, 2, 4], sportDays: [], sportName: null, maxSessionMinutes: 45, equipment: "none" });
  // plan
  const [templateKey, setTemplateKey] = useState<string | undefined>();
  // goal + event
  const presets = goalPresets(units);
  const [presetKey, setPresetKey] = useState<string>(presets[0].key);
  const [goalBaseline, setGoalBaseline] = useState(""); const [goalTarget, setGoalTarget] = useState("");
  const [goalDays, setGoalDays] = useState<number | null>(null);
  const [eventDate, setEventDate] = useState("");

  const plan = templateKey ? planByKey(templateKey) : undefined;
  const eventIso = /^\d{4}-\d{2}-\d{2}$/.test(eventDate) ? eventDate : null;
  const recommended = experience ? recommendPlan({
    experience, availableDays: schedule.availableWeekdays.length, focus, hasLimitations,
    daysToEvent: eventIso ? daysBetween(today, eventIso) : null,
  }) : null;

  const inputs: PlanInputsDto = { experience: experience ?? "new", focus, ...schedule, sportName: schedule.sportDays.length ? schedule.sportName : null, hasLimitations, recoveryStyle, eventDate: eventIso };
  const preset = presets.find((p) => p.key === presetKey) ?? presets[0];
  const goalDate = addDays(today, goalDays ?? Math.max(plan?.durationDays ?? 30, 28));
  const goal: GoalInput = {
    title: preset.title, metric: preset.metric, direction: preset.direction, unit: preset.unit,
    baseline: goalBaseline ? Number(goalBaseline) : null, target: Number(goalTarget), targetDate: goalDate,
  };
  const sessions = useMemo(() => (plan && step === preSteps.length + 4 ? generateSessions({ horizon: plan.durationDays, inputs, anchor: today, fromDay: 1 }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan?.key, step, JSON.stringify(inputs), today]);

  const CHOOSE = preSteps.length + 2;
  useEffect(() => { if (step === CHOOSE) track("plan_viewed", { recommended: recommended ?? null }); }, [step, CHOOSE, recommended]);

  const steps: PreStep[] = [
    ...preSteps,
    {
      title: "Your readiness",
      validate: () => true,
      render: () => (<>
        <AppText muted>A few questions so your plan fits you. Skip anything you're unsure about. This is general fitness guidance, not medical advice.</AppText>
        <AppText muted>Experience</AppText>
        <Row wrap gap={8}>{EXPERIENCE.map(([k, l]) => <Chip key={k} label={l} selected={experience === k} onPress={() => setExperience(k)} />)}</Row>
        <AppText muted>How many days did you train last week?</AppText>
        <Row wrap gap={8}>{[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <Chip key={n} label={String(n)} selected={trainingDays === n} onPress={() => setTrainingDays(n)} />)}</Row>
        <AppText muted>Main focus</AppText>
        <Row wrap gap={8}>{FOCUS.map(([k, l]) => <Chip key={k} label={l} selected={focus === k} onPress={() => setFocus(k)} />)}</Row>
        <ToggleRow label="I have a movement limitation or injury concern" value={hasLimitations} onChange={setHasLimitations} />
        {hasLimitations ? <FormField multiline label="What should we work around? (optional, private)" value={limitationsNote} onChangeText={setLimitationsNote} maxLength={500} hint="Used only to pick gentler alternatives. See a professional for injuries or concerning symptoms." /> : null}
        <AppText muted>Recovery days</AppText>
        <Row wrap gap={8}>
          <Chip label="Active (light mobility)" selected={recoveryStyle === "active"} onPress={() => setRecoveryStyle("active")} />
          <Chip label="Full rest" selected={recoveryStyle === "full_rest"} onPress={() => setRecoveryStyle("full_rest")} />
        </Row>
        <FormField label="Push-ups with good form (optional)" inputMode="numeric" value={pushUps} onChangeText={(t) => setPushUps(t.replace(/\D/g, "").slice(0, 3))} />
        <FormField label="Minutes you can walk briskly without stopping (optional)" inputMode="numeric" value={walkMinutes} onChangeText={(t) => setWalkMinutes(t.replace(/\D/g, "").slice(0, 3))} />
      </>),
    },
    {
      title: "Your week",
      validate: () => { const i = validatePlanInputs(inputs, today); if (i.length) { setError(journeyErrorMessage(new Error(i[0]))); return false; } return true; },
      render: () => <ScheduleForm value={schedule} onChange={setSchedule} />,
    },
    {
      title: "Choose your journey",
      validate: () => { if (!templateKey) { setError("Pick a journey to continue."); return false; } return true; },
      render: () => (<>
        <AppText muted>Every journey starts at Day 1 and can be extended later without losing a single day. Longer plans scale to your level — they never grant rank on their own.</AppText>
        <PlanCards selected={templateKey} recommended={recommended} onSelect={(k) => { setTemplateKey(k); track("plan_selected", { plan: k, recommended: k === recommended }); }} />
      </>),
    },
    {
      title: "Your goal",
      validate: () => {
        const p = GoalInputSchema.safeParse(goal);
        if (!p.success || !Number.isFinite(goal.target)) { setError("Enter a target number for your goal."); return false; }
        if (goal.baseline !== null && goal.baseline > 0) {
          const better = goal.direction === "higher_better" ? goal.target > goal.baseline : goal.target < goal.baseline;
          if (!better) { setError("Your target should be an improvement on your baseline."); return false; }
          const ratio = goal.direction === "higher_better" ? goal.target / goal.baseline : goal.baseline / goal.target;
          if (ratio > 3) { setError(journeyErrorMessage(new Error("target_implausible_choose_smaller_step"))); return false; }
        }
        if (eventDate && !eventIso) { setError("Event date must look like 2027-03-21."); return false; }
        const i = validatePlanInputs(inputs, today); if (i.length) { setError(journeyErrorMessage(new Error(i[0]))); return false; }
        return true;
      },
      render: () => (<>
        <AppText muted>Pick one measurable goal. Your promotion trials can use it later — you set it before attempting, never after.</AppText>
        <Row wrap gap={8}>{presets.map((p) => <Chip key={p.key} label={p.title} selected={presetKey === p.key} onPress={() => setPresetKey(p.key)} />)}</Row>
        <FormField label={`Baseline today (${preset.unit}, optional)`} inputMode="decimal" value={goalBaseline} onChangeText={setGoalBaseline} />
        <FormField label={`Target (${preset.unit})`} inputMode="decimal" value={goalTarget} onChangeText={setGoalTarget} hint={preset.direction === "lower_better" ? "Lower is better for this one." : "A modest step beats a heroic one."} />
        <AppText muted>Target date</AppText>
        <Row wrap gap={8}>
          {[28, 60, 90, 180].map((d) => <Chip key={d} label={`${d} days`} selected={(goalDays ?? -1) === d} onPress={() => setGoalDays(d)} />)}
        </Row>
        <AppText variant="caption" muted>Target date: {goalDate}</AppText>
        <AppText muted>Training for an event? (optional — 90/300-day plans taper for it)</AppText>
        <Row wrap gap={8}>
          <Chip label="No event" selected={!eventDate} onPress={() => setEventDate("")} />
          {[8, 12, 16].map((w) => <Chip key={w} label={`In ${w} weeks`} selected={eventDate === addDays(today, w * 7)} onPress={() => setEventDate(addDays(today, w * 7))} />)}
        </Row>
        <FormField label="Event date (YYYY-MM-DD)" value={eventDate} onChangeText={setEventDate} maxLength={10} />
      </>),
    },
    {
      title: "Preview your plan",
      render: () => (<>
        {plan ? <PlanPreview horizon={plan.durationDays} sessions={sessions} planName={plan.name} sportName={inputs.sportName} /> : null}
        {finalExtras}
      </>),
    },
  ];

  const isLast = step === steps.length - 1;
  const next = async () => {
    setError(null);
    const ok = await (steps[step]!.validate?.() ?? true);
    if (ok) setStep((s) => s + 1);
  };
  const begin = async () => {
    if (!plan) return;
    setBusy(true); setError(null);
    try {
      const planInputs = PlanInputsSchema.parse(inputs);
      await onBegin({
        templateKey: plan.key as JourneyDraft["templateKey"], planInputs, goal: GoalInputSchema.parse(goal),
        baseline: {
          pushUps: pushUps ? Number(pushUps) : undefined, walkMinutes: walkMinutes ? Number(walkMinutes) : undefined,
          currentTrainingDays: trainingDays ?? undefined, limitationsNote: hasLimitations && limitationsNote ? limitationsNote : undefined,
        },
      });
    } catch (e) { setError(journeyErrorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      <AppText variant="caption" muted>Step {step + 1} of {steps.length}</AppText>
      <AppText variant="headline">{steps[step]!.title}</AppText>
      {steps[step]!.render()}
      {error ? <ErrorState message={error} /> : null}
      <Row gap={12} style={{ marginTop: 8 }}>
        {step > 0 ? <div style={{ flex: 1, minWidth: 0 }}><Button title="Back" variant="secondary" onPress={() => { setError(null); setStep((s) => s - 1); }} /></div> : null}
        <div style={{ flex: 2, minWidth: 0 }}>{isLast ? <Button title={beginLabel} loading={busy} onPress={() => void begin()} /> : <Button title="Continue" onPress={() => void next()} />}</div>
      </Row>
    </div>
  );
}
