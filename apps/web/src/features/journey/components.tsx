"use client";
/** Web counterparts of apps/mobile/src/features/journey/components.tsx. */
import { INTENSITY_LABEL, PHASE_LABEL, WEEKDAYS, checkpointLabel, rankLabel, sessionTitle, shortDate } from "@agogeraining/app-core";
import { PLAN_TEMPLATES, checkpointsFor, trainingMix, type PlanTemplate } from "@agogeraining/campaigns";
import type { PlanInputsDto, PlannedSessionView } from "@agogeraining/shared-types";
import React from "react";
import { SpartanCard } from "../../components/game";
import { AppText, Chip, FormField, Row, StatusTag, ToggleSwitch } from "../../components/ui";

// Plan cards — every plan is selectable; "Recommended" is a quiet suggestion, never a lock.
export function PlanCards({ selected, recommended, onSelect, minDays = 0 }: { selected?: string; recommended?: string | null; onSelect: (key: string) => void; minDays?: number }) {
  const plans = PLAN_TEMPLATES.filter((p) => p.durationDays > minDays);
  const groups: Array<[string, PlanTemplate[]]> = [
    ["PREP — Small Challenges", plans.filter((p) => p.tier === "prep")],
    ["MAIN CAMPAIGNS", plans.filter((p) => p.tier === "campaign")],
  ];
  return (
    <div className="col" style={{ gap: 12 }} role="radiogroup" aria-label="Plans">
      {groups.filter(([, ps]) => ps.length > 0).map(([title, ps]) => (
        <div key={title} className="col" style={{ gap: 10 }}>
          <AppText variant="caption" muted style={{ letterSpacing: 1.5, fontWeight: 700 }}>{title}</AppText>
          {ps.map((p) => <PlanCard key={p.key} plan={p} selected={selected === p.key} recommended={recommended === p.key} onPress={() => onSelect(p.key)} />)}
        </div>
      ))}
    </div>
  );
}

function PlanCard({ plan, selected, recommended, onPress }: { plan: PlanTemplate; selected: boolean; recommended: boolean; onPress: () => void }) {
  const cps = checkpointsFor(plan.durationDays).map((x) => x.day).join(" · ");
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onPress}
      aria-label={`${plan.name}. ${plan.tagline}${recommended ? " Recommended for you." : ""}`}
      className={`card clickable ${plan.tier === "prep" ? "bronze" : "crimson"}`}
      style={{ outline: selected ? "2px solid var(--progress)" : undefined }}>
      <Row gap={12}>
        <div style={{ width: 64, textAlign: "center" }}>
          <AppText variant="hero" as="div" style={{ color: "var(--progress)" }}>{plan.durationDays}</AppText>
          <AppText variant="caption" muted as="div">DAYS</AppText>
        </div>
        <div className="grow col" style={{ gap: 2 }}>
          <AppText variant="title" display as="div">{plan.name}</AppText>
          <AppText muted as="div">{plan.tagline}</AppText>
        </div>
        {selected ? <span aria-hidden style={{ color: "var(--progress)", fontWeight: 700 }}>✓</span> : null}
      </Row>
      {recommended ? <StatusTag status="Recommended for you" /> : null}
      {selected ? (
        <div className="col" style={{ gap: 4 }}>
          {([["Suits", plan.suits], ["Commitment", plan.commitment], ["Intensity", plan.intensity], ["Sample day", plan.sampleDay], ["Checkpoints", `Day ${cps}`], ["Earn", plan.earnable.join(" · ")]] as const).map(([k, v]) => (
            <AppText key={k} variant="caption" as="div"><span className="muted">{k}: </span>{v}</AppText>
          ))}
        </div>
      ) : null}
    </button>
  );
}

