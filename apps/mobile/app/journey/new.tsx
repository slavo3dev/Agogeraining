import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { DemoBanner, Screen } from "../../src/components/ui";
import { JourneyBuilder } from "../../src/features/journey/JourneyBuilder";
import { track } from "../../src/lib/analytics";
import { deviceTimeZone } from "../../src/lib/dates";
import { useApi } from "../../src/services/api";
import { invalidateGame } from "../../src/services/queryClient";
import { useSession } from "../../src/stores/session";

/** Start a fresh journey (no open journey). Earned XP, ranks and history are kept; the new journey starts at Day 1. */
export default function NewJourney() {
  const api = useApi(); const router = useRouter(); const mode = useSession((s) => s.mode);
  const st = useQuery({ queryKey: ["settings", mode], queryFn: () => api.getSettings() });
  return (
    <Screen>
      {mode === "demo" ? <DemoBanner /> : null}
      <JourneyBuilder units={st.data?.unitSystem ?? "metric"} onBegin={async (draft) => {
        await api.createJourney({ ...draft, timezone: deviceTimeZone() });
        track("journey_started", { plan: draft.templateKey });
        await invalidateGame();
        router.replace("/(tabs)");
      }} />
    </Screen>
  );
}
