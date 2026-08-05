import { checkpointsFor } from "@agogeraining/campaigns";
import { RANK_META, levelProgress } from "@agogeraining/game-engine";
import type { ChallengeRow, PromotionEvaluation } from "@agogeraining/shared-types";
import React, { useEffect } from "react";
import { Modal, Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Line, Path, Polyline, Text as SvgText } from "react-native-svg";
import { celebrate } from "../lib/feedback";
import { useRewards } from "../stores/rewards";
import { usePrefs, useTheme } from "../theme";
import { AppText, Button, StatusTag } from "./ui";

export function SpartanCard({ children, accent, style }: { children: React.ReactNode; accent?: "bronze" | "crimson" | "olive"; style?: object }) {
  const { c, radius } = useTheme();
  const border = accent === "crimson" ? c.primary : accent === "olive" ? c.recovery : accent === "bronze" ? c.progress : "transparent";
  return <View style={[{ backgroundColor: c.surface, borderRadius: radius.md, padding: 16, gap: 8, borderLeftWidth: accent ? 4 : 0, borderLeftColor: border }, style]}>{children}</View>;
}

/** Original shield emblem: chevrons count the rank ordinal. */
export function RankEmblem({ rankKey, size = 72 }: { rankKey: string; size?: number }) {
  const { c, raw } = useTheme();
  const meta = RANK_META.find((r) => r.rankKey === rankKey) ?? RANK_META[0]!;
  const gold = meta.ordinal >= 5 ? raw.antiqueGold : c.progress;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityRole="image" accessibilityLabel={`Rank emblem: ${meta.name}`}>
      <Path d="M50 6 L88 20 V50 C88 74 70 90 50 96 C30 90 12 74 12 50 V20 Z" fill={c.surfaceElevated} stroke={gold} strokeWidth={4} />
      <Path d="M50 14 L80 25 V50 C80 69 66 82 50 88 C34 82 20 69 20 50 V25 Z" fill="none" stroke={c.primary} strokeWidth={2} />
      {Array.from({ length: Math.max(meta.ordinal, 0) }).map((_, i) => (
        <Polyline key={i} points={`36,${44 + i * 9} 50,${34 + i * 9} 64,${44 + i * 9}`} fill="none" stroke={gold} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {meta.ordinal === 0 ? <Line x1="50" y1="30" x2="50" y2="72" stroke={gold} strokeWidth={4} strokeLinecap="round" /> : null}
    </Svg>
  );
}

export function XPBar({ totalXp }: { totalXp: number }) {
  const { c } = useTheme();
  const reduced = useReducedMotion() || usePrefs((s) => s.reducedMotionOverride);
  const p = levelProgress(totalXp);
  const w = useSharedValue(0);
  useEffect(() => { w.value = reduced ? p.fraction : withTiming(p.fraction, { duration: 600 }); }, [p.fraction, reduced, w]);
  const style = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, w.value)) * 100}%` }));
  const label = p.xpForNext === 0 ? `Level ${p.level}, maximum level` : `Level ${p.level}, ${p.xpIntoLevel} of ${p.xpForNext} experience points to next level`;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(p.fraction * 100) }} style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <AppText variant="numeric">Level {p.level}</AppText>
        <AppText variant="caption" muted>{p.xpForNext === 0 ? "MAX" : `${p.xpIntoLevel} / ${p.xpForNext} XP`}</AppText>
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: c.surfaceElevated, overflow: "hidden" }}>
        <Animated.View style={[{ height: 10, backgroundColor: c.progress }, style]} />
      </View>
    </View>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <SpartanCard style={{ flex: 1, minWidth: 96 }}>
      <AppText variant="caption" muted>{label}</AppText>
      <AppText variant="numeric" accessibilityLabel={`${label}: ${value}`}>{value}</AppText>
      {hint ? <AppText variant="caption" muted>{hint}</AppText> : null}
    </SpartanCard>
  );
}

export function QuestCard({ kind, title, body, done, children }: { kind: "primary" | "side" | "recovery"; title: string; body?: string; done?: boolean; children?: React.ReactNode }) {
  return (
    <SpartanCard accent={done ? "olive" : kind === "recovery" ? "olive" : kind === "primary" ? "crimson" : "bronze"}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <AppText variant="caption" muted>{kind === "primary" ? "Main quest" : kind === "recovery" ? "Planned recovery" : "Side quest"}</AppText>
        <AppText variant="caption" accessibilityLabel={done ? "Completed" : "Not completed"}>{done ? "✓ Done" : "○ Open"}</AppText>
      </View>
      <AppText variant="title">{title}</AppText>
      {body ? <AppText muted>{body}</AppText> : null}
      {children}
    </SpartanCard>
  );
}

/** Journey map: day dots for short plans, a progress rail for long ones, and every checkpoint in the horizon. */
export function CampaignPath({ qualifiedDays, total = 9 }: { qualifiedDays: number; total?: number }) {
  const { c } = useTheme();
  const gates = checkpointsFor(total);
  return (
    <View style={{ gap: 12 }}>
      {total <= 30 ? (
        <View accessible accessibilityLabel={`${qualifiedDays} of ${total} eligible days complete`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {Array.from({ length: total }).map((_, i) => {
            const done = i < qualifiedDays; const current = i === qualifiedDays; const gate = gates.some((g) => g.day === i + 1);
            return (
              <View key={i} style={{ width: 30, height: 30, borderRadius: gate ? 6 : 15, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: done ? c.recovery : current ? c.progress : gate ? c.primary : c.surfaceElevated, backgroundColor: done ? c.recovery : "transparent" }}>
                <AppText variant="caption" style={{ color: done ? "#F1E9DA" : c.text, fontWeight: "700", fontSize: 11 }}>{done ? "✓" : i + 1}</AppText>
              </View>
            );
          })}
        </View>
      ) : (
        <View accessible accessibilityRole="progressbar" accessibilityLabel={`${qualifiedDays} of ${total} eligible days complete`} accessibilityValue={{ min: 0, max: total, now: qualifiedDays }} style={{ gap: 4 }}>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: c.surfaceElevated, overflow: "hidden" }}>
            <View style={{ height: 10, width: `${Math.min(100, (qualifiedDays / total) * 100)}%`, backgroundColor: c.recovery }} />
          </View>
          <AppText variant="caption" muted>{qualifiedDays} / {total} eligible days</AppText>
        </View>
      )}
      <View style={{ gap: 4 }}>
        {gates.map((g) => (
          <View key={g.day} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <AppText variant="caption">Day {g.day} — {g.kind === "readiness" ? "Readiness review" : `${RANK_META.find((r) => r.rankKey === g.rankKey)?.name ?? ""} trial`}</AppText>
            <AppText variant="caption" muted>{qualifiedDays >= g.day ? "✓ reached" : qualifiedDays + 1 === g.day ? "● next" : `in ${g.day - qualifiedDays} days`}</AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const MISSING_LABEL: Record<string, string> = {
  qualified_days: "Complete the qualifying program days",
  lifetime_xp: "Earn the XP minimum",
  trial: "Pass a promotion trial linked to this rank",
  trial_evidence_level: "Trial needs stronger evidence",
  not_next_rank: "Earn the previous rank first",
};
export function BossTrialCard({ evaluation, onPrepare, onClaim, claiming }: { evaluation: PromotionEvaluation; onPrepare: () => void; onClaim: () => void; claiming?: boolean }) {
  const missing = new Set(evaluation.missing);
  const items = [
    { key: "qualified_days", text: `Qualifying days: ${evaluation.qualifiedDays ?? 0} / ${evaluation.requiredDays ?? "?"}` },
    { key: "lifetime_xp", text: `XP: ${evaluation.lifetimeXp ?? 0} / ${evaluation.requiredXp ?? "?"} minimum` },
    { key: "trial", text: "Promotion trial passed" },
  ];
  return (
    <SpartanCard accent="crimson">
      <AppText variant="caption" muted>Next promotion</AppText>
      <AppText variant="title">{evaluation.rankName ?? "Next rank"}</AppText>
      {items.map((i) => (
        <AppText key={i.key} accessibilityLabel={`${i.text}, ${missing.has(i.key) ? "not yet met" : "met"}`}>{missing.has(i.key) ? "○" : "✓"} {i.text}</AppText>
      ))}
      {evaluation.missing.filter((m) => !items.some((i) => i.key === m)).map((m) => <AppText key={m} variant="caption" muted>• {MISSING_LABEL[m] ?? m}</AppText>)}
      {evaluation.rankKey === "lochagos" || evaluation.rankKey === "polemarchos" ? (
        <AppText variant="caption" muted>This gate needs {evaluation.rankKey === "lochagos" ? "device-recorded or coach-reviewed" : "coach-reviewed"} evidence. Device import and coach review arrive in a later release; self-reported trials still earn challenge XP.</AppText>
      ) : null}
      <AppText variant="caption" muted>Rank is earned through consistency and an approved trial — coins and cosmetics can never bypass it.</AppText>
      {evaluation.eligible ? <Button title="Claim promotion" onPress={onClaim} loading={claiming} /> : <Button title="Prepare a trial" variant="secondary" onPress={onPrepare} />}
    </SpartanCard>
  );
}

export function ChallengeCard({ c: ch, onPress }: { c: ChallengeRow; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${ch.title}, ${ch.state}`} onPress={onPress}>
      <SpartanCard accent={ch.state === "passed" ? "olive" : "bronze"}>
        <AppText variant="title">{ch.title}</AppText>
        <AppText muted>Target {ch.target} {ch.unit}{ch.baseline !== null ? ` · baseline ${ch.baseline}` : ""} · due {ch.dueDate}</AppText>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <StatusTag status={ch.state} />
          {ch.evidenceLevel ? <StatusTag status={ch.evidenceLevel} /> : null}
          {ch.linkedRankKey ? <StatusTag status="promotion trial" /> : null}
        </View>
      </SpartanCard>
    </Pressable>
  );
}

