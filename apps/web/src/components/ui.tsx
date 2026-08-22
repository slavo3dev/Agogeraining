"use client";
/** Web counterparts of apps/mobile/src/components/ui.tsx — same names and props where it makes sense. */
import Link from "next/link";
import React, { useId } from "react";

type Variant = "body" | "caption" | "title" | "headline" | "hero" | "numeric";
export function AppText({ variant = "body", muted, display, style, className, as, children, ...rest }: {
  variant?: Variant; muted?: boolean; display?: boolean; style?: React.CSSProperties; className?: string; as?: "p" | "span" | "h1" | "h2" | "h3" | "div";
  children?: React.ReactNode; role?: string; "aria-label"?: string; "aria-live"?: "polite" | "assertive" | "off"; id?: string;
}) {
  const Tag = as ?? (variant === "headline" || variant === "hero" ? "h1" : variant === "title" ? "h2" : "p");
  const cls = ["text", `t-${variant}`, muted ? "muted" : "", display ? "display" : "", className ?? ""].filter(Boolean).join(" ");
  return <Tag className={cls} style={{ margin: 0, ...style }} {...rest}>{children}</Tag>;
}

export function Screen({ children }: { children: React.ReactNode }) {
  return <main className="screen">{children}</main>;
}

export function Row({ children, wrap, between, top, gap, style }: { children: React.ReactNode; wrap?: boolean; between?: boolean; top?: boolean; gap?: number; style?: React.CSSProperties }) {
  return <div className={["row", wrap ? "wrap" : "", between ? "between" : "", top ? "top" : ""].join(" ")} style={{ gap, ...style }}>{children}</div>;
}
export function Col({ children, gap, style }: { children: React.ReactNode; gap?: number; style?: React.CSSProperties }) {
  return <div className="col" style={{ gap, ...style }}>{children}</div>;
}

export function Button({ title, onPress, href, variant = "primary", loading, disabled, inline, type = "button", accessibilityHint }: {
  title: string; onPress?: () => void; href?: string; variant?: "primary" | "secondary" | "ghost"; loading?: boolean; disabled?: boolean; inline?: boolean;
  type?: "button" | "submit"; accessibilityHint?: string;
}) {
  const cls = `btn ${variant}${inline ? " inline" : ""}`;
  if (href && !disabled) return <Link className={cls} href={href} title={accessibilityHint}>{title}</Link>;
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} title={accessibilityHint} onClick={onPress}>
      {loading ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} aria-hidden /> : null}{title}
    </button>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return <button type="button" className="chip" aria-pressed={!!selected} onClick={onPress}>{selected ? "✓ " : ""}{label}</button>;
}

export function FormField({ label, error, hint, value, onChangeText, multiline, type = "text", ...input }: {
  label: string; error?: string; hint?: string; value: string; onChangeText: (t: string) => void; multiline?: boolean;
  type?: "text" | "email" | "password" | "number" | "date"; placeholder?: string; maxLength?: number; autoComplete?: string; inputMode?: "decimal" | "numeric" | "text" | "email";
  autoFocus?: boolean;
}) {
  const id = useId();
  const describedBy = error || hint ? `${id}-help` : undefined;
  return (
    <div className={`field${error ? " invalid" : ""}`}>
      <label htmlFor={id} className="t-caption muted">{label}</label>
      {multiline
        ? <textarea id={id} value={value} onChange={(e) => onChangeText(e.target.value)} aria-invalid={!!error} aria-describedby={describedBy} {...input} />
        : <input id={id} type={type} value={value} onChange={(e) => onChangeText(e.target.value)} aria-invalid={!!error} aria-describedby={describedBy} {...input} />}
      {error ? <span id={describedBy} className="t-caption danger" aria-live="polite">⚠ {error}</span> : hint ? <span id={describedBy} className="t-caption muted">{hint}</span> : null}
    </div>
  );
}

export function StatusTag({ status }: { status: string }) {
  return <span className="tag">{status.replace("_", " ")}</span>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="alert">
      <AppText className="danger">⚠ {message}</AppText>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
    </div>
  );
}
export function Loading({ label = "Loading" }: { label?: string }) {
  return <div className="center" role="status" aria-label={label}><span className="spinner" /></div>;
}
export function DemoBanner() {
  return <div role="note" className="demo-banner">DEMO MODE — simulated in this browser only. Not a real account; nothing is synced or ranked.</div>;
}

export function ToggleSwitch({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={value} aria-label={label} className="switch" onClick={() => onChange(!value)} />;
}
