import { convert, type UnitSystem } from "@agogeraining/training";

export const weightLabel = (s: UnitSystem) => (s === "metric" ? "kg" : "lb");
export const distanceLabel = (s: UnitSystem) => (s === "metric" ? "km" : "mi");
export const formatWeight = (kg: number, s: UnitSystem) =>
  `${(s === "metric" ? kg : convert(kg, "kg", "lb")).toFixed(1)} ${weightLabel(s)}`;
export const formatDistance = (m: number, s: UnitSystem) =>
  `${(s === "metric" ? m / 1000 : convert(m, "m", "mi")).toFixed(2)} ${distanceLabel(s)}`;
