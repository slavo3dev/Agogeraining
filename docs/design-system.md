# Design system — Spartan × Stoic × Roman

Dark-first (obsidian, ivory, restrained crimson, bronze progress, olive recovery; antique gold reserved for major achievements).
Light mode is parchment. Tokens: `packages/design-tokens/src/index.ts`.

| Token | Hex | Use |
|---|---|---|
| obsidian / charcoal / charcoalElevated | #0D1016 / #1A2029 / #252C36 | background / cards / modals |
| spartanCrimson | #942D3D | primary CTA |
| bronze | #B68A50 | XP, progress |
| antiqueGold | #D9B56D | legendary only (rank reveal) |
| marbleIvory / stoneMuted | #F1E9DA / #AFB0AD | text / secondary |
| olive | #647554 | recovery, completion |
| danger | #C45151 | actual errors only |
| parchment | #E8DECA | light canvas |

Contrast is enforced by test (`design-tokens/src/index.test.ts`, WCAG AA 4.5:1). Light-mode accent colours are darkened variants for AA.
Typography: system serif (Georgia/serif) for rank names and headings, system sans for body, tabular numerals for stats. No font downloads.

## Components (`apps/mobile/src/components`)
Built: `SpartanCard`, `RankEmblem` (original SVG shield, chevrons = ordinal), `XPBar`, `StatTile`, `QuestCard`, `CampaignPath`,
`BossTrialCard`, `ChallengeCard`, `RewardModal`, `StoicReflectionCard`, `ProgressChart` (SVG), `FormField`, `ConfirmationSheet`,
`Button`, `Chip`, `StatusTag`, `DraftsBanner`. Deferred with Phalanx: `ActivityFeedCard`, `LeaderboardRow`.

## Accessibility
Labels/roles on interactive elements, ≥44pt targets, `maxFontSizeMultiplier` 1.6 (Dynamic Type), status never by colour alone
(✓/○/⚠ + text), live regions for errors, reward modal has plain-text equivalents, `useReducedMotion` + an in-app override
disable the XP/modal animations, haptics toggle. **Not yet audited with VoiceOver/TalkBack on a device.**

## Motion
Short XP bar tween and reward-modal scale; no heavy 3D, no Skia. Sound is not implemented (haptics only).
