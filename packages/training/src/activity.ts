export const ACTIVITY_TYPES = [
  "running", "walking", "hiking", "cycling", "swimming", "strength",
  "mobility", "obstacle", "recovery", "sport", "custom",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface LoggedActivity {
  activityType: ActivityType;
  durationSeconds: number;
  distanceM?: number;
  rpe?: number;
  /** "manual" today; import providers later. */
  origin: string;
  localDay: string; // YYYY-MM-DD in the user's timezone
}

export interface ActivityImportProvider {
  readonly id: string;
  readonly status: "live" | "planned";
  isAvailable(): Promise<boolean>;
  /** Permissions are requested here, at point of use — never during onboarding. */
  requestPermission(): Promise<"granted" | "denied">;
  fetchActivities(range: { from: Date; to: Date }): Promise<Array<LoggedActivity & { externalId: string }>>;
}

export const ManualProvider: ActivityImportProvider = {
  id: "manual",
  status: "live",
  isAvailable: async () => true,
  requestPermission: async () => "granted",
  fetchActivities: async () => [],
};
export const HealthKitProvider: Pick<ActivityImportProvider, "id" | "status"> = { id: "healthkit", status: "planned" };
export const HealthConnectProvider: Pick<ActivityImportProvider, "id" | "status"> = { id: "health_connect", status: "planned" };
