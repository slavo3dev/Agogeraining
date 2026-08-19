export type CampaignState = "active" | "paused" | "completed";

export interface DayRecord { programDay: number; localDate: string }

export interface CampaignProgress {
  state: CampaignState;
  totalQualifyingDays: number;
  /** Qualified days in order. Length === qualified day count. Never shrinks. */
  records: DayRecord[];
}

export function newCampaign(totalQualifyingDays: number): CampaignProgress {
  return { state: "active", totalQualifyingDays, records: [] };
}

export const qualifiedDayCount = (c: CampaignProgress) => c.records.length;
export const nextProgramDay = (c: CampaignProgress) => Math.min(c.records.length + 1, c.totalQualifyingDays);

export interface QualifyResult { progress: CampaignProgress; newlyQualified: boolean; programDay: number | null }

/**
 * Record a qualifying activity on a local date. At most one program day per local date;
 * a missed calendar day simply doesn't add a record (history is never erased).
 * Paused/completed campaigns never advance.
 */
export function applyQualifyingActivity(c: CampaignProgress, localDate: string): QualifyResult {
  if (c.state !== "active") return { progress: c, newlyQualified: false, programDay: null };
  const existing = c.records.find((r) => r.localDate === localDate);
  if (existing) return { progress: c, newlyQualified: false, programDay: existing.programDay };
  if (c.records.length >= c.totalQualifyingDays) return { progress: c, newlyQualified: false, programDay: null };
  const programDay = c.records.length + 1;
  const records = [...c.records, { programDay, localDate }];
  const state: CampaignState = records.length >= c.totalQualifyingDays ? "completed" : "active";
  return { progress: { ...c, records, state }, newlyQualified: true, programDay };
}

export const pauseCampaign = (c: CampaignProgress): CampaignProgress => (c.state === "active" ? { ...c, state: "paused" } : c);
export const resumeCampaign = (c: CampaignProgress): CampaignProgress => (c.state === "paused" ? { ...c, state: "active" } : c);
