# Edge Functions

Phase 0/1 does not need any. Every server-authoritative mutation (XP, ranks, trials, verification) is a
`SECURITY DEFINER` Postgres function called through `supabase.rpc()` — see
`supabase/migrations/20261102000500_game_functions.sql`. Keeping the rules in one transaction boundary is what makes
replay-safety and concurrent-claim-safety testable (`pnpm db:test`).

Add Edge Functions here only for things Postgres can't do: push-notification fan-out, account deletion
(needs the auth admin API + service role key), HealthKit/Health Connect webhook ingestion (Phase 4).
