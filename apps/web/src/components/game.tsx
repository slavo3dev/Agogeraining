"use client";
/** Web counterparts of apps/mobile/src/components/game.tsx. */
import { draftQueue, useRewards } from "@agogeraining/app-core";
import { checkpointsFor } from "@agogeraining/campaigns";
import { colors } from "@agogeraining/design-tokens";
import { RANK_META, levelProgress } from "@agogeraining/game-engine";
import type { ChallengeRow, PromotionEvaluation } from "@agogeraining/shared-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useRef } from "react";
import { AppText, Button, Row, StatusTag } from "./ui";

export function SpartanCard({ children, accent, style }: { children: React.ReactNode; accent?: "bronze" | "crimson" | "olive"; style?: React.CSSProperties }) {
  return <section className={`card ${accent ?? "plain"}`} style={style}>{children}</section>;
}

/** Original shield emblem: chevrons count the rank ordinal. */
export function RankEmblem({ rankKey, size = 72 }: { rankKey: string; size?: number }) {
  const meta = RANK_META.find((r) => r.rankKey === rankKey) ?? RANK_META[0]!;
  const gold = meta.ordinal >= 5 ? colors.antiqueGold : "var(--progress)";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`Rank emblem: ${meta.name}`}>
      <path d="M50 6 L88 20 V50 C88 74 70 90 50 96 C30 90 12 74 12 50 V20 Z" fill="var(--surface-elevated)" stroke={gold} strokeWidth={4} />
      <path d="M50 14 L80 25 V50 C80 69 66 82 50 88 C34 82 20 69 20 50 V25 Z" fill="none" stroke="var(--primary)" strokeWidth={2} />
      {Array.from({ length: Math.max(meta.ordinal, 0) }).map((_, i) => (
        <polyline key={i} points={`36,${44 + i * 9} 50,${34 + i * 9} 64,${44 + i * 9}`} fill="none" stroke={gold} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {meta.ordinal === 0 ? <line x1="50" y1="30" x2="50" y2="72" stroke={gold} strokeWidth={4} strokeLinecap="round" /> : null}
    </svg>
  );
}

export function XPBar({ totalXp }: { totalXp: number }) {
  const p = levelProgress(totalXp);
  const label = p.xpForNext === 0 ? `Level ${p.level}, maximum level` : `Level ${p.level}, ${p.xpIntoLevel} of ${p.xpForNext} experience points to next level`;
  return (
    <div className="col" style={{ gap: 6 }}>
      <Row between>
        <AppText variant="numeric">Level {p.level}</AppText>
        <AppText variant="caption" muted>{p.xpForNext === 0 ? "MAX" : `${p.xpIntoLevel} / ${p.xpForNext} XP`}</AppText>
      </Row>
      <div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.fraction * 100)}>
        <div style={{ width: `${Math.max(0, Math.min(1, p.fraction)) * 100}%` }} />
      </div>
    </div>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <SpartanCard style={{ flex: 1, minWidth: 96 }}>
      <AppText variant="caption" muted>{label}</AppText>
      <AppText variant="numeric" aria-label={`${label}: ${value}`}>{value}</AppText>
      {hint ? <AppText variant="caption" muted>{hint}</AppText> : null}
    </SpartanCard>
  );
}

export function QuestCard({ kind, title, body, done, children }: { kind: "primary" | "side" | "recovery"; title: string; body?: string; done?: boolean; children?: React.ReactNode }) {
  return (
    <SpartanCard accent={done ? "olive" : kind === "recovery" ? "olive" : kind === "primary" ? "crimson" : "bronze"}>
      <Row between>
        <AppText variant="caption" muted>{kind === "primary" ? "Main quest" : kind === "recovery" ? "Planned recovery" : "Side quest"}</AppText>
        <AppText variant="caption" aria-label={done ? "Completed" : "Not completed"}>{done ? "✓ Done" : "○ Open"}</AppText>
      </Row>
      <AppText variant="title">{title}</AppText>
      {body ? <AppText muted>{body}</AppText> : null}
      {children}
    </SpartanCard>
  );
}

