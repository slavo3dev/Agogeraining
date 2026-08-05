# Data model

Source: `supabase/migrations/`. Timestamps are UTC; `local_day` + `timezone` stored beside them.

| Migration | Contents |
|---|---|
| `…000100_identity_and_rules` | `profiles` (cached rank/level/xp/coins; xp-monotonic trigger), `user_settings`, `user_consents`, `device_push_tokens`, `game_rule_versions`, `rank_definitions`, `rank_requirements`, `audit_events`, `feature_flags`, `app_config`, `entitlements` |
| `…000200_campaigns_and_training` | `campaign_templates`, `campaign_day_templates`, `quest_templates`, `user_campaigns` (one open per user), `campaign_day_records` (unique per campaign/day and campaign/date), `exercise_catalog`, `workout_templates(+items)`, `workout_sessions`, `workout_exercise_sets`, `body_measurements`, `personal_records`, `stoic_reflections` |
| `…000300_ledgers_and_challenges` | `xp_ledger`, `coin_ledger` (append-only triggers), `user_rank_history`, achievements, cosmetics/inventory/loadout, `challenge_templates`, `user_challenges`, `challenge_attempts`, `challenge_evidence` |
| `…000400_reference_data` | **Generated.** Rules v1, ranks, requirements, 9-day campaign, exercises, quest/challenge templates, cosmetics, flags |
| `…000500_game_functions` | All server-authoritative RPCs (see below) |
| `…000600_rls_and_grants` | RLS, least-privilege grants, RPC execute grants |
| `…000700_storage` | Private `private-evidence` bucket, owner-only policies (skipped where `storage` is absent) |
| `20261109000800_journeys_schema` | `sport` activity type; `campaign_templates` + tier/version/description; `user_campaigns` + timezone, start_date, plan_inputs, goal_snapshot, generation_version; `campaign_day_records` + eligibility_reason, planned_session_id; new `session_archetypes`, `planned_sessions` (immutable, versioned), `journey_plan_changes`, `player_goals`, `journey_assessments` |
| `20261109000900_journey_reference_data` | **Generated.** Six plan templates, session library, journey achievements, feature flag |
| `20261109001000_journey_functions` | Generator (`internal.generate_sessions`), journey RPCs, rewritten `complete_workout` / `get_command_center` / `export_my_data`, legacy backfill, RLS + grants |

Naming: the spec's *player_journeys* is `user_campaigns`, *plan_templates* is `campaign_templates`, *journey_days* (credited)
is `campaign_day_records`, *training_plans/weeks/sessions* is `planned_sessions` (week + phase columns), *promotion_trials*
are `user_challenges` linked to a rank with `challenge_attempts`.

## RPC surface (`authenticated` only)
`create_player_profile`, `record_consent`, `create_campaign_enrollment` (legacy), `create_journey`, `preview_journey`,
`extend_journey`, `update_journey_plan`, `add_player_goal`, `set_goal_status`, `record_checkpoint_assessment`,
`set_campaign_paused`, `complete_workout`,
`record_stoic_reflection`, `record_measurement`, `create_personal_challenge`, `submit_challenge_attempt`, `retry_challenge`,
`verify_challenge_attempt` (admin JWT claim), `evaluate_promotion_eligibility`, `claim_promotion`, `get_command_center`, `export_my_data`.
Everything in schema `internal` (e.g. `award_xp`) is unreachable from clients.

## Access model
- Reference tables: `SELECT` for signed-in users. `anon`: nothing.
- Private tables: `SELECT … WHERE user_id = auth.uid()`; **no client writes**.
- `profiles`: client may update only `display_name`, `avatar_id`. `user_settings`: only cosmetic/behaviour columns; consent-backed switches change via `record_consent`.
- `audit_events`, `app_config`: RLS on, no client policy.

## Not built yet (vs. the master prompt)
`level_definitions` (levels are formula-driven from the rules JSON), `user_daily_quests` (derived instead), all community tables
(`friend_*`, `squads*`, `feed_*`, `weekly_*_scores`, `group_*`, `user_reports`, `moderation_actions`, `notifications`) — Phase 3.
`personal_records` exists but nothing writes it yet.
