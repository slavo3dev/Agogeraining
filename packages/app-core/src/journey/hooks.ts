import { addDays } from "@agogeraining/campaigns";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "../api";
import { todayLocal } from "../dates";
import { useSession } from "../session";

export function useCommandCenter() {
  const api = useApi(); const mode = useSession((s) => s.mode); const today = todayLocal();
  return useQuery({ queryKey: ["cc", today, mode], queryFn: () => api.getCommandCenter(today) });
}

export function useJourneyPlan(journeyId: string | undefined) {
  const api = useApi(); const mode = useSession((s) => s.mode);
  return useQuery({ queryKey: ["journey-plan", journeyId, mode], queryFn: () => api.getJourneyPlan(journeyId!), enabled: !!journeyId });
}

/** Local date the next uncredited day projects onto (mirrors the server's regeneration anchor). */
export function nextAnchor(qualifiedToday: boolean): string {
  const t = todayLocal();
  return qualifiedToday ? addDays(t, 1) : t;
}