/** Journey map: day dots for short plans, a progress rail for long ones, and every checkpoint in the horizon. */
export function CampaignPath({ qualifiedDays, total = 9 }: { qualifiedDays: number; total?: number }) {
  const gates = checkpointsFor(total);
  return (
    <div className="col" style={{ gap: 12 }}>
      {total <= 30 ? (
        <div className="dots" role="img" aria-label={`${qualifiedDays} of ${total} eligible days complete`}>
          {Array.from({ length: total }).map((_, i) => {
            const done = i < qualifiedDays; const current = i === qualifiedDays; const gate = gates.some((g) => g.day === i + 1);
            return <span key={i} className={["dot", gate ? "gate" : "", current ? "current" : "", done ? "done" : ""].join(" ")} aria-hidden>{done ? "✓" : i + 1}</span>;
          })}
        </div>
      ) : (
        <div className="col" style={{ gap: 4 }}>
          <div className="bar recovery" role="progressbar" aria-label={`${qualifiedDays} of ${total} eligible days complete`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={qualifiedDays}>
            <div style={{ width: `${Math.min(100, (qualifiedDays / total) * 100)}%` }} />
          </div>
          <AppText variant="caption" muted>{qualifiedDays} / {total} eligible days</AppText>
        </div>
      )}
      <div className="col" style={{ gap: 4 }}>
        {gates.map((g) => (
          <Row key={g.day} between>
            <AppText variant="caption">Day {g.day} — {g.kind === "readiness" ? "Readiness review" : `${RANK_META.find((r) => r.rankKey === g.rankKey)?.name ?? ""} trial`}</AppText>
            <AppText variant="caption" muted>{qualifiedDays >= g.day ? "✓ reached" : qualifiedDays + 1 === g.day ? "● next" : `in ${g.day - qualifiedDays} days`}</AppText>
          </Row>
        ))}
      </div>
    </div>
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
      {items.map((i) => <AppText key={i.key} aria-label={`${i.text}, ${missing.has(i.key) ? "not yet met" : "met"}`}>{missing.has(i.key) ? "○" : "✓"} {i.text}</AppText>)}
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
    <button type="button" className={`card clickable ${ch.state === "passed" ? "olive" : "bronze"}`} aria-label={`${ch.title}, ${ch.state}`} onClick={onPress}>
      <AppText variant="title">{ch.title}</AppText>
      <AppText muted>Target {ch.target} {ch.unit}{ch.baseline !== null ? ` · baseline ${ch.baseline}` : ""} · due {ch.dueDate}</AppText>
      <Row wrap>
        <StatusTag status={ch.state} />
        {ch.evidenceLevel ? <StatusTag status={ch.evidenceLevel} /> : null}
        {ch.linkedRankKey ? <StatusTag status="promotion trial" /> : null}
      </Row>
    </button>
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
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="var(--surface-elevated)" strokeWidth={1} />
      {points.length > 1 ? <polyline points={line} fill="none" stroke="var(--progress)" strokeWidth={2.5} /> : null}
      {points.map((p, i) => <circle key={i} cx={x(p.t)} cy={y(p.v)} r={3.5} fill="var(--progress)" />)}
      <text x={P} y={14} fill="var(--text-muted)" fontSize={10}>{vmax.toFixed(1)} {unit}</text>
      <text x={P} y={H - 6} fill="var(--text-muted)" fontSize={10}>{vmin.toFixed(1)}</text>
    </svg>
  );
}

/** Modal dialog: closes on Escape and backdrop click; focus moves into the dialog. */
function Dialog({ title, sheet, onClose, children, borderColor }: { title: string; sheet?: boolean; onClose: () => void; children: React.ReactNode; borderColor?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className={`modal-backdrop${sheet ? " sheet" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="modal-card" role="dialog" aria-modal="true" aria-label={title} style={borderColor ? { border: `2px solid ${borderColor}` } : undefined}>{children}</div>
    </div>
  );
}

export function ConfirmationSheet({ visible, title, body, confirmLabel, onConfirm, onCancel }: { visible: boolean; title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  if (!visible) return null;
  return (
    <Dialog title={title} sheet onClose={onCancel}>
      <AppText variant="title">{title}</AppText>
      <AppText muted>{body}</AppText>
      <Button title={confirmLabel} onPress={onConfirm} />
      <Button title="Cancel" variant="ghost" onPress={onCancel} />
    </Dialog>
  );
}

/** Global reward presentation. Every reward has a plain-text equivalent. */
export function RewardModal() {
  const queue = useRewards((s) => s.queue); const dismiss = useRewards((s) => s.dismiss);
  if (!queue.length) return null;
  const rank = queue.find((r) => r.kind === "rank_unlocked");
  return (
    <Dialog title={rank ? "Promotion earned" : "Well done"} onClose={dismiss} borderColor={rank ? colors.antiqueGold : "var(--progress)"}>
      <div aria-live="polite" className="col" style={{ gap: 12, textAlign: "center" }}>
        <AppText variant="headline">{rank ? "Promotion earned" : "Well done"}</AppText>
        {queue.map((r, i) => <AppText key={i} variant={r.kind === "rank_unlocked" ? "title" : "body"} aria-label={r.accessibleText}>{r.label}</AppText>)}
      </div>
      <Button title="Continue" onPress={dismiss} />
    </Dialog>
  );
}

export function DraftsBanner() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ["drafts"], queryFn: () => draftQueue.list(), refetchInterval: 15_000 });
  if (data.length === 0) return null;
  const pending = data.filter((d) => d.status === "pending");
  const rejected = data.filter((d) => d.status === "rejected");
  return (
    <SpartanCard accent="bronze">
      {pending.length ? <AppText>⟳ {pending.length} workout{pending.length > 1 ? "s" : ""} saved in this browser, waiting to sync. Nothing is lost.</AppText> : null}
      {rejected.map((d) => (
        <div key={d.input.idempotencyKey} className="col" style={{ gap: 6 }}>
          <AppText>⚠ A {d.input.activityType} workout from {d.input.localDay} couldn&apos;t be accepted ({d.reason}).</AppText>
          <Button title="Discard this draft" variant="ghost" onPress={async () => { await draftQueue.discard(d.input.idempotencyKey); await qc.invalidateQueries({ queryKey: ["drafts"] }); }} />
        </div>
      ))}
      {pending.length ? <Button title="Sync now" variant="secondary" onPress={async () => { const r = await draftQueue.flush(); useRewards.getState().show(r.newRewards); await qc.invalidateQueries(); }} /> : null}
    </SpartanCard>
  );
}
