# Roadmap

Phases are deliverables, not dates. Migrations stay backward compatible; unreleased features are flagged (`feature_flags`).

| Phase | Scope | State |
|---|---|---|
| 0 Foundation | Monorepo, Expo app, tokens, tabs, auth, Supabase pipeline, onboarding, labelled demo | built; device run unverified |
| 1 9-Day Agōgē MVP | Campaign, quests, workouts, XP/coins/levels, trials, Day-9 Hoplitēs, body progress, reflection, RLS/replay/timezone tests | built; see test plan for gaps |
| 2 Choose Your Journey | 3/9/30/60/90/300 plans, preview, personalized deterministic schedule, extension, pause/reschedule, checkpoints, goals | **built** (device run unverified) |
| 2b Journey depth | Admin template editing, device/coach evidence for Day 90/300, AI plan suggestions (opt-in, reviewable), personal-record XP | planned |
| 3 Phalanx | Friends, squads, shared achievements, weekly capped score, moderation/block/report, Broadcast, notifications | planned — **blocked until safety controls work** |
| 4 Integrations | HealthKit, Health Connect, consented routes, dedupe, offline sync hardening | planned |
| 5 Live game | Seasons, events, skill trees, coach mode, AI plan suggestions with safety constraints, web, premium | planned |

## Next executable tasks
1. Run on iOS simulator + Android emulator against `supabase start`; fix whatever surfaces (see test plan). The journey flow
   is already driven end-to-end on the web build (demo mode).
2. Add component tests (React Native Testing Library) and Maestro flow for onboarding → Day 1.
3. Self-serve account deletion (Edge Function with service role) and a privacy policy URL — required before TestFlight external testing.
4. Push notification opt-in flow (Expo Notifications) with quiet hours.
5. Personal-record detection → `personal_record` XP.