export function StoicReflectionCard({ prompt, done, onPress }: { prompt: string; done: boolean; onPress: () => void }) {
  return (
    <SpartanCard accent="olive">
      <AppText variant="caption" muted>Stoic practice · optional · private</AppText>
      <AppText display variant="title">{prompt}</AppText>
      <Button title={done ? "Edit today's reflection" : "Reflect (1–2 min)"} variant="secondary" onPress={onPress} />
    </SpartanCard>
  );
}

/** Trend line, not a daily judgement. Includes a text summary for screen readers. */
export function ProgressChart({ points, unit, title }: { points: Array<{ t: number; v: number }>; unit: string; title: string }) {
  const { c } = useTheme();
  const W = 300, H = 120, P = 24;
  if (points.length === 0) return <AppText muted>No {title.toLowerCase()} entries yet.</AppText>;
  const vs = points.map((p) => p.v); const ts = points.map((p) => p.t);
  const vmin = Math.min(...vs), vmax = Math.max(...vs); const tmin = Math.min(...ts), tmax = Math.max(...ts);
  const x = (t: number) => P + (tmax === tmin ? (W - 2 * P) / 2 : ((t - tmin) / (tmax - tmin)) * (W - 2 * P));
  const y = (v: number) => H - P - (vmax === vmin ? (H - 2 * P) / 2 : ((v - vmin) / (vmax - vmin)) * (H - 2 * P));
  const line = points.map((p) => `${x(p.t)},${y(p.v)}`).join(" ");
  const first = points[0]!.v, last = points[points.length - 1]!.v;
  const summary = `${title}: ${points.length} entries, from ${first.toFixed(1)} to ${last.toFixed(1)} ${unit}. Min ${vmin.toFixed(1)}, max ${vmax.toFixed(1)}.`;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke={c.surfaceElevated} strokeWidth={1} />
        {points.length > 1 ? <Polyline points={line} fill="none" stroke={c.progress} strokeWidth={2.5} /> : null}
        {points.map((p, i) => <Circle key={i} cx={x(p.t)} cy={y(p.v)} r={3.5} fill={c.progress} />)}
        <SvgText x={P} y={14} fill={c.textMuted} fontSize={10}>{vmax.toFixed(1)} {unit}</SvgText>
        <SvgText x={P} y={H - 6} fill={c.textMuted} fontSize={10}>{vmin.toFixed(1)}</SvgText>
      </Svg>
    </View>
  );
}

