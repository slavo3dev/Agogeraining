"use client";
import { CreatePlayerProfileInput } from "@agogeraining/shared-types";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { AppText, Chip, Col, DemoBanner, FormField, Row, Screen } from "../../src/components/ui";
import { JourneyBuilder, type PreStep } from "../../src/features/journey/JourneyBuilder";
import { ToggleRow } from "../../src/features/journey/components";
import { analytics, track, deviceTimeZone, getApi, invalidateGame, useSession } from "@agogeraining/app-core";

const AVATARS = ["laurel", "shield", "spear", "column", "torch", "scroll"];
const AGE_BANDS = ["18-29", "30-39", "40-49", "50-59", "60+"] as const;

export default function Onboarding() {
  const router = useRouter(); const mode = useSession((s) => s.mode); const setHasProfile = useSession((s) => s.setHasProfile);
  const [displayName, setDisplayName] = useState(""); const [nameError, setNameError] = useState<string | undefined>();
  const [avatarId, setAvatarId] = useState("laurel");
  const [ageBand, setAgeBand] = useState<(typeof AGE_BANDS)[number] | null>(null); const [ageError, setAgeError] = useState<string | undefined>();
  const [unitSystem, setUnitSystem] = useState<"metric" | "imperial">("metric");
  const [notifications, setNotifications] = useState(false); const [socialSharing, setSocialSharing] = useState(false); const [analyticsOptIn, setAnalyticsOptIn] = useState(false);

  const who: PreStep = {
    title: "Who trains today?",
    validate: () => {
      const n = displayName.trim();
      setNameError(n.length < 2 || n.length > 32 ? "2–32 characters" : undefined);
      setAgeError(ageBand ? undefined : "Choose an age band (18+ only)");
      return n.length >= 2 && n.length <= 32 && !!ageBand;
    },
    render: () => (<>
      <AppText muted>Train in the real world. Level up in the game.</AppText>
      <FormField label="Display name" value={displayName} onChangeText={setDisplayName} error={nameError} maxLength={32} />
      <AppText muted>Avatar</AppText>
      <Row wrap gap={8}>{AVATARS.map((a) => <Chip key={a} label={a} selected={avatarId === a} onPress={() => setAvatarId(a)} />)}</Row>
      <AppText muted>Age band (beta is for adults 18+)</AppText>
      <Row wrap gap={8}>{AGE_BANDS.map((a) => <Chip key={a} label={a} selected={ageBand === a} onPress={() => setAgeBand(a)} />)}</Row>
      {ageError ? <AppText variant="caption" style={{ color: "var(--danger)" }}>⚠ {ageError}</AppText> : null}
      <AppText muted>Units</AppText>
      <Row wrap gap={8}>
        <Chip label="Metric (kg, km)" selected={unitSystem === "metric"} onPress={() => setUnitSystem("metric")} />
        <Chip label="Imperial (lb, mi)" selected={unitSystem === "imperial"} onPress={() => setUnitSystem("imperial")} />
      </Row>
    </>),
  };

  const privacy = (
    <Col gap={8}>
      <AppText muted>Your data is private by default. Turn on only what you want — you can change these anytime.</AppText>
      <ToggleRow label="Anonymous usage analytics (helps us improve plans)" value={analyticsOptIn} onChange={setAnalyticsOptIn} />
      <ToggleRow label="Notifications (planned — preference saved for later)" value={notifications} onChange={setNotifications} />
      <ToggleRow label="Social sharing (planned — Phalanx isn't released yet)" value={socialSharing} onChange={setSocialSharing} />
      <AppText variant="caption" muted>Health-device access isn't requested. It will be asked for later, at the moment a feature needs it.</AppText>
    </Col>
  );

  return (
    <Screen>
      {mode === "demo" ? <DemoBanner /> : null}
      <JourneyBuilder
        preSteps={[who]}
        units={unitSystem}
        finalExtras={privacy}
        onBegin={async (draft) => {
          const api = getApi();
          await api.createProfile(CreatePlayerProfileInput.parse({
            displayName: displayName.trim(), avatarId, timezone: deviceTimeZone(), unitSystem, ageBand: ageBand ?? undefined,
            primaryFocus: draft.planInputs.focus, secondaryFocuses: [],
          }));
          await api.recordConsent("terms", true); await api.recordConsent("privacy", true);
          if (notifications) await api.recordConsent("notifications", true);
          if (socialSharing) await api.recordConsent("social_sharing", true);
          if (analyticsOptIn) await api.recordConsent("analytics", true);
          analytics.setOptIn(analyticsOptIn);
          await api.createJourney({ ...draft, baseline: { ...draft.baseline, ageBand: ageBand ?? undefined }, timezone: deviceTimeZone() });
          track("journey_started", { plan: draft.templateKey });
          await invalidateGame();
          setHasProfile(true);
          router.replace("/");
        }}
      />
    </Screen>
  );
}
