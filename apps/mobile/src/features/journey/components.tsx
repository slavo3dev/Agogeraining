import { PLAN_TEMPLATES, checkpointsFor, trainingMix, type PlanTemplate } from "@agogeraining/campaigns";
import type { PlanInputsDto, PlannedSessionView } from "@agogeraining/shared-types";
import React from "react";
import { Pressable, Switch, View } from "react-native";
import { SpartanCard } from "../../components/game";
import { AppText, Chip, FormField, StatusTag } from "../../components/ui";
import { useTheme } from "../../theme";
import { INTENSITY_LABEL, PHASE_LABEL, WEEKDAYS, checkpointLabel, rankLabel, sessionTitle, shortDate } from "@agogeraining/app-core";

// ---------------------------------------------------------------------------------------------
// Plan cards — every plan is selectable; "Recommended" is a quiet suggestion, never a lock.
// ---------------------------------------------------------------------------------------------
export function PlanCards({ selected, recommended, onSelect, minDays = 0 }: { selected?: string; recommended?: string | null; onSelect: (key: string) => void; minDays?: number }) {
  const plans = PLAN_TEMPLATES.filter((p) => p.durationDays > minDays);
  const groups: Array<[string, PlanTemplate[]]> = [
    ["PREP — Small Challenges", plans.filter((p) => p.tier === "prep")],
    ["MAIN CAMPAIGNS", plans.filter((p) => p.tier === "campaign")],
  ];
  return (
    <View style={{ gap: 12 }}>
      {groups.filter(([, ps]) => ps.length > 0).map(([title, ps]) => (
        <View key={title} style={{ gap: 10 }}>
          <AppText variant="caption" muted style={{ letterSpacing: 1.5, fontWeight: "700" }}>{title}</AppText>
          {ps.map((p) => <PlanCard key={p.key} plan={p} selected={selected === p.key} recommended={recommended === p.key} onPress={() => onSelect(p.key)} />)}
        </View>
      ))}
    </View>
  );
}

function PlanCard({ plan, selected, recommended, onPress }: { plan: PlanTemplate; selected: boolean; recommended: boolean; onPress: () => void }) {
  const { c, radius } = useTheme();
  const cps = checkpointsFor(plan.durationDays).map((x) => x.day).join(" · ");
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}
      accessibilityLabel={`${plan.name}. ${plan.tagline}${recommended ? " Recommended for you." : ""}${selected ? " Selected." : ""}`}
      style={({ pressed }) => ({ borderRadius: radius.md, borderWidth: 2, borderColor: selected ? c.progress : "transparent", opacity: pressed ? 0.9 : 1 })}>
      <SpartanCard accent={plan.tier === "prep" ? "bronze" : "crimson"}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 64, alignItems: "center" }}>
            <AppText variant="hero" display style={{ color: c.progress }}>{plan.durationDays}</AppText>
            <AppText variant="caption" muted>DAYS</AppText>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="title" display>{plan.name}</AppText>
            <AppText muted>{plan.tagline}</AppText>
          </View>
          {selected ? <AppText accessibilityElementsHidden style={{ color: c.progress, fontWeight: "700" }}>✓</AppText> : null}
        </View>
        {recommended ? <StatusTag status="Recommended for you" /> : null}
        {selected ? (
          <View style={{ gap: 4 }}>
            <AppText variant="caption"><AppText variant="caption" muted>Suits: </AppText>{plan.suits}</AppText>
            <AppText variant="caption"><AppText variant="caption" muted>Commitment: </AppText>{plan.commitment}</AppText>
            <AppText variant="caption"><AppText variant="caption" muted>Intensity: </AppText>{plan.intensity}</AppText>
            <AppText variant="caption"><AppText variant="caption" muted>Sample day: </AppText>{plan.sampleDay}</AppText>
            <AppText variant="caption"><AppText variant="caption" muted>Checkpoints: </AppText>Day {cps}</AppText>
            <AppText variant="caption"><AppText variant="caption" muted>Earn: </AppText>{plan.earnable.join(" · ")}</AppText>
          </View>
        ) : null}
      </SpartanCard>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------
