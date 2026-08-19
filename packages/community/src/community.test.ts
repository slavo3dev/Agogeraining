import { describe, expect, it } from "vitest";
import { canViewSharedAchievement, isShareableField, type SharedAchievement, type SocialGraph } from "./index";

const item: SharedAchievement = { id: "1", ownerId: "alice", kind: "rank_promotion", title: "Hoplitēs", visibility: "friends", approvedByOwnerAt: "2026-11-11T00:00:00Z" };
const graph = (o: Partial<SocialGraph> = {}): SocialGraph => ({ friends: new Set(), blockedBy: new Set(), blocking: new Set(), squadmates: new Set(), ...o });

describe("shared achievement visibility", () => {
  it("friends only", () => {
    expect(canViewSharedAchievement("bob", item, graph({ friends: new Set(["alice"]) }))).toBe(true);
    expect(canViewSharedAchievement("bob", item, graph())).toBe(false);
  });
  it("blocking works in both directions", () => {
    expect(canViewSharedAchievement("bob", item, graph({ friends: new Set(["alice"]), blockedBy: new Set(["alice"]) }))).toBe(false);
    expect(canViewSharedAchievement("bob", item, graph({ friends: new Set(["alice"]), blocking: new Set(["alice"]) }))).toBe(false);
  });
  it("unapproved items are never visible, even to friends", () => {
    expect(canViewSharedAchievement("bob", { ...item, approvedByOwnerAt: "" }, graph({ friends: new Set(["alice"]) }))).toBe(false);
  });
  it("sensitive fields are never shareable", () => {
    for (const f of ["weight", "body_fat", "gps_route", "reflection", "progress_photo"]) expect(isShareableField(f)).toBe(false);
    expect(isShareableField("rank_title")).toBe(true);
  });
});
