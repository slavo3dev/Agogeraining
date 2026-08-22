"use client";
import React from "react";
import { SpartanCard } from "../../../src/components/game";
import { AppText, Screen, StatusTag } from "../../../src/components/ui";

/** Deliberately a gate, not a fake feed. Community ships after the solo core is validated and safety tools exist. */
export default function Phalanx() {
  return (
    <Screen>
      <AppText variant="headline">Phalanx</AppText>
      <StatusTag status="planned" />
      <SpartanCard accent="bronze">
        <AppText variant="title">Squads are not open yet</AppText>
        <AppText muted>Phalanx will let you train with friends in small private squads, share achievements you choose to share, and take on team quests.</AppText>
        <AppText muted>It won't launch until blocking, reporting, moderation and privacy controls are working. Until then, nothing about you is shared, and your solo journey is complete without it.</AppText>
      </SpartanCard>
      <SpartanCard>
        <AppText variant="caption" muted>When it arrives</AppText>
        <AppText style={{ whiteSpace: "pre-line" }}>• Invite-only friends and squads of 5–10{"\n"}• Weekly capped contribution score (separate from XP){"\n"}• Only achievements you explicitly share{"\n"}• Never your weight, routes, journal or photos</AppText>
      </SpartanCard>
    </Screen>
  );
}
