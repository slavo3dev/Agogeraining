# Test plan and honest verification status

## Commands
```bash
pnpm test                 # vitest, all packages + mobile (offline draft queue)
pnpm typecheck            # tsc strict (TypeScript 6.0.3), all packages + mobile
pnpm check:reference      # generated SQL is current
pnpm db:test              # throwaway Postgres: every migration + 81 integration assertions
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

Total at last run: 75 unit tests (68 packages + 7 mobile) and 81 DB integration assertions, all passing.

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
