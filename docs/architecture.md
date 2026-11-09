# Architecture

Modular monolith. No microservices, no custom API server.

```
Expo iOS/Android ─┐
Next.js web ──────┴─► Supabase Auth
       │                  │ JWT
       ▼                  ▼
  supabase.rpc() ──► PostgreSQL: RLS + SECURITY DEFINER game functions (one transaction each)
       │                  │
       │                  └─► append-only xp_ledger / coin_ledger, campaign + trial + rank state, audit_events
       ▼
  TanStack Query cache ◄── authoritative player state + newRewards[] (animations are client-only presentation)
```

## Rules of the road

1. **The client never decides outcomes.** XP, coins, ranks, campaign-day qualification and trial verdicts are written only
   by `SECURITY DEFINER` functions that derive the actor from `auth.uid()`. Authenticated users have `SELECT` on their own
   rows and **no** `INSERT/UPDATE/DELETE` on game tables (verified by `scripts/test-migrations.sh`).
2. **Serialisation.** Every mutation first locks the caller's `profiles` row (`FOR UPDATE`). Two simultaneous
   `claim_promotion` calls therefore queue; the second sees the history row and returns `duplicate: true`.
3. **Idempotency.** `workout_sessions (user_id, origin, external_id)`, `xp_ledger (user_id, source_type, source_id, rule_version)`,
   `challenge_attempts (challenge_id, idempotency_key)`, `user_rank_history (user_id, rank_key)` are all unique. Source ids are
   deterministic (e.g. `md5(campaign:day:side:idx)`), so retries can't mint new ones.
4. **One source of truth for balance.** Rules live in `packages/game-engine` (`RULES_V1`, `RANK_REQUIREMENTS_V1`). A generator emits
   the SQL reference-data migration; the DB test asserts DB rules == TS rules and the level curve matches for levels 1–100.
5. **Pure domain packages.** `game-engine`, `campaigns`, `challenges`, `training`, `community` have no I/O, are unit-tested, and
   take an injectable `Clock` where time matters. The app uses them for UI previews; the database re-implements the decisions authoritatively.
6. **Time.** Instants are stored in UTC. The local calendar day and timezone are stored separately (`local_day`, `timezone`) and
   computed per instant with IANA zones, so DST and travel can't drop or duplicate a day. Servers accept only *today or yesterday*
   local days. The only clock seam is `internal.clock_now()`, which reads a **server-only** `app_config` row (tests/dev).
7. **Offline.** Workouts are written to an on-device draft queue first (`drafts-core.ts`), then synced with an idempotency key. Drafts
   are removed only after the server accepts them; permanent rejections are kept and shown, never silently dropped.

## Clients: mobile + web on one shared core

```
apps/mobile (Expo Router, React Native)   apps/web (Next.js App Router, React DOM)
        │  screens + native components            │  screens + HTML/CSS components
        └──────────────┬──────────────────────────┘
                       ▼
            packages/app-core  ← configurePlatform({ storage, supabase, randomUUID, … })
   GameApi (remote | demo) · session/rewards stores · draft queue · React Query hooks · analytics · labels · dates
                       ▼
   domain packages: game-engine · campaigns · challenges · training · shared-types · design-tokens
```

- **`packages/app-core`** holds everything both apps need that isn't UI: the `GameApi` contract with its `remote`
  (Supabase RPC/RLS reads) and `demo` (local simulation, dev only) implementations, Zustand stores (session, reward queue),
  the offline draft queue, TanStack Query hooks (`useCommandCenter`, `useJourneyPlan`), opt-in analytics, Stoic prompts and
  display labels. It has no React Native or DOM imports.
- **Platform adapters.** Each app calls `configurePlatform` once before rendering (`apps/mobile/src/platform.ts`,
  `apps/web/src/platform.ts`): mobile passes AsyncStorage, a Supabase client whose session lives in the Keychain/Keystore
  (`expo-secure-store`) and `expo-crypto`; web passes `localStorage`, a browser Supabase client and `crypto.randomUUID`.
- **UI is per platform on purpose.** Mobile uses React Native components; web uses semantic HTML and CSS variables generated
  from `@agogeraining/design-tokens`. Component names and props match (`SpartanCard`, `PlanCards`, `SessionRow`, …) so a
  screen reads the same in both apps.
- **Mobile:** Expo SDK 58, RN 0.88, Expo Router, Reanimated (XP bar, reward modal; respects reduced motion), `react-native-svg`.
- **Web:** Next.js 16 App Router. Every screen is a client component (auth and data are per-user and live in the browser);
  the root gate in `app/providers.tsx` applies the same signed-out → welcome → onboarding → app routing as the mobile layout.
  Five tabs: top bar on desktop, bottom bar on phones.
- Both: TanStack Query (server state), Zustand, React Hook Form + Zod (forms).

## Deliberate gaps

Realtime Broadcast, Edge Functions, the admin console and community tables are **not built**. The web app has no server-side
rendering of player data (no Supabase SSR cookies) — it isn't needed while every screen is per-user. Per-user quests are materialised as
versioned `planned_sessions` (Choose Your Journey); the schedule generator exists in TypeScript and SQL with a parity test,
the same pattern as the level curve. See [journeys.md](journeys.md).
