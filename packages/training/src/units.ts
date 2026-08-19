export type UnitSystem = "metric" | "imperial";

export type MassUnit = "kg" | "lb";
export type DistanceUnit = "m" | "km" | "mi";
export type TimeUnit = "s" | "min" | "h";
export type CountUnit = "reps";
export type Unit = MassUnit | DistanceUnit | TimeUnit | CountUnit;
export type Dimension = "mass" | "distance" | "time" | "count";

const FACTORS: Record<Unit, { dim: Dimension; toBase: number }> = {
  kg: { dim: "mass", toBase: 1 },
  lb: { dim: "mass", toBase: 0.45359237 },
  m: { dim: "distance", toBase: 1 },
  km: { dim: "distance", toBase: 1000 },
  mi: { dim: "distance", toBase: 1609.344 },
  s: { dim: "time", toBase: 1 },
  min: { dim: "time", toBase: 60 },
  h: { dim: "time", toBase: 3600 },
  reps: { dim: "count", toBase: 1 },
};

export const BASE_UNIT: Record<Dimension, Unit> = { mass: "kg", distance: "m", time: "s", count: "reps" };

export function dimensionOf(unit: Unit): Dimension {
  return FACTORS[unit].dim;
}

/** Convert to the canonical base unit (kg, m, s, reps). */
export function toBase(value: number, unit: Unit): number {
  return value * FACTORS[unit].toBase;
}

export function convert(value: number, from: Unit, to: Unit): number {
  if (FACTORS[from].dim !== FACTORS[to].dim) {
    throw new Error(`Cannot convert ${from} to ${to}: different dimensions`);
  }
  return (value * FACTORS[from].toBase) / FACTORS[to].toBase;
}

/** Parse "mm:ss" or "h:mm:ss" (or plain seconds) into seconds. Returns null if invalid. */
export function parseDuration(text: string): number | null {
  const parts = text.trim().split(":");
  if (parts.length < 1 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.length > 1 && nums.slice(1).some((n) => n >= 60)) return null;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function defaultUnits(system: UnitSystem): { mass: MassUnit; distance: DistanceUnit } {
  return system === "metric" ? { mass: "kg", distance: "km" } : { mass: "lb", distance: "mi" };
}
