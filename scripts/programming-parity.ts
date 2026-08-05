/**
 * Emits generator fixtures + the TypeScript output as JSON for scripts/test-migrations.sh, which runs the same
 * fixtures through internal.generate_sessions and requires identical results.
 */
import { generateSessions, type PlanInputs } from "../packages/campaigns/src/index";

const base: PlanInputs = {
  experience: "returning", focus: "hybrid", availableWeekdays: [0, 2, 4, 5], sportDays: [], sportName: null,
  maxSessionMinutes: 60, equipment: "home_basic", hasLimitations: false, recoveryStyle: "active", eventDate: null,
};
const fixtures: Array<{ horizon: number; inputs: PlanInputs; anchor: string; fromDay: number }> = [
  { horizon: 3, inputs: base, anchor: "2026-11-09", fromDay: 1 },
  { horizon: 9, inputs: { ...base, experience: "new", equipment: "none", recoveryStyle: "full_rest" }, anchor: "2026-11-12", fromDay: 1 },
  { horizon: 30, inputs: { ...base, focus: "strength", equipment: "full_gym", maxSessionMinutes: 30 }, anchor: "2026-11-09", fromDay: 1 },
  { horizon: 30, inputs: { ...base, sportDays: [3], sportName: "Soccer" }, anchor: "2026-11-20", fromDay: 10 },
  { horizon: 60, inputs: { ...base, experience: "regular", focus: "cardio", availableWeekdays: [0, 1, 2, 3, 4, 5] }, anchor: "2026-11-09", fromDay: 1 },
  { horizon: 90, inputs: { ...base, experience: "experienced", focus: "mobility", eventDate: "2027-01-17" }, anchor: "2026-11-09", fromDay: 1 },
  { horizon: 90, inputs: { ...base, experience: "regular", hasLimitations: true, sportDays: [1, 3], availableWeekdays: [0, 4, 5] }, anchor: "2027-03-08", fromDay: 6 },
  { horizon: 300, inputs: { ...base, experience: "experienced", focus: "general_health", sportDays: [6], availableWeekdays: [0, 1, 2, 3, 4], maxSessionMinutes: 90 }, anchor: "2026-11-09", fromDay: 1 },
  { horizon: 300, inputs: { ...base, experience: "regular", focus: "strength", eventDate: "2027-06-30" }, anchor: "2026-12-31", fromDay: 120 },
];
console.log(JSON.stringify(fixtures.map((f) => ({ ...f, sessions: generateSessions(f) }))));
