# Test plan and honest verification status

## Commands
```bash
pnpm test                 # vitest, all packages + mobile (offline draft queue)
pnpm typecheck            # tsc strict (TypeScript 6.0.3), all packages + mobile
pnpm check:reference      # generated SQL is current
pnpm db:test              # throwaway Postgres: every migration + 154 integration assertions (incl. legacy backfill + generator parity)
pnpm --filter @agogeraining/mobile export:check   # Metro bundles iOS + Android
```

## Verified (run during development)
| Spec test case | Evidence |
|---|---|
| 1 XP monotonic, level boundaries | `game-engine` tests (every level 2–100 at/below threshold); DB trigger refuses XP decrease |
| 2 Replay awards once | DB: replaying a workout/attempt/claim → `duplicate`, XP unchanged; unique ledger key refuses duplicates |
| 3 Rank rejects missing days/XP/unverified trial | engine + DB (`promotion_not_eligible`, `not_next_rank`) |
| 4 Concurrent promotion idempotency | DB: two simultaneous sessions → 1 history row, XP +500 once, one `duplicate:true` |
| 5 Missed days don't reset; recovery counts | `campaigns` tests; DB 9-day journey includes recovery days |
| 6 Timezone/DST boundaries | `campaigns` tests (NY fall-back 25h day, spring-forward, travel NY→Tokyo) |
| 7 Unit normalisation | `training` + `game-engine` tests (mi/km, lb/kg, time); DB stores lb→kg |
| 8 Other user can't read private data | DB: user B sees 0 rows in 10 private tables; cannot update/insert game tables; anon blocked |
| 10 Offline drafts reconcile without double award | `drafts-core` tests (offline→sync, duplicate, rejected retained, concurrent flush) |
| — TS rules == DB rules; level curve parity 1–100 | `db:test` |
| — App compiles and bundles | `typecheck`, `export:check` (iOS + Android Hermes bundles), `expo-doctor` clean except TypeScript (now aligned) |

Total at last run (2026-11-09): **111 unit tests** (101 packages + 10 mobile) and **154 DB integration assertions**, all passing;
`check:reference` clean; `export:check` produced iOS + Android Hermes bundles.

## Choose Your Journey — acceptance tests
| Acceptance test | Evidence |
|---|---|
| 3-Day Initiation: three eligible dates, assessment + extend offer, **no promotion** | DB (`== Choose Your Journey`): completed, rank stays `agoge_trainee`, `pendingReviews=[3]`, review saved, extend 3→9 resumes at Day 4; pure test in `campaigns` |
| 9-Day Agōgē → verified trial → Hoplitēs; failed trial never grants rank | DB: player D fails (no rank, claim refused), retries, passes, claims Hoplitēs |
| 90-Day chosen directly: Day 1/90, checkpoints 3/9/30/60/90, personalized sessions | DB: 90 sessions, checkpoints 3,9,30,60,90, command center `1/90`; web E2E screenshots |
| Day 9 → extend to 30/90: next is Day 10; workouts, XP, measurements, rewards, rank intact | DB: 9→90 next day — XP, workout count, rank unchanged, Days 1–9 sessions byte-identical (md5), Day 10 credited next |
| 3→9 and 30→300 allowed; shortening/dangerous changes refused with confirmation | DB: `shortening_not_supported`, `same_horizon`, `confirmation_required`, rest-day / sport-day limits; `campaigns` tests |
| Recovery once; extra same-date workouts add nothing; skips add nothing | DB + `campaigns` tests |
| Timezone/DST: no double credit or skipped day; pause/resume/travel deterministic | DB: Tokyo date then NY earlier date refused; pause blocks credit, resume re-projects Day 13 to today; `campaigns` DST tests |
| Thursday soccer change regenerates only the future | DB: completed sessions + workouts md5-identical, future sport days all Tuesday, 78 rows superseded (not deleted), history row with reason |
| Existing partial 9-day user migrated without lost history or repeated XP | DB: migrations applied in two stages around a mid-campaign player — XP and ledger row count unchanged, credited dates kept, original Day 4 content, continues at Day 4 |
| RLS blocks other players' journey data | DB: 0 rows of others in `planned_sessions`, `journey_plan_changes`, `player_goals`, `journey_assessments`; no client writes; internals unreachable |
| Offline entry syncs without duplicate XP/credits | Unchanged idempotent `complete_workout` (replay test) + `drafts-core` tests |
| TS generator == SQL generator | DB: parity over 9 fixtures / 779 sessions covering every phase and session type (a 1-minute drift fails it) |
| First working milestone (choose plan → Day 1 → real quest → XP persists → correct display after restart) | Web E2E in demo mode (below) and DB command-center checks |

### Web end-to-end run (demo mode, headless Chrome, 390×844)
`EXPO_PUBLIC_ENABLE_DEMO_MODE=true npx expo start --web`, then a Playwright script drove: onboarding → readiness →
Thursday soccer → Choose Your Journey (recommended marker) → 90-Day → goal → preview → Begin → log Day 1 walk (+60 XP) →
reload ("restart") → Day 2 recovery check-in → Day 3 readiness checkpoint + review (rank unchanged) → My Journey → extend
preview to 300 → Quests plan. 14/14 steps, no runtime errors. The script is not committed (it needs `playwright-core`, which
isn't a repo dependency yet).

Not verified for journeys: native iOS/Android runtime, the remote API against a real Supabase/PostgREST stack, and
Day 90/300 promotions (blocked on evidence types the app can't produce yet).

## NOT verified — be skeptical of these
- **Running on a simulator, emulator or physical device.** Nothing in this repo has been launched visually. Expect first-run
  issues (Expo Go vs dev-build native module support, layout polish, navigation edge cases). Case 11 (the full journey on device) is open.
- **The app against a real Supabase stack.** The SQL is proven on plain Postgres 17 with stubbed `auth`/roles; `supabase/config.toml`
  and the remote API layer (`services/api/remote.ts`, PostgREST embed in `listChallenges`) have not been exercised against the CLI/PostgREST.
- **Auth flows** (sign-up, email verification, password reset) — written, untested. Apple/Google sign-in: not offered.
- **Case 9** (permissions denied never block workouts): trivially true today (no permissions are requested), but no test.
- **Case 12** accessibility: labels/roles/reduced-motion are implemented and token contrast is tested; no VoiceOver/TalkBack/Dynamic Type pass.
- **Component and E2E tests**: none yet (planned: React Native Testing Library, Maestro).
- **Lint/format**: no ESLint/Prettier configured yet (typecheck only).
- **CI workflow** (`.github/workflows/ci.yml`) has never run.
- Storage policies (`…000700`) are skipped locally because there is no `storage` schema; untested.

## Manual smoke test (first device run)
1. Fresh install → sign up (or demo) → onboarding → land on Command Center at Day 1.
2. Log a 12-min walk → reward modal, XP/level persist after killing and relaunching the app.
3. Airplane mode → log a workout → "saved on device" banner → reconnect → syncs once.
4. Step through Days 2–8 (demo: Profile → Advance demo day), including two recovery days.
5. Day 9: create a trial (beat your baseline) → submit → pass → claim Hoplitēs → crest/cloak and rank emblem update.
6. Second account cannot see the first's measurements (remote mode).
