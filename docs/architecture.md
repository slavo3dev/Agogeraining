# Architecture

Modular monolith. No microservices, no custom API server.

```
Expo iOS/Android ──► Supabase Auth
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

## Mobile

Expo SDK 58, RN 0.88, Expo Router, TanStack Query (server state), Zustand (session/prefs/reward queue), React Hook Form + Zod
(forms), Reanimated (XP bar, reward modal; respects reduced motion), `react-native-svg` (emblem, chart).
`services/api` exposes one `GameApi` contract with two implementations: `remote` (Supabase RPC/RLS reads) and `demo`
(on-device simulation, dev builds only).

## Deliberate gaps

Realtime Broadcast, Edge Functions, admin web, community tables, and `user_daily_quests` rows are **not built**. Quests are
derived from `campaign_day_templates` + `campaign_day_records` instead of materialised per user — simpler and sufficient until
per-user plan adaptation (Phase 2) needs stored assignments.
