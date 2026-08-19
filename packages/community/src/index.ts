/** Domain types and permission rules only. Community is a Phase 3 feature — nothing here is wired to UI yet. */
export type Visibility = "private" | "friends" | "squad";

export interface SocialGraph {
  friends: ReadonlySet<string>;
  blockedBy: ReadonlySet<string>; // users who blocked the viewer
  blocking: ReadonlySet<string>; // users the viewer blocked
  squadmates: ReadonlySet<string>;
}

/** A SharedAchievement is a user-approved projection, never the private event itself. */
export interface SharedAchievement {
  id: string;
  ownerId: string;
  kind: "rank_promotion" | "challenge_pass" | "milestone" | "quest_summary";
  title: string;
  visibility: Visibility;
  approvedByOwnerAt: string;
}

const NEVER_SHARED = ["gps_route", "exact_location", "weight", "body_fat", "medical", "reflection", "progress_photo"] as const;
export const isShareableField = (f: string) => !(NEVER_SHARED as readonly string[]).includes(f);

export function canViewSharedAchievement(viewerId: string, item: SharedAchievement, graph: SocialGraph): boolean {
  if (!item.approvedByOwnerAt) return false;
  if (viewerId === item.ownerId) return true;
  if (graph.blockedBy.has(item.ownerId) || graph.blocking.has(item.ownerId)) return false;
  if (item.visibility === "private") return false;
  if (item.visibility === "friends") return graph.friends.has(item.ownerId);
  return graph.squadmates.has(item.ownerId);
}
