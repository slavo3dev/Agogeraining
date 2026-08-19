import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { minTouchTarget } from "@agogeraining/design-tokens";
import { tap } from "../lib/feedback";
import { fonts, useTheme } from "../theme";

type Variant = "body" | "caption" | "title" | "headline" | "hero" | "numeric";
export function AppText({ variant = "body", muted, style, display, ...p }: React.ComponentProps<typeof Text> & { variant?: Variant; muted?: boolean; display?: boolean }) {
  const { c } = useTheme();
  const size = { caption: 13, body: 16, title: 20, headline: 26, hero: 34, numeric: 22 }[variant];
  const st: TextStyle = {
    color: muted ? c.textMuted : c.text, fontSize: size,
    fontFamily: display || variant === "hero" || variant === "headline" ? fonts.display : fonts.body,
    fontWeight: variant === "hero" || variant === "headline" || variant === "title" ? "700" : "400",
    fontVariant: variant === "numeric" ? ["tabular-nums"] : undefined,
  };
  return <Text maxFontSizeMultiplier={1.6} style={[st, style]} {...p} />;
}

export function Screen({ children, scroll = true, padded = true }: { children: React.ReactNode; scroll?: boolean; padded?: boolean }) {
  const { c, spacing } = useTheme();
  const inner = { padding: padded ? spacing.md : 0, gap: spacing.md };
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: c.background }}>
      {scroll ? <ScrollView contentContainerStyle={[inner, { paddingBottom: spacing.xxl }]} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[{ flex: 1 }, inner]}>{children}</View>}
    </SafeAreaView>
  );
}

export function Button({ title, onPress, variant = "primary", loading, disabled, accessibilityHint }: {
  title: string; onPress: () => void; variant?: "primary" | "secondary" | "ghost"; loading?: boolean; disabled?: boolean; accessibilityHint?: string;
}) {
  const { c, radius } = useTheme();
  const bg = variant === "primary" ? c.primary : "transparent";
  const border = variant === "secondary" ? c.progress : "transparent";
  const off = disabled || loading;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={accessibilityHint} accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off} onPress={() => { tap(); onPress(); }}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, borderColor: border, borderRadius: radius.md, opacity: off ? 0.5 : pressed ? 0.85 : 1, minHeight: minTouchTarget + 4 }]}>
      {loading ? <ActivityIndicator color="#F1E9DA" /> : <AppText style={{ color: variant === "primary" ? "#F1E9DA" : c.text, fontWeight: "700" }}>{title}</AppText>}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const { c, radius } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} accessibilityLabel={`${label}${selected ? ", selected" : ""}`} onPress={() => { tap(); onPress?.(); }}
      style={{ minHeight: minTouchTarget, paddingHorizontal: 14, justifyContent: "center", borderRadius: radius.lg, borderWidth: 1, borderColor: selected ? c.progress : c.surfaceElevated, backgroundColor: selected ? c.surfaceElevated : "transparent" }}>
      <AppText variant="caption" style={{ fontWeight: selected ? "700" : "400" }}>{selected ? "✓ " : ""}{label}</AppText>
    </Pressable>
  );
}

export function FormField({ label, error, hint, ...input }: TextInputProps & { label: string; error?: string; hint?: string }) {
  const { c, radius } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="caption" muted>{label}</AppText>
      <TextInput accessibilityLabel={label} placeholderTextColor={c.textMuted} {...input}
        style={[{ minHeight: minTouchTarget, borderRadius: radius.md, paddingHorizontal: 12, color: c.text, backgroundColor: c.surface, borderWidth: 1, borderColor: error ? c.danger : c.surfaceElevated, fontSize: 16 }, input.multiline && { minHeight: 96, paddingTop: 10, textAlignVertical: "top" }, input.style]} />
      {error ? <AppText variant="caption" style={{ color: c.danger }} accessibilityLiveRegion="polite">⚠ {error}</AppText> : hint ? <AppText variant="caption" muted>{hint}</AppText> : null}
    </View>
  );
}

export function StatusTag({ status }: { status: "implemented" | "feature_flagged" | "planned" | "demo" | "self_reported" | string }) {
  const { c } = useTheme();
  const label = status.replace("_", " ");
  return (
    <View style={{ alignSelf: "flex-start", borderWidth: 1, borderColor: c.textMuted, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <AppText variant="caption" muted>{label}</AppText>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="alert" style={{ gap: 8, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: c.danger }}>
      <AppText style={{ color: c.danger }}>⚠ {message}</AppText>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}
export function Loading({ label = "Loading" }: { label?: string }) {
  return <View accessibilityLabel={label} style={{ padding: 32, alignItems: "center" }}><ActivityIndicator /></View>;
}
export function DemoBanner() {
  const { c } = useTheme();
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: c.surfaceElevated, borderRadius: 8, padding: 10, borderLeftWidth: 4, borderLeftColor: c.progress }}>
      <AppText variant="caption">DEMO MODE — simulated on this device only. Not a real account; nothing is synced or ranked.</AppText>
    </View>
  );
}
const styles = StyleSheet.create({ btn: { alignItems: "center", justifyContent: "center", paddingHorizontal: 16, borderWidth: 1 } });
