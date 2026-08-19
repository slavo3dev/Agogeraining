# Admin web (planned — Phase 2)

Next.js + TypeScript behind admin-only authentication. Not scaffolded yet: nothing in the beta depends on it.

Server-side hooks already exist for it:
- `public.verify_challenge_attempt(attempt, 'accept'|'reject', reason)` — requires `app_metadata.role = 'admin'` in the JWT
  (set via the auth admin API, never by a client) and writes an audit event.
- `game_rule_versions` / `rank_requirements` are versioned; balance changes ship as a new rules version.
- `audit_events` is server-only (RLS on, no client policy).