// Session rows / plan preview
// ---------------------------------------------------------------------------------------------
export function SessionRow({ s, done, doneDate, sportName }: { s: PlannedSessionView; done?: boolean; doneDate?: string; sportName?: string | null }) {
  const { c } = useTheme();
  const tone = s.sessionType === "recovery" ? c.recovery : s.intensity === "hard" ? c.primary : c.progress;
  return (
    <View accessible accessibilityLabel={`Day ${s.programDay}, ${sessionTitle(s, sportName)}, ${s.plannedMinutes} minutes, ${INTENSITY_LABEL[s.intensity]}${done ? ", completed" : ""}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
      <View style={{ width: 6, alignSelf: "stretch", borderRadius: 3, backgroundColor: done ? c.recovery : tone }} />
      <View style={{ width: 92 }}>
        <AppText variant="caption" muted>Day {s.programDay}</AppText>
        <AppText variant="caption">{done ? `✓ ${doneDate ? shortDate(doneDate) : ""}` : shortDate(s.scheduledFor)}</AppText>
      </View>
      <View style={{ flex: 1 }}>
        <AppText numberOfLines={1} style={{ fontWeight: "600" }}>{sessionTitle(s, sportName)}{s.checkpoint ? " ★" : ""}</AppText>
        <AppText variant="caption" muted>{s.sessionType === "recovery" ? "Check in" : `${s.plannedMinutes} min`} · {INTENSITY_LABEL[s.intensity]} · {PHASE_LABEL[s.phase]}</AppText>
      </View>
    </View>
  );
}

export function PlanPreview({ horizon, sessions, credited = 0, planName, sportName }: { horizon: number; sessions: PlannedSessionView[]; credited?: number; planName: string; sportName?: string | null }) {
  const upcoming = sessions.filter((s) => s.programDay > credited);
  const week = upcoming.slice(0, 7);
  const mix = trainingMix(week as Parameters<typeof trainingMix>[0]);
  const cps = checkpointsFor(horizon);
  const firstBoss = cps.find((x) => x.kind === "promotion" && x.day > credited) ?? null;
  const dateOf = (day: number) => sessions.find((s) => s.programDay === day)?.scheduledFor;
  return (
    <View style={{ gap: 12 }}>
      <SpartanCard accent="crimson">
        <AppText variant="caption" muted>Your plan</AppText>
        <AppText variant="title" display>{planName}</AppText>
        <AppText muted>{credited > 0 ? `Continues at Day ${credited + 1} of ${horizon}` : `Day 1 of ${horizon}`} · first 7 days: {mix.training} training, {mix.recovery} recovery{mix.sport ? `, ${mix.sport} sport` : ""}{mix.checkpoint ? `, ${mix.checkpoint} checkpoint` : ""}</AppText>
      </SpartanCard>
      <SpartanCard>
        <AppText variant="caption" muted>Next seven days</AppText>
        {week.map((s) => <SessionRow key={s.programDay} s={s} sportName={sportName} />)}
        <AppText variant="caption" muted>Dates are projected. Miss a day and the plan simply waits — nothing is lost.</AppText>
      </SpartanCard>
      <SpartanCard>
        <AppText variant="caption" muted>Milestones</AppText>
        {cps.map((cp) => (
          <View key={cp.day} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <AppText style={{ flex: 1 }}>{cp.day <= credited ? "✓ " : "○ "}{checkpointLabel(cp)}</AppText>
            <AppText variant="caption" muted>{cp.day <= credited ? "earned" : dateOf(cp.day) ? `~${shortDate(dateOf(cp.day)!)}` : ""}</AppText>
          </View>
        ))}
        <AppText variant="caption" muted>
          {firstBoss ? `First boss: the ${rankLabel(firstBoss.rankKey)} promotion trial on Day ${firstBoss.day}. Rank changes only when you pass a trial — never from days or XP alone.`
            : "No promotion trial in this plan — Day 3 is a readiness review. Extend anytime to keep going without losing a day."}
        </AppText>
      </SpartanCard>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------
// Plan inputs (schedule) form — controlled
// ---------------------------------------------------------------------------------------------
export type ScheduleFields = Pick<PlanInputsDto, "availableWeekdays" | "sportDays" | "sportName" | "maxSessionMinutes" | "equipment">;
const toggle = (arr: number[], v: number) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v].sort((a, b) => a - b));

export function ScheduleForm({ value, onChange }: { value: ScheduleFields; onChange: (v: ScheduleFields) => void }) {
  const set = (p: Partial<ScheduleFields>) => onChange({ ...value, ...p });
  return (
    <View style={{ gap: 12 }}>
      <AppText muted>Days you can train (up to 6 — at least one rest day is always kept)</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {WEEKDAYS.map((d, i) => <Chip key={d} label={d} selected={value.availableWeekdays.includes(i)} onPress={() => {
          const next = toggle(value.availableWeekdays, i); if (next.length <= 6) set({ availableWeekdays: next });
        }} />)}
      </View>
      <AppText muted>Fixed sport days (optional) — e.g. soccer on Thursday. Counted as a harder session; the next day becomes recovery.</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {WEEKDAYS.map((d, i) => <Chip key={d} label={d} selected={value.sportDays.includes(i)} onPress={() => {
          const next = toggle(value.sportDays, i); if (next.length <= 4) set({ sportDays: next });
        }} />)}
      </View>
      {value.sportDays.length > 0 ? <FormField label="Sport (optional)" value={value.sportName ?? ""} onChangeText={(t) => set({ sportName: t || null })} maxLength={40} placeholder="Soccer" /> : null}
      <AppText muted>Longest session you can usually fit</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[15, 20, 30, 45, 60, 90].map((m) => <Chip key={m} label={`${m} min`} selected={value.maxSessionMinutes === m} onPress={() => set({ maxSessionMinutes: m })} />)}
      </View>
      <AppText muted>Equipment</AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {([["none", "None / bodyweight"], ["home_basic", "Home basics (dumbbells, band)"], ["full_gym", "Full gym"]] as const).map(([k, l]) =>
          <Chip key={k} label={l} selected={value.equipment === k} onPress={() => set({ equipment: k })} />)}
      </View>
    </View>
  );
}

export function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 44 }}>
      <AppText style={{ flex: 1 }}>{label}</AppText>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} />
    </View>
  );
}
