import type { EvidenceLevel, PlayerSnapshot, RankEligibility, RankRequirement } from "./types";

const EVIDENCE_ORDER: Record<EvidenceLevel, number> = { self_reported: 0, device_recorded: 1, admin_reviewed: 2 };

export function meetsEvidenceLevel(actual: EvidenceLevel, required: EvidenceLevel): boolean {
  return EVIDENCE_ORDER[actual] >= EVIDENCE_ORDER[required];
}

/** Pure rule check. The server calls the SQL equivalent against trusted rows only. */
export function evaluateRankEligibility(player: PlayerSnapshot, req: RankRequirement): RankEligibility {
  const missing: RankEligibility["missing"] = [];
  if (player.qualifiedDays < req.minQualifiedDays) missing.push("qualified_days");
  if (player.lifetimeXp < req.minLifetimeXp) missing.push("lifetime_xp");
  if (req.requiresTrial) {
    if (player.passedTrialEvidence === null) missing.push("trial");
    else if (!meetsEvidenceLevel(player.passedTrialEvidence, req.minEvidenceLevel)) missing.push("trial_evidence_level");
  }
  return { eligible: missing.length === 0, missing };
}

/** Versioned rank gates (mirrors seed.sql). Names are game titles, not historical promotion criteria. */
export const RANK_REQUIREMENTS_V1: RankRequirement[] = [
  { rankKey: "agoge_trainee", rulesVersion: 1, minQualifiedDays: 0, minLifetimeXp: 0, requiresTrial: false, minEvidenceLevel: "self_reported" },
  { rankKey: "hoplites", rulesVersion: 1, minQualifiedDays: 9, minLifetimeXp: 400, requiresTrial: true, minEvidenceLevel: "self_reported" },
  { rankKey: "enomotarches", rulesVersion: 1, minQualifiedDays: 30, minLifetimeXp: 1800, requiresTrial: true, minEvidenceLevel: "self_reported" },
  { rankKey: "pentekonter", rulesVersion: 1, minQualifiedDays: 60, minLifetimeXp: 4000, requiresTrial: true, minEvidenceLevel: "self_reported" },
  { rankKey: "lochagos", rulesVersion: 1, minQualifiedDays: 90, minLifetimeXp: 6500, requiresTrial: true, minEvidenceLevel: "device_recorded" },
  { rankKey: "polemarchos", rulesVersion: 1, minQualifiedDays: 300, minLifetimeXp: 20000, requiresTrial: true, minEvidenceLevel: "admin_reviewed" },
];

/** Display metadata. Titles are historical-inspired *game* ranks, not claims about Spartan promotion. */
export const RANK_META: Array<{ rankKey: string; ordinal: number; name: string; note: string }> = [
  { rankKey: "agoge_trainee", ordinal: 0, name: "Agōgē Trainee", note: "The agōgē was Sparta's training system, not a rank. Here it names your starting status." },
  { rankKey: "hoplites", ordinal: 1, name: "Hoplitēs", note: "A hoplitēs was a heavy infantry soldier. In-game: your first earned promotion." },
  { rankKey: "enomotarches", ordinal: 2, name: "Enōmotarchēs", note: "Historically the leader of an enōmotia. In-game: Day 30 gate." },
  { rankKey: "pentekonter", ordinal: 3, name: "Pentēkontēr", note: "Historically a commander of a pentēkostys. In-game: Day 60 gate." },
  { rankKey: "lochagos", ordinal: 4, name: "Lochagos", note: "Historically a lochos commander. In-game: Day 90 gate." },
  { rankKey: "polemarchos", ordinal: 5, name: "Polemarchos", note: "Historically a senior military commander. In-game: Day 300 gate." },
];
