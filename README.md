# Agogeraining — Spartan Levels

> **Train in the real world. Level up in the game.**
> Consistency earns XP. Measurable, appropriate progress unlocks rank. Recovery counts as responsible training.

A real-world fitness RPG for iOS and Android. *Spartan Levels* is a **working title pending trademark review**
(one token: `BRAND` in `packages/design-tokens`). This repo root **is** the monorepo.

## Status

| Area | Status |
|---|---|
| 9-day Agōgē campaign (quests, recovery days, side quests, XP/coins, levels) | **implemented** |
| Server-authoritative XP ledger, idempotency, rank promotion, trials | **implemented** (Postgres, tested) |
| Manual workout logging with offline drafts | **implemented** |
| Personal challenges + self-reported trials, admin review path | **implemented** |
| Body measurements + trend chart, Stoic reflection | **implemented** |
| Email/password auth, onboarding, 5-tab app, dark/light, reduced motion | **implemented** |
| Local demo mode (dev builds only, labelled) | **implemented** |
| Day 30/60/90/300 segments | planned (Phase 2 — rank gates + rules already versioned) |
| Phalanx social | planned (Phase 3 — UI is an honest gate, not a fake feed) |
| HealthKit / Health Connect | planned (Phase 4 — provider interfaces exist) |
| Apple/Google sign-in, push notifications, admin web | planned |
| Run on a simulator/emulator/device | **not yet verified** — see [docs/test-plan.md](docs/test-plan.md) |

## Prerequisites

- Node 22+ (developed on 24), **pnpm 12** (`corepack enable` or `npm i -g pnpm`)
- iOS: macOS + Xcode (simulator). Android: Android Studio + an emulator
- Backend (pick one): Docker + [Supabase CLI](https://supabase.com/docs/guides/cli) **or** use the local demo mode (no backend)
- For `pnpm db:test`: PostgreSQL 15+ binaries (`initdb`, `pg_ctl`, `psql`) on `PATH` — no Docker needed

## Quick start

```bash
pnpm install
pnpm test            # 8 packages, unit tests
pnpm typecheck
pnpm db:test         # applies every migration to a throwaway Postgres and runs 81 integration checks
```

### Run the app against a local backend

```bash
supabase start                              # prints API URL + anon key
cp .env.example apps/mobile/.env            # then paste the URL and anon key
pnpm db:reset                               # (re)applies migrations + seed
pnpm dev:mobile                             # Expo dev server
pnpm ios                                    # or: pnpm android
```

### Run with no backend (local demo)

Set `EXPO_PUBLIC_ENABLE_DEMO_MODE=true` in `apps/mobile/.env`, run `pnpm dev:mobile`, tap **Try local demo (dev only)**.
It is simulated on-device, visibly labelled, ignored by production builds, and has a dev-only “Advance demo day” button
so you can play all nine days. It cannot affect real accounts or leaderboards.

> `expo-secure-store` and `react-native-reanimated` need a **development build** or recent Expo Go for SDK 58.
> If Expo Go lacks something, run `npx expo run:ios` / `run:android` inside `apps/mobile`.

## Common commands

| Command | What it does |
|---|---|
| `pnpm dev:mobile` / `ios` / `android` | Start Expo / open simulator / emulator |
| `pnpm test` · `pnpm typecheck` | Unit tests · strict TypeScript across all packages |
| `pnpm db:start` · `db:reset` · `db:test` | Supabase up · reset DB · migration integration tests |
| `pnpm gen:reference` · `check:reference` | Regenerate / verify reference-data migration from TypeScript rules |
| `pnpm --filter @agogeraining/mobile export:check` | Prove the app bundles for iOS + Android |

## Reset / seed the database

`pnpm db:reset` replays all migrations and `supabase/seed.sql`. Game rules, ranks, the 9-day campaign and the exercise
catalog live in a **generated migration** (`20261102000400_reference_data.sql`); edit the TypeScript sources and run
`pnpm gen:reference`. Never edit that SQL by hand — CI fails if it drifts.

## Private beta build (TestFlight / Android internal)

1. Create a hosted Supabase project; apply migrations (`supabase link` → `supabase db push`). Turn email confirmations **on**.
2. Replace `com.example.agogeraining` (bundle id / package) in `apps/mobile/app.json` with your own.
3. `npm i -g eas-cli && cd apps/mobile && eas build:configure`
4. Set `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` as EAS env vars (never the service-role key; demo mode stays off).
5. `eas build --profile production --platform all` → `eas submit` to TestFlight / Play internal testing.
6. Before inviting people: complete the store checklist in [docs/privacy-and-security.md](docs/privacy-and-security.md)
   (privacy policy, Data Safety form, App Privacy labels, account-deletion path, trademark review).

No credentials are in this repo. `.env.example` has placeholders only.

## Layout

```
apps/mobile            Expo Router app (iOS + Android)        apps/admin   planned
packages/game-engine   XP, levels, quest rewards, rank + trial rules (pure TS, tested)
packages/campaigns     Clock, timezone-safe day logic, 9-day template
packages/challenges    Trial state machine + goal plausibility
packages/training      Units, activities, exercise catalog, import-provider boundary
packages/community     Permission rules (Phase 3, not wired to UI)
packages/shared-types  Zod API schemas + view models
packages/design-tokens Brand token, colors, contrast helpers
supabase/              migrations (schema, RLS, game functions), seed, tests
docs/                  architecture · data-model · game-rules · design-system · roadmap · privacy-and-security · test-plan
```
