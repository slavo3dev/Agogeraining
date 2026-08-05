# Choose Your Journey

Players pick a plan horizon at onboarding (or later), get a personalized, previewable schedule, and can extend it
without losing anything. This doc is the source of truth for journey rules; `docs/game-rules.md` covers XP and ranks.

## Six separate concepts (never synonyms)

| Concept | Where it lives | Changes when |
|---|---|---|
| **Plan horizon** (3/9/30/60/90/300) | `campaign_templates.total_qualifying_days` via `user_campaigns.template_id` | the player extends |
| **Eligible journey days** | `user_campaigns.qualified_days` + `campaign_day_records` (one per local date) | a planned session is completed |
| **Training phase** | `planned_sessions.phase` | derived per program day by the generator |
| **XP level** | `xp_ledger` → `profiles.level` | any XP award |
| **Spartan rank** | `user_rank_history` → `profiles.rank_key` | only `claim_promotion` after a verified trial |
| **Custom challenge** | `user_challenges` | the player creates one; never bypasses rank rules |

## Plans

| Tier | Key | Plan | Checkpoints |
|---|---|---|---|
| PREP | `initiation-3` | 3-Day Initiation | 3 (readiness review — orientation, **not** a promotion) |
| PREP | `agoge-9` | 9-Day Agōgē | 3, 9 (Hoplitēs trial) |
| CAMPAIGN | `forge-30` | 30-Day Forge | 3, 9, 30 (Enōmotarchēs) |
| CAMPAIGN | `discipline-60` | 60-Day Discipline | 3, 9, 30, 60 (Pentēkontēr) |
| CAMPAIGN | `transformation-90` | 90-Day Transformation | 3, 9, 30, 60, 90 (Lochagos) |
| CAMPAIGN | `legacy-300` | 300-Day Legacy | 3, 9, 30, 60, 90, 300 (Polemarchos) |

Every plan is selectable by anyone. `recommendPlan()` marks one card "Recommended for you" only after the readiness
questions are answered. A beginner on 90 days gets beginner sessions: horizon never sets intensity.

## Day credit (eligibility)

A program day is credited when a workout matches the **planned session for the next program day**
(`allowedActivityTypes` + at least half the planned minutes, ≥ 5 min; planned recovery needs only a check-in).

- At most **one credit per journey per local date**, and dates must be strictly after the last credited date
  (travelling west or DST can't re-open an earlier date). Extra workouts that day can only earn side quests.
- Skipped days earn nothing and cost nothing; the plan simply waits. "Reschedule from today" re-projects the remaining dates.
- Paused journeys earn no credit. Resume re-projects the remaining days from today, so the forecast finish moves instead.
- Credits, XP and weekly-consistency awards are computed only in `complete_workout` (server), idempotent per workout key.

## Extension and plan changes

- `extend_journey(key, confirmed)` grows the horizon of the latest journey (also after completion). Shortening, the same
  horizon, a paused journey and an unconfirmed request are refused with explicit codes
  (`shortening_not_supported`, `same_horizon`, `resume_before_extending`, `confirmation_required`).
- Finish Day 9, extend to 30 → next is Day 10. Early extension (Day 5: 9 → 90) works the same way.
- `update_journey_plan(inputs | null, reason)` changes availability, sport days, equipment, limitations or event date;
  `null` only re-projects dates.
- Every change writes a `journey_plan_changes` row (`created`, `migrated`, `extended`, `plan_adjusted`, `rescheduled`,
  `paused`, `resumed`) with old/new horizon, effective program day/date and generation numbers.
- **Future-only regeneration.** Rows in `planned_sessions` are never edited: a regeneration marks rows after the last
  credited day `superseded_at` and inserts a new generation. A trigger refuses edits, deletes, and superseding a
  credited day. Workouts, ledgers, measurements, rewards and ranks are never touched by plan changes.

## Programming (deterministic MVP)

Implemented twice on purpose — `packages/campaigns/src/programming.ts` (previews, demo, tests) and
`internal.generate_sessions` (authoritative) — with a parity test over 9 fixtures / ~780 sessions in `pnpm db:test`.
Integer arithmetic only.

- **Phases:** 3/9 days are preparation only. 30 = preparation → base. 60 = preparation → base → build.
  90 = preparation → base → build, plus taper (`peak`) → `event` → `transition` around an optional event date.
  300 = preparation → base → build → transition (2 weeks) → build. Deload every 4th week in base/build (−30%).
- **Daily slot:** Day 1 orientation, Day 3 readiness check, rank-gate days are trial days, the day before a gate is a
  rehearsal. Otherwise: fixed sport day → `sport` (hard); day after a sport day → recovery; non-training weekday →
  recovery; else the focus rotation (strength / Zone 2 / mobility / tempo).
- **Safety:** at least one rest weekday (≤ 6 training days), ≤ 4 sport days, max session 10–180 min. `tempo` (the only
  planned hard training) appears at most once per rotation, only in build/peak, never in a deload, never for new or
  returning athletes or anyone with a limitation, and never the day before a sport day. No session text asks for
  maximal effort; trials compare against the athlete's own baseline.
- **Personalization:** experience sets base minutes (20/25/35/45), equipment and limitations choose exercise variants
  (e.g. box squat, incline push-up, dead bug), recovery style toggles active-recovery side quests.
- AI-generated suggestions are **not** implemented (planned as an opt-in, human-reviewable layer).

## Checkpoints and trials

- Day 3: readiness review (`record_checkpoint_assessment`) — energy, soreness, confidence, schedule fit. No XP, no rank.
- Day 9/30/60/90/300: promotion trials reuse the existing challenge machinery (`user_challenges` linked to a rank,
  `challenge_attempts` with evidence type, timestamps, outcome). Goals are set before an attempt; failures are retryable
  and never remove XP. No weigh-ins or body-fat targets.
- Evidence: Day 90 needs `device_recorded`, Day 300 `admin_reviewed`. The app currently produces `self_reported`
  (plus `admin_reviewed` via the plausibility review path), so Lochagos/Polemarchos promotions wait for health import /
  coach review. The UI says so.

## Migration of existing players

`20261109001000_journey_functions.sql` backfills every pre-existing `user_campaigns` row: plan inputs derived from the
old preferences, the **original nine-day content** copied into `planned_sessions` (credited days keep their dates),
`campaign_day_records.eligibility_reason = 'legacy'`, and a `migrated` plan-change row. No ledger rows are written, so
no XP repeats. `create_campaign_enrollment` keeps working for old app builds and uses the same legacy content.

## Analytics

`plan_viewed`, `plan_selected`, `journey_started`, `day_credited`, `journey_extended`, `trial_attempted`,
`rank_unlocked` — opt-in only (`analytics` consent), identifiers only (no measurements, notes or goals), and
`day_credited` / `rank_unlocked` are derived from server-confirmed rewards. No vendor SDK is wired yet: events go to a
pluggable sink (dev console). Server-side, the same moments are written to `audit_events`.
