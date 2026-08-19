# Privacy & security

## Principles implemented
- **Private by default.** Measurements, journal, notes, evidence and rank data are visible only to their owner (RLS `user_id = auth.uid()`).
  Social sharing and notifications are off unless the player opts in; consent is recorded (`user_consents`) and revocable.
- **No client authority over the game.** No client write path to XP, coins, ranks, ledgers, verification or audit tables; internal functions are unreachable.
- **Secrets.** Only the public anon key ships in the app; `SUPABASE_SERVICE_ROLE_KEY` is server-only. Auth tokens are kept in the OS keychain/keystore (`expo-secure-store`, chunked).
- **Evidence honesty.** Every result carries an evidence level; MVP results are `self_reported` and labelled so. No claim of fraud-proof verification. Suspicious results go to review, not public accusation.
- **No health data in analytics/logs.** The app has no analytics SDK and logs no health values, JWTs, routes or journal text. If analytics are added they must be opt-in and exclude measurement content (event list in the master spec §14).
- **Health permissions at point of use.** None requested today. HealthKit/Health Connect adapters are `planned` stubs.
- **Data portability.** `export_my_data()` (Profile → Export). **Deletion:** deleting the `auth.users` row cascades through every user table (tested, including the append-only ledgers); a self-serve flow needs an Edge Function with the service role and is **not built**.
- **Storage.** Private bucket, owner-folder policies, 10 MB limit, jpeg/png/mp4 only. No evidence upload UI yet.
- **Abuse limits.** ≤30 workouts per rolling day, ≤20 open challenges, workouts only for today/yesterday, plausibility bounds on measurements, per-user mutation serialisation. Network-level rate limiting for auth is Supabase's; add edge rate limits before public launch.

## Before any public/store release (not done)
- [ ] Privacy policy + terms URLs; App Store *App Privacy* labels; Google Play *Data Safety* form
- [ ] Review Apple guidelines for health apps / UGC (UGC only matters once Phalanx ships) and Google Health Connect policy (only if adopted)
- [ ] Self-serve account deletion (Apple requires in-app deletion for apps with accounts)
- [ ] Trademark review of "Spartan Levels" and an art/IP check (all art here is original SVG; no Solo Leveling or Spartan Race assets)
- [ ] Penetration/RLS review by a second pair of eyes; enable email confirmation + leaked-password protection in Supabase
- [ ] Fitness disclaimer reviewed by counsel; adults-only age gating beyond self-reported band
- [ ] Moderation, report/block, audit tooling **before** any social feature (Phase 3 gate)
- [ ] Law review: GDPR/CCPA, and health-data statutes (e.g. WA My Health My Data) for the markets you launch in

Not medical advice: onboarding, quests and settings repeat that guidance is general fitness coaching and to seek professional assessment for injuries or concerning symptoms.