export function ConfirmationSheet({ visible, title, body, confirmLabel, onConfirm, onCancel }: { visible: boolean; title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  const { c, radius } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} accessibilityViewIsModal>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" }}>
        <View style={{ backgroundColor: c.surfaceElevated, padding: 20, gap: 12, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }}>
          <AppText variant="title">{title}</AppText>
          <AppText muted>{body}</AppText>
          <Button title={confirmLabel} onPress={onConfirm} />
          <Button title="Cancel" variant="ghost" onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

/** Global reward presentation. Every animated reward has a plain-text equivalent. */
export function RewardModal() {
  const queue = useRewards((s) => s.queue); const dismiss = useRewards((s) => s.dismiss);
  const { c, radius } = useTheme();
  const reduced = useReducedMotion() || usePrefs((s) => s.reducedMotionOverride);
  const scale = useSharedValue(reduced ? 1 : 0.85);
  useEffect(() => { if (queue.length) { celebrate(); scale.value = reduced ? 1 : withTiming(1, { duration: 280 }); } else scale.value = reduced ? 1 : 0.85; }, [queue.length, reduced, scale]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  if (!queue.length) return null;
  const rank = queue.find((r) => r.kind === "rank_unlocked");
  return (
    <Modal visible transparent animationType={reduced ? "none" : "fade"} onRequestClose={dismiss} accessibilityViewIsModal>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.7)", padding: 24 }}>
        <Animated.View accessibilityLiveRegion="polite" style={[{ width: "100%", backgroundColor: c.surfaceElevated, borderRadius: radius.lg, padding: 24, gap: 12, borderWidth: 2, borderColor: rank ? "#D9B56D" : c.progress }, anim]}>
          <AppText variant="headline" style={{ textAlign: "center" }}>{rank ? "Promotion earned" : "Well done"}</AppText>
          {queue.map((r, i) => <AppText key={i} variant={r.kind === "rank_unlocked" ? "title" : "body"} style={{ textAlign: "center" }} accessibilityLabel={r.accessibleText}>{r.label}</AppText>)}
          <Button title="Continue" onPress={dismiss} />
        </Animated.View>
      </View>
    </Modal>
  );
}
