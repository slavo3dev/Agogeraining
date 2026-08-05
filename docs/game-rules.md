# Game rules (rules version 1)

## Progression
- Players choose a **journey horizon** (3/9/30/60/90/300) — see [journeys.md](journeys.md). Every journey starts at Day 1
  and can be extended without resetting.
- **Eligible program days**, not calendar days. Completing the planned session on a local date credits *one* program day
  (planned recovery counts with a check-in). Missed days delay completion but never erase progress. Pause/resume supported.
- Gates: Day 9 / 30 / 60 / 90 / 300, counted over lifetime eligible days. Day 3 is a readiness review, never a promotion.
  Day 90/300 need device-recorded / coach-reviewed trial evidence, which the app can't produce yet.
- **Player XP level** 1–100: `xpToReachLevel(L) = round(40 · (L−1)^1.8)`. Early levels fast, later slower. Never decreases.
- **Rank** is separate and gated: days + XP minimum + a passed, linked, accepted trial with sufficient evidence. Coins/cosmetics
  cannot bypass it. Earned ranks are retained. Ranks must be earned in order.

| Rank | Qualified days | Lifetime XP | Trial | Min evidence |
|---|---|---|---|---|
| Agōgē Trainee | 0 | 0 | – | – |
| Hoplitēs | 9 | 400 | yes | self_reported |
| Enōmotarchēs | 30 | 1 800 | yes | self_reported |
| Pentēkontēr | 60 | 4 000 | yes | self_reported |
| Lochagos | 90 | 6 500 | yes | device_recorded |
| Polemarchos | 300 | 20 000 | yes | admin_reviewed |

XP minimums above Day 9 are initial balance guesses to be tuned with data (new rules version, not code edits).

## XP (server-side, ledgered, idempotent)
| Source | XP | Capped daily? |
|---|---|---|
| Primary quest / planned recovery day | 60 | yes |
| Side quest | 15 each | yes |
| Stoic reflection (once/day) | 10 | yes |
| Personal record | 25 | yes — **not yet awarded** (planned) |
| Weekly consistency (5 qualified days in a Mon–Sun week) | 100 | no |
| Personal challenge pass | 150 | no |
| Promotion boss pass | 500 | no |

Ordinary daily cap **120**. The last item is partially awarded to hit the cap exactly. Milestone XP is outside the cap.
Coins (cosmetic only): 10 / 3 / 2 / 5 / 20 / 30 / 100 for the same sources. No cash value, no loot boxes, no pay-to-win.

## Quest qualification
A workout qualifies the next program day if its activity type is in the planned session's allowed list (equivalents allowed)
and it meets the minimum duration (half the planned minutes, at least 5). Recovery days have a 0-second minimum. A fixed
sport day accepts `sport`. An activity that doesn't match is still saved but doesn't qualify the day. A date earlier than the
last credited date can't be credited. Side quests only count after the day has qualified (not from the same session).

## Trials and challenges
State machine: `draft → active → attempted → submitted → verified → passed | failed`; `failed → active` (retry). Every
transition writes an audit event. Evidence levels: `self_reported`, `device_recorded`, `admin_reviewed`. The MVP only offers
`self_reported`, labelled as such everywhere.

- The player picks the goal. Targets above 3× baseline are refused (pick a smaller step).
- `improve_on_baseline` (used for the Day 9 trial) passes by strictly beating the player's *own* baseline — no universal threshold.
- Results wildly beyond the goal (>3× for higher-is-better) are held `needs_review`, never auto-passed and never publicly flagged.
  An admin accepting upgrades evidence to `admin_reviewed`; rejecting returns the challenge to `active`.
- A failed or rejected trial never removes XP.

## Historical note
*Agōgē* was Sparta's training system, not a rank. *Hoplitēs* is a soldier type; *Enōmotarchēs*, *Pentēkontēr*, *Lochagos*,
*Polemarchos* are historical command titles (transliterations vary). Mapping them to fitness milestones is invented game design.
*Basileus* (king, hereditary) is intentionally not a rank. Stoicism is a Greek philosophy developed by Roman Stoics; the
marble/bronze/laurel look is Roman *visual* heritage.
