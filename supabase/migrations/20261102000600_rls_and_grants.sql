-- Row-level security + least-privilege grants.
-- Pattern: authenticated users may SELECT their own rows; every state-changing path goes through SECURITY DEFINER RPCs.

-- 1. Lock everything down first, then open what is intended.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- 2. Reference data: readable by signed-in users only.
do $$ declare t text; begin
  foreach t in array array['game_rule_versions','rank_definitions','rank_requirements','campaign_templates','campaign_day_templates',
    'quest_templates','exercise_catalog','workout_templates','workout_template_items','achievement_definitions','cosmetic_items',
    'challenge_templates','feature_flags'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- 3. Private per-user tables: SELECT own rows only. No direct INSERT/UPDATE/DELETE (RPC-only).
do $$ declare t text; begin
  foreach t in array array['user_campaigns','workout_sessions','body_measurements','personal_records','stoic_reflections',
    'xp_ledger','coin_ledger','user_rank_history','user_achievements','user_inventory','user_challenges','challenge_attempts','user_consents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', t || '_own_read', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Tables owned via a parent row.
alter table public.campaign_day_records enable row level security;
create policy campaign_day_records_own_read on public.campaign_day_records for select to authenticated
  using (exists (select 1 from public.user_campaigns c where c.id = campaign_id and c.user_id = auth.uid()));
grant select on public.campaign_day_records to authenticated;

alter table public.workout_exercise_sets enable row level security;
create policy workout_exercise_sets_own_read on public.workout_exercise_sets for select to authenticated
  using (exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = auth.uid()));
grant select on public.workout_exercise_sets to authenticated;

alter table public.challenge_evidence enable row level security;
create policy challenge_evidence_own_read on public.challenge_evidence for select to authenticated
  using (exists (select 1 from public.challenge_attempts a where a.id = attempt_id and a.user_id = auth.uid()));
grant select on public.challenge_evidence to authenticated;

-- 4. Profile: read own; may edit cosmetic identity fields only (never xp, level, coins, rank, is_demo).
alter table public.profiles enable row level security;
create policy profiles_own_read on public.profiles for select to authenticated using (user_id = auth.uid());
create policy profiles_own_update on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select on public.profiles to authenticated;
grant update (display_name, avatar_id) on public.profiles to authenticated;

-- 5. Settings, push tokens and loadout: user-owned and user-writable (no game authority in these).
alter table public.user_settings enable row level security;
create policy user_settings_own on public.user_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select on public.user_settings to authenticated;
grant update (timezone, unit_system, profile_visibility, quiet_hours_start, quiet_hours_end, sound_enabled, haptics_enabled) on public.user_settings to authenticated;
-- notifications_enabled / social_sharing_enabled / analytics_opt_in change only via record_consent().

alter table public.device_push_tokens enable row level security;
create policy device_push_tokens_own on public.device_push_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.device_push_tokens to authenticated;

alter table public.user_avatar_loadout enable row level security;
create policy user_avatar_loadout_own on public.user_avatar_loadout for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.user_avatar_loadout to authenticated;  -- FK to user_inventory prevents equipping unowned items

alter table public.entitlements enable row level security;
create policy entitlements_own_read on public.entitlements for select to authenticated using (user_id = auth.uid());
grant select on public.entitlements to authenticated;

-- 6. Server-only: audit trail and app config (RLS on, no policies => no client access).
alter table public.audit_events enable row level security;
alter table public.app_config enable row level security;

-- 7. RPC surface: only these are callable by signed-in users.
grant execute on function
  public.create_player_profile(text,text,text,text,text,text,text[]),
  public.record_consent(text,text,boolean),
  public.create_campaign_enrollment(text,jsonb,jsonb),
  public.set_campaign_paused(boolean),
  public.complete_workout(uuid,text,timestamptz,int,numeric,int,text,date,text),
  public.record_stoic_reflection(date,text,text),
  public.record_measurement(text,numeric,text,text,timestamptz),
  public.create_personal_challenge(text,text,text,numeric,numeric,text,date,text,text,text),
  public.submit_challenge_attempt(uuid,numeric,text,uuid),
  public.verify_challenge_attempt(uuid,text,text),
  public.retry_challenge(uuid),
  public.evaluate_promotion_eligibility(text),
  public.claim_promotion(text,uuid),
  public.get_command_center(date),
  public.export_my_data()
to authenticated;
