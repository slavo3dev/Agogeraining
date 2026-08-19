import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { AppText, Button, Chip, FormField, Screen } from "../../src/components/ui";
import { supabase } from "../../src/services/supabase";
import { View } from "react-native";

const Schema = z.object({ email: z.string().email("Enter a valid email"), password: z.string().min(8, "At least 8 characters") });
type Form = z.infer<typeof Schema>;

export default function SignIn() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { control, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(Schema), defaultValues: { email: "", password: "" } });

  const submit = handleSubmit(async ({ email, password }) => {
    if (!supabase) return;
    setBusy(true); setMessage(null);
    const { data, error } = mode === "in" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
    else if (mode === "up" && !data.session) setMessage("Check your email to verify your account, then sign in.");
  });
  const reset = async (email: string) => {
    if (!supabase || !email) { setMessage("Enter your email first."); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setMessage(error ? error.message : "If that account exists, a reset link is on its way.");
  };

  return (
    <Screen>
      <AppText variant="headline">{mode === "in" ? "Welcome back" : "Create your account"}</AppText>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="Sign in" selected={mode === "in"} onPress={() => setMode("in")} />
        <Chip label="Sign up" selected={mode === "up"} onPress={() => setMode("up")} />
      </View>
      <Controller control={control} name="email" render={({ field }) => (
        <FormField label="Email" value={field.value} onChangeText={field.onChange} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={errors.email?.message} />)} />
      <Controller control={control} name="password" render={({ field }) => (
        <FormField label="Password" value={field.value} onChangeText={field.onChange} secureTextEntry autoComplete={mode === "in" ? "current-password" : "new-password"} error={errors.password?.message} />)} />
      {message ? <AppText accessibilityLiveRegion="polite">{message}</AppText> : null}
      <Button title={mode === "in" ? "Sign in" : "Create account"} onPress={() => void submit()} loading={busy} />
      {mode === "in" ? <Controller control={control} name="email" render={({ field }) => <Button title="Forgot password?" variant="ghost" onPress={() => void reset(field.value)} />} /> : null}
      <AppText variant="caption" muted>Adults 18+ only during the beta. Apple and Google sign-in are planned and appear only when configured.</AppText>
      <Button title="Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