export function SessionRow({ s, done, doneDate, sportName }: { s: PlannedSessionView; done?: boolean; doneDate?: string; sportName?: string | null }) {
  const tone = s.sessionType === "recovery" ? "var(--recovery)" : s.intensity === "hard" ? "var(--primary)" : "var(--progress)";
  return (
    <div className="session-row" aria-label={`Day ${s.programDay}, ${sessionTitle(s, sportName)}, ${s.plannedMinutes} minutes, ${INTENSITY_LABEL[s.intensity]}${done ? ", completed" : ""}`}>
      <span className="stripe" style={{ background: done ? "var(--recovery)" : tone }} />
      <div className="when">
        <AppText variant="caption" muted>Day {s.programDay}</AppText>
        <AppText variant="caption">{done ? `✓ ${doneDate ? shortDate(doneDate) : ""}` : shortDate(s.scheduledFor)}</AppText>
      </div>
      <div className="grow">
        <AppText className="ellipsis" style={{ fontWeight: 600 }}>{sessionTitle(s, sportName)}{s.checkpoint ? " ★" : ""}</AppText>
        <AppText variant="caption" muted>{s.sessionType === "recovery" ? "Check in" : `${s.plannedMinutes} min`} · {INTENSITY_LABEL[s.intensity]} · {PHASE_LABEL[s.phase]}</AppText>
      </div>
    </div>
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
    <div className="col" style={{ gap: 12 }}>
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
          <Row key={cp.day} between>
            <AppText className="grow">{cp.day <= credited ? "✓ " : "○ "}{checkpointLabel(cp)}</AppText>
            <AppText variant="caption" muted>{cp.day <= credited ? "earned" : dateOf(cp.day) ? `~${shortDate(dateOf(cp.day)!)}` : ""}</AppText>
          </Row>
        ))}
        <AppText variant="caption" muted>
          {firstBoss ? `First boss: the ${rankLabel(firstBoss.rankKey)} promotion trial on Day ${firstBoss.day}. Rank changes only when you pass a trial — never from days or XP alone.`
            : "No promotion trial in this plan — Day 3 is a readiness review. Extend anytime to keep going without losing a day."}
        </AppText>
      </SpartanCard>
    </div>
  );
}

export type ScheduleFields = Pick<PlanInputsDto, "availableWeekdays" | "sportDays" | "sportName" | "maxSessionMinutes" | "equipment">;
const toggle = (arr: number[], v: number) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v].sort((a, b) => a - b));

export function ScheduleForm({ value, onChange }: { value: ScheduleFields; onChange: (v: ScheduleFields) => void }) {
  const set = (p: Partial<ScheduleFields>) => onChange({ ...value, ...p });
  return (
    <div className="col" style={{ gap: 12 }}>
      <AppText muted>Days you can train (up to 6 — at least one rest day is always kept)</AppText>
      <Row wrap>
        {WEEKDAYS.map((d, i) => <Chip key={d} label={d} selected={value.availableWeekdays.includes(i)} onPress={() => {
          const next = toggle(value.availableWeekdays, i); if (next.length <= 6) set({ availableWeekdays: next });
        }} />)}
      </Row>
      <AppText muted>Fixed sport days (optional) — e.g. soccer on Thursday. Counted as a harder session; the next day becomes recovery.</AppText>
      <Row wrap>
        {WEEKDAYS.map((d, i) => <Chip key={d} label={d} selected={value.sportDays.includes(i)} onPress={() => {
          const next = toggle(value.sportDays, i); if (next.length <= 4) set({ sportDays: next });
        }} />)}
      </Row>
      {value.sportDays.length > 0 ? <FormField label="Sport (optional)" value={value.sportName ?? ""} onChangeText={(t) => set({ sportName: t || null })} maxLength={40} placeholder="Soccer" /> : null}
      <AppText muted>Longest session you can usually fit</AppText>
      <Row wrap>
        {[15, 20, 30, 45, 60, 90].map((m) => <Chip key={m} label={`${m} min`} selected={value.maxSessionMinutes === m} onPress={() => set({ maxSessionMinutes: m })} />)}
      </Row>
      <AppText muted>Equipment</AppText>
      <Row wrap>
        {([["none", "None / bodyweight"], ["home_basic", "Home basics (dumbbells, band)"], ["full_gym", "Full gym"]] as const).map(([k, l]) =>
          <Chip key={k} label={l} selected={value.equipment === k} onPress={() => set({ equipment: k })} />)}
      </Row>
    </div>
  );
}

export function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row between gap={12} style={{ minHeight: 44 }}>
      <AppText className="grow">{label}</AppText>
      <ToggleSwitch label={label} value={value} onChange={onChange} />
    </Row>
  );
}
