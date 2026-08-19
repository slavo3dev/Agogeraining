-- Server-authoritative game mutations. The client NEVER writes XP, coins, ranks or verification outcomes.
-- Public RPCs are SECURITY DEFINER, derive the actor from auth.uid(), and serialise per-user by locking the profile row.

-- =====================================================================================
-- internal helpers (schema `internal` is not exposed to the API)
-- =====================================================================================
-- Day-boundary clock. Equals now() unless a SERVER-ONLY app_config row 'demo_clock' is set (dev/test).
-- app_config has RLS enabled with no client policy, so no signed-in user can move time.
create or replace function internal.clock_now() returns timestamptz language sql stable as $$
  select coalesce((select (value #>> '{}')::timestamptz from public.app_config where key = 'demo_clock'), now())
$$;

create or replace function internal.current_rules() returns jsonb language sql stable as $$
  select rules from public.game_rule_versions where effective_at <= now() order by id desc limit 1
$$;
create or replace function internal.current_rules_version() returns int language sql stable as $$
  select id from public.game_rule_versions where effective_at <= now() order by id desc limit 1
$$;

create or replace function internal.xp_to_reach_level(p_level int, p_rules jsonb) returns bigint language sql immutable as $$
  select round(((p_rules#>>'{levels,base}')::double precision
              * power((least(greatest(p_level,1),(p_rules#>>'{levels,maxLevel}')::int) - 1)::double precision,
                      (p_rules#>>'{levels,exponent}')::double precision))::numeric)::bigint
$$;

create or replace function internal.level_for_xp(p_xp bigint, p_rules jsonb) returns int language plpgsql immutable as $$
declare l int := 1; maxl int := (p_rules#>>'{levels,maxLevel}')::int;
begin
  while l < maxl and internal.xp_to_reach_level(l + 1, p_rules) <= greatest(p_xp, 0) loop l := l + 1; end loop;
  return l;
end $$;

create or replace function internal.unit_dimension(u text) returns text language sql immutable as $$
  select case when u in ('kg','lb') then 'mass' when u in ('m','km','mi') then 'distance'
              when u in ('s','min','h') then 'time' when u = 'reps' then 'count' end
$$;
create or replace function internal.to_base(v numeric, u text) returns numeric language sql immutable as $$
  select v * case u when 'kg' then 1 when 'lb' then 0.45359237 when 'm' then 1 when 'km' then 1000
                    when 'mi' then 1609.344 when 's' then 1 when 'min' then 60 when 'h' then 3600 when 'reps' then 1 end
$$;

create or replace function internal.audit(p_actor uuid, p_type text, p_entity text, p_id text, p_payload jsonb default '{}')
returns void language sql as $$
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, payload) values (p_actor, p_type, p_entity, p_id, p_payload)
$$;

create or replace function internal.is_admin() returns boolean language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

create or replace function internal.det_uuid(p_text text) returns uuid language sql immutable as $$
  select md5(p_text)::uuid
$$;

create or replace function internal.activity_matches(p_spec jsonb, p_activity text, p_duration int) returns boolean language sql immutable as $$
  select (p_spec->'allowedActivityTypes') ? p_activity and p_duration >= coalesce((p_spec->>'minDurationSeconds')::int, 0)
$$;

create or replace function internal.player_state(p_user uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'lifetimeXp', p.lifetime_xp, 'level', p.level, 'coins', p.coins, 'rankKey', p.rank_key,
    'qualifiedDays', coalesce((select sum(qualified_days) from public.user_campaigns c where c.user_id = p.user_id), 0),
    'campaignState', coalesce((select state from public.user_campaigns c where c.user_id = p.user_id order by created_at desc limit 1), 'none'))
  from public.profiles p where p.user_id = p_user
$$;

create or replace function internal.lock_player(p_user uuid) returns void language plpgsql as $$
begin
  perform 1 from public.profiles where user_id = p_user for update;
  if not found then raise exception 'profile_required' using errcode = 'P0002'; end if;
end $$;

create or replace function internal.require_user() returns uuid language plpgsql stable as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return v;
end $$;

-- Award XP/coins exactly once per (user, source_type, source_id, rule_version). Returns what was granted.
create or replace function internal.award_xp(p_user uuid, p_source text, p_source_id uuid, p_local_day date)
returns jsonb language plpgsql as $$
declare
  rules jsonb := internal.current_rules();
  ver int := internal.current_rules_version();
  base int := (rules->'xp'->>p_source)::int;
  coin_base int := coalesce((rules->'coins'->>p_source)::int, 0);
  cap int := (rules->'xp'->>'dailyCap')::int;
  capped boolean := p_source in ('primary_quest','side_quest','reflection','personal_record');
  used int := 0; v_xp int; v_coins int; new_id bigint; old_level int; new_level int; new_xp bigint;
begin
  if base is null then raise exception 'unknown_xp_source %', p_source; end if;
  if capped then
    select coalesce(sum(xp_delta), 0) into used from public.xp_ledger
     where user_id = p_user and local_day = p_local_day and source_type in ('primary_quest','side_quest','reflection','personal_record');
    v_xp := least(base, greatest(0, cap - used));
  else
    v_xp := base;
  end if;
  v_coins := case when v_xp = 0 then 0 else coin_base end;

  insert into public.xp_ledger (user_id, source_type, source_id, rule_version, xp_delta, local_day)
  values (p_user, p_source, p_source_id, ver, v_xp, p_local_day)
  on conflict (user_id, source_type, source_id, rule_version) do nothing
  returning id into new_id;
  if new_id is null then return jsonb_build_object('awarded', false, 'xp', 0, 'coins', 0, 'levelUp', false); end if;

  insert into public.coin_ledger (user_id, source_type, source_id, rule_version, coin_delta)
  values (p_user, p_source, p_source_id, ver, v_coins) on conflict do nothing;

  select level into old_level from public.profiles where user_id = p_user;
  update public.profiles set lifetime_xp = lifetime_xp + v_xp, coins = coins + v_coins
   where user_id = p_user returning lifetime_xp into new_xp;
  new_level := internal.level_for_xp(new_xp, rules);
  update public.profiles set level = new_level where user_id = p_user;

  return jsonb_build_object('awarded', true, 'xp', v_xp, 'coins', v_coins, 'levelUp', new_level > old_level, 'newLevel', new_level);
end $$;

-- Append reward events for the client (animations are presentation only).
create or replace function internal.reward_list(p_xp int, p_coins int, p_level_up boolean, p_new_level int, p_extra jsonb default '[]')
returns jsonb language plpgsql immutable as $$
declare r jsonb := p_extra;
begin
  if p_xp > 0 then r := r || jsonb_build_array(jsonb_build_object('kind','xp','amount',p_xp,'label','+'||p_xp||' XP','accessibleText','You earned '||p_xp||' experience points.')); end if;
  if p_coins > 0 then r := r || jsonb_build_array(jsonb_build_object('kind','coins','amount',p_coins,'label','+'||p_coins||' coins','accessibleText','You earned '||p_coins||' coins.')); end if;
  if p_level_up then r := r || jsonb_build_array(jsonb_build_object('kind','level_up','amount',p_new_level,'label','Level '||p_new_level,'accessibleText','You reached level '||p_new_level||'.')); end if;
  return r;
end $$;

-- =====================================================================================
-- Profile, consent, campaign enrolment
-- =====================================================================================
create or replace function public.create_player_profile(
  p_display_name text, p_avatar_id text, p_timezone text, p_unit_system text,
  p_age_band text, p_primary_focus text, p_secondary_focuses text[] default '{}')
returns jsonb language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user();
begin
  begin perform now() at time zone p_timezone; exception when others then raise exception 'invalid_timezone'; end;
  insert into public.profiles (user_id, display_name, avatar_id, age_band, primary_focus, secondary_focuses)
  values (uid, trim(p_display_name), p_avatar_id, p_age_band, p_primary_focus, coalesce(p_secondary_focuses, '{}'))
  on conflict (user_id) do update set display_name = excluded.display_name, avatar_id = excluded.avatar_id,
    age_band = excluded.age_band, primary_focus = excluded.primary_focus, secondary_focuses = excluded.secondary_focuses;
  insert into public.user_settings (user_id, timezone, unit_system) values (uid, p_timezone, p_unit_system)
  on conflict (user_id) do update set timezone = excluded.timezone, unit_system = excluded.unit_system;
  return internal.player_state(uid);
end $$;

create or replace function public.record_consent(p_type text, p_version text, p_granted boolean)
returns void language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user();
begin
  perform internal.lock_player(uid);
  if p_granted then
    insert into public.user_consents (user_id, type, version) values (uid, p_type, p_version);
  else
    update public.user_consents set revoked_at = now() where user_id = uid and type = p_type and revoked_at is null;
  end if;
  -- mirror the switch the app reads
  if p_type = 'notifications' then update public.user_settings set notifications_enabled = p_granted where user_id = uid; end if;
  if p_type = 'social_sharing' then update public.user_settings set social_sharing_enabled = p_granted where user_id = uid; end if;
  if p_type = 'analytics' then update public.user_settings set analytics_opt_in = p_granted where user_id = uid; end if;
end $$;

create or replace function public.create_campaign_enrollment(p_template_key text, p_baseline jsonb, p_preferences jsonb)
returns jsonb language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user(); t public.campaign_templates;
begin
  perform internal.lock_player(uid);
  select * into t from public.campaign_templates where key = p_template_key and lifecycle = 'live';
  if not found then raise exception 'unknown_campaign_template'; end if;
  if exists (select 1 from public.user_campaigns where user_id = uid and state in ('active','paused')) then
    return internal.player_state(uid);   -- idempotent: already enrolled
  end if;
  insert into public.user_campaigns (user_id, template_id, baseline, preferences) values (uid, t.id, coalesce(p_baseline,'{}'), coalesce(p_preferences,'{}'));
  perform internal.audit(uid, 'campaign_enrolled', 'campaign_template', p_template_key);
  return internal.player_state(uid);
end $$;

create or replace function public.set_campaign_paused(p_paused boolean)
returns jsonb language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user();
begin
  perform internal.lock_player(uid);
  if p_paused then
    update public.user_campaigns set state = 'paused', paused_at = now() where user_id = uid and state = 'active';
  else
    update public.user_campaigns set state = 'active', paused_at = null where user_id = uid and state = 'paused';
  end if;
  return internal.player_state(uid);
end $$;

-- =====================================================================================
-- Workouts -> campaign day qualification -> XP
-- =====================================================================================
create or replace function public.complete_workout(
  p_idempotency_key uuid, p_activity_type text, p_started_at timestamptz, p_duration_seconds int,
  p_distance_m numeric, p_rpe int, p_notes text, p_local_day date, p_timezone text)
returns jsonb language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare
  uid uuid := internal.require_user();
  v_today date; v_session uuid; camp public.user_campaigns; v_rec int; v_next int; v_spec jsonb; v_total int;
  v_xp int := 0; v_coins int := 0; v_level_up boolean := false; v_new_level int; a jsonb; v_before_level int;
  v_extra jsonb := '[]'; side jsonb; idx int; v_qualified_now boolean := false; v_week int;
begin
  perform internal.lock_player(uid);
  begin v_today := (internal.clock_now() at time zone p_timezone)::date; exception when others then raise exception 'invalid_timezone'; end;
  if p_local_day > v_today or p_local_day < v_today - 1 then raise exception 'local_day_out_of_range'; end if;
  if p_started_at > internal.clock_now() + interval '5 minutes' then raise exception 'started_in_future'; end if;

  -- replay: same key => same result, no new rewards
  select id into v_session from public.workout_sessions where user_id = uid and origin = 'manual' and external_id = p_idempotency_key::text;
  if found then
    return jsonb_build_object('playerState', internal.player_state(uid), 'newRewards', '[]'::jsonb, 'duplicate', true);
  end if;
  if (select count(*) from public.workout_sessions where user_id = uid and created_at > now() - interval '1 day') >= 30 then
    raise exception 'rate_limited';
  end if;

  select level into v_before_level from public.profiles where user_id = uid;
  insert into public.workout_sessions (user_id, activity_type, started_at, local_day, timezone, duration_seconds, distance_m, rpe, notes, origin, external_id)
  values (uid, p_activity_type, p_started_at, p_local_day, p_timezone, p_duration_seconds, p_distance_m, p_rpe, p_notes, 'manual', p_idempotency_key::text)
  returning id into v_session;

  select * into camp from public.user_campaigns where user_id = uid and state = 'active';
  if found then
    select total_qualifying_days into v_total from public.campaign_templates where id = camp.template_id;
    select program_day into v_rec from public.campaign_day_records where campaign_id = camp.id and calendar_date_local = p_local_day;
    if v_rec is null then
      v_next := camp.qualified_days + 1;
      select quest_spec into v_spec from public.campaign_day_templates where template_id = camp.template_id and day_number = v_next;
      if found and internal.activity_matches(v_spec->'primary', p_activity_type, p_duration_seconds) then
        insert into public.campaign_day_records (campaign_id, program_day, calendar_date_local, timezone, qualifying_activity_id)
        values (camp.id, v_next, p_local_day, p_timezone, v_session);
        update public.user_campaigns set qualified_days = v_next, state = case when v_next >= v_total then 'completed' else 'active' end where id = camp.id;
        v_rec := v_next; v_qualified_now := true;
        a := internal.award_xp(uid, 'primary_quest', v_session, p_local_day);
        v_xp := v_xp + (a->>'xp')::int; v_coins := v_coins + (a->>'coins')::int;
        v_extra := v_extra || jsonb_build_array(jsonb_build_object('kind','campaign_day','amount',v_next,'label','Day '||v_next||' complete','accessibleText','Program day '||v_next||' of '||v_total||' complete.'));
        if v_next = 1 then insert into public.user_achievements (user_id, achievement_key) values (uid, 'first_oath') on conflict do nothing; end if;
        -- weekly consistency milestone: 5 qualified days in the same week, once per week
        select count(*) into v_week from public.campaign_day_records
         where campaign_id = camp.id and date_trunc('week', calendar_date_local::timestamp) = date_trunc('week', p_local_day::timestamp);
        if v_week >= 5 then
          a := internal.award_xp(uid, 'weekly_consistency', internal.det_uuid(camp.id::text || date_trunc('week', p_local_day::timestamp)::text), p_local_day);
          v_xp := v_xp + (a->>'xp')::int; v_coins := v_coins + (a->>'coins')::int;
        end if;
      end if;
    end if;

    -- side quests for the program day recorded on this local date (not by the session that just qualified the primary)
    if v_rec is not null and not v_qualified_now then
      select quest_spec into v_spec from public.campaign_day_templates where template_id = camp.template_id and day_number = v_rec;
      idx := 0;
      for side in select * from jsonb_array_elements(coalesce(v_spec->'side', '[]')) loop
        if side->>'type' <> 'reflection' and internal.activity_matches(side, p_activity_type, p_duration_seconds) then
          a := internal.award_xp(uid, 'side_quest', internal.det_uuid(camp.id::text || ':' || v_rec || ':side:' || idx), p_local_day);
          v_xp := v_xp + (a->>'xp')::int; v_coins := v_coins + (a->>'coins')::int;
        end if;
        idx := idx + 1;
      end loop;
    end if;
  end if;

  select level into v_new_level from public.profiles where user_id = uid;
  v_level_up := v_new_level > v_before_level;
  return jsonb_build_object('playerState', internal.player_state(uid),
    'newRewards', internal.reward_list(v_xp, v_coins, v_level_up, v_new_level, v_extra), 'duplicate', false);
end $$;

-- =====================================================================================
-- Reflection, measurements
-- =====================================================================================
create or replace function public.record_stoic_reflection(p_local_date date, p_prompt_key text, p_text text)
returns jsonb language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user(); tz text; v_today date; a jsonb; before_level int; after_level int;
begin
  perform internal.lock_player(uid);
  select timezone into tz from public.user_settings where user_id = uid;
  v_today := (internal.clock_now() at time zone coalesce(tz,'UTC'))::date;
  if p_local_date > v_today or p_local_date < v_today - 1 then raise exception 'local_day_out_of_range'; end if;
  select level into before_level from public.profiles where user_id = uid;
  insert into public.stoic_reflections (user_id, local_date, prompt_key, body) values (uid, p_local_date, p_prompt_key, p_text)
  on conflict (user_id, local_date) do update set body = excluded.body, prompt_key = excluded.prompt_key;
  a := internal.award_xp(uid, 'reflection', internal.det_uuid(uid::text || ':reflection:' || p_local_date), p_local_date);
  select level into after_level from public.profiles where user_id = uid;
  return jsonb_build_object('playerState', internal.player_state(uid),
    'newRewards', internal.reward_list((a->>'xp')::int, (a->>'coins')::int, after_level > before_level, after_level), 'duplicate', not (a->>'awarded')::boolean);
end $$;

create or replace function public.record_measurement(p_metric text, p_value numeric, p_unit text, p_method text, p_measured_at timestamptz)
returns uuid language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user(); v numeric; u text; new_id uuid;
begin
  perform internal.lock_player(uid);
  if p_measured_at > internal.clock_now() + interval '5 minutes' then raise exception 'measured_in_future'; end if;
  -- normalise to canonical units: kg, cm, percent, reps
  case p_unit
    when 'kg' then v := p_value; u := 'kg';
    when 'lb' then v := p_value * 0.45359237; u := 'kg';
    when 'cm' then v := p_value; u := 'cm';
    when 'in' then v := p_value * 2.54; u := 'cm';
    when 'percent' then v := p_value; u := 'percent';
    when 'reps' then v := p_value; u := 'reps';
    else raise exception 'invalid_unit';
  end case;
  if (p_metric = 'weight' and (v < 20 or v > 400)) or (p_metric = 'body_fat' and (v < 2 or v > 70))
     or (p_metric = 'waist' and (v < 30 or v > 250)) then raise exception 'implausible_value'; end if;
  insert into public.body_measurements (user_id, measured_at, metric_type, value, unit, method)
  values (uid, p_measured_at, p_metric, round(v, 2), u, p_method) returning id into new_id;
  return new_id;
end $$;

-- =====================================================================================
-- Challenges and trials
-- =====================================================================================
create or replace function public.create_personal_challenge(
  p_title text, p_metric text, p_direction text, p_baseline numeric, p_target numeric, p_unit text,
  p_due_date date, p_pass_rule text, p_safety_notes text, p_linked_rank_key text)
returns uuid language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user(); new_id uuid; ratio numeric;
begin
  perform internal.lock_player(uid);
  if (select count(*) from public.user_challenges where user_id = uid and state in ('active','attempted','submitted','verified')) >= 20 then
    raise exception 'too_many_active_challenges';
  end if;
  if p_baseline is not null and p_baseline > 0 then
    ratio := case when p_direction = 'higher_better' then p_target / p_baseline else p_baseline / p_target end;
    if ratio > 3 then raise exception 'target_implausible_choose_smaller_step'; end if;
  end if;
  if p_linked_rank_key is not null and not exists (select 1 from public.rank_definitions where rank_key = p_linked_rank_key and ordinal > 0) then
    raise exception 'unknown_rank';
  end if;
  insert into public.user_challenges (user_id, title, metric, direction, baseline, target, unit, due_date, pass_rule, safety_notes, linked_rank_key, state)
  values (uid, trim(p_title), p_metric, p_direction, p_baseline, p_target, p_unit, p_due_date, coalesce(p_pass_rule,'meet_target'), p_safety_notes, p_linked_rank_key, 'draft')
  returning id into new_id;
  perform internal.audit(uid, 'challenge_draft', 'challenge', new_id::text);
  update public.user_challenges set state = 'active' where id = new_id;
  perform internal.audit(uid, 'challenge_activated', 'challenge', new_id::text, jsonb_build_object('from','draft','to','active'));
  return new_id;
end $$;

-- Evaluate an accepted attempt and move the challenge to passed/failed (shared by submit and admin verification).
create or replace function internal.finalize_attempt(p_attempt uuid) returns jsonb language plpgsql as $$
declare
  ar public.challenge_attempts; ch public.user_challenges; threshold numeric; v numeric; met boolean; a jsonb;
  v_xp int := 0; v_coins int := 0; before_level int; after_level int;
begin
  select * into ar from public.challenge_attempts where id = p_attempt;
  select * into ch from public.user_challenges where id = ar.challenge_id for update;
  if internal.unit_dimension(ar.unit) is distinct from internal.unit_dimension(ch.unit) then raise exception 'unit_mismatch'; end if;
  update public.user_challenges set state = 'verified' where id = ch.id;
  perform internal.audit(ar.user_id, 'challenge_verified', 'challenge', ch.id::text, jsonb_build_object('evidence', ar.evidence_type));

  v := internal.to_base(ar.value, ar.unit);
  threshold := internal.to_base(case when ch.pass_rule = 'improve_on_baseline' and ch.baseline is not null then ch.baseline else ch.target end, ch.unit);
  met := case when ch.direction = 'higher_better' then v >= threshold else v <= threshold end;
  if ch.pass_rule = 'improve_on_baseline' and ch.baseline is not null then   -- "improve" means strictly better than baseline
    met := case when ch.direction = 'higher_better' then v > threshold else v < threshold end;
  end if;

  select level into before_level from public.profiles where user_id = ar.user_id;
  if met then
    update public.user_challenges set state = 'passed', resolved_attempt_id = ar.id where id = ch.id;
    a := internal.award_xp(ar.user_id, 'challenge_pass', ch.id, (internal.clock_now() at time zone coalesce((select timezone from public.user_settings where user_id = ar.user_id),'UTC'))::date);
    v_xp := (a->>'xp')::int; v_coins := (a->>'coins')::int;
  else
    update public.user_challenges set state = 'failed', resolved_attempt_id = ar.id where id = ch.id;
  end if;
  perform internal.audit(ar.user_id, case when met then 'challenge_passed' else 'challenge_failed' end, 'challenge', ch.id::text);
  select level into after_level from public.profiles where user_id = ar.user_id;
  return jsonb_build_object('outcome', case when met then 'passed' else 'failed' end,
    'newRewards', internal.reward_list(v_xp, v_coins, after_level > before_level, after_level));
end $$;

create or replace function public.submit_challenge_attempt(p_challenge_id uuid, p_value numeric, p_unit text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user(); ch public.user_challenges; att uuid; flagged boolean := false; res jsonb; vb numeric; tb numeric; bb numeric;
begin
  perform internal.lock_player(uid);
  select * into ch from public.user_challenges where id = p_challenge_id and user_id = uid for update;
  if not found then raise exception 'challenge_not_found'; end if;

  select id into att from public.challenge_attempts where challenge_id = ch.id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('playerState', internal.player_state(uid), 'newRewards', '[]'::jsonb, 'duplicate', true,
      'outcome', (select state from public.user_challenges where id = ch.id));
  end if;
  if ch.state <> 'active' then raise exception 'challenge_not_active'; end if;
  if internal.unit_dimension(p_unit) is distinct from internal.unit_dimension(ch.unit) then raise exception 'unit_mismatch'; end if;
  if p_value < 0 then raise exception 'invalid_value'; end if;

  insert into public.challenge_attempts (challenge_id, user_id, value, unit, evidence_type, idempotency_key)
  values (ch.id, uid, p_value, p_unit, 'self_reported', p_idempotency_key) returning id into att;
  update public.user_challenges set state = 'attempted' where id = ch.id;
  perform internal.audit(uid, 'challenge_attempted', 'challenge', ch.id::text);
  update public.user_challenges set state = 'submitted' where id = ch.id;
  perform internal.audit(uid, 'challenge_submitted', 'challenge', ch.id::text);

  -- plausibility screen: wildly beyond the player's own baseline/target goes to review, never a public accusation
  vb := internal.to_base(p_value, p_unit); tb := internal.to_base(ch.target, ch.unit); bb := internal.to_base(coalesce(ch.baseline, 0), ch.unit);
  if ch.direction = 'higher_better' then flagged := vb > greatest(tb, bb) * 3;
  else flagged := vb < least(tb, case when bb > 0 then bb else tb end) / 3 and vb > 0; end if;

  if flagged then
    update public.challenge_attempts set verification_status = 'needs_review', review_reason = 'plausibility_check' where id = att;
    perform internal.audit(uid, 'challenge_flagged_for_review', 'challenge_attempt', att::text);
    return jsonb_build_object('playerState', internal.player_state(uid), 'newRewards', '[]'::jsonb, 'duplicate', false, 'outcome', 'needs_review');
  end if;

  update public.challenge_attempts set verification_status = 'accepted' where id = att;
  res := internal.finalize_attempt(att);
  return jsonb_build_object('playerState', internal.player_state(uid), 'newRewards', res->'newRewards', 'duplicate', false, 'outcome', res->>'outcome');
end $$;

-- Admin-only: decide an attempt held for review. Reviewer identity and reason are audited.
create or replace function public.verify_challenge_attempt(p_attempt_id uuid, p_decision text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user(); att public.challenge_attempts; res jsonb;
begin
  if not internal.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into att from public.challenge_attempts where id = p_attempt_id for update;
  if not found then raise exception 'attempt_not_found'; end if;
  perform internal.lock_player(att.user_id);
  if att.verification_status <> 'needs_review' then raise exception 'attempt_not_pending_review'; end if;
  if p_decision = 'accept' then
    update public.challenge_attempts set verification_status = 'accepted', evidence_type = 'admin_reviewed', reviewer_id = uid, review_reason = p_reason where id = att.id;
    perform internal.audit(uid, 'attempt_accepted_by_admin', 'challenge_attempt', att.id::text, jsonb_build_object('reason', p_reason));
    res := internal.finalize_attempt(att.id);
    return res;
  elsif p_decision = 'reject' then
    update public.challenge_attempts set verification_status = 'rejected', reviewer_id = uid, review_reason = p_reason where id = att.id;
    update public.user_challenges set state = 'active' where id = att.challenge_id;   -- retry path; earned XP untouched
    perform internal.audit(uid, 'attempt_rejected_by_admin', 'challenge_attempt', att.id::text, jsonb_build_object('reason', p_reason));
    return jsonb_build_object('outcome', 'rejected', 'newRewards', '[]'::jsonb);
  end if;
  raise exception 'invalid_decision';
end $$;

create or replace function public.retry_challenge(p_challenge_id uuid)
returns void language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user();
begin
  perform internal.lock_player(uid);
  update public.user_challenges set state = 'active' where id = p_challenge_id and user_id = uid and state = 'failed';
  if not found then raise exception 'challenge_not_retryable'; end if;
  perform internal.audit(uid, 'challenge_retry', 'challenge', p_challenge_id::text);
end $$;

-- =====================================================================================
-- Rank promotion (server decides; the client cannot send "I qualify")
-- =====================================================================================
create or replace function internal.promotion_eval(p_user uuid, p_rank_key text) returns jsonb language plpgsql stable as $$
declare
  ver int := internal.current_rules_version(); r public.rank_definitions; cur public.rank_definitions; req public.rank_requirements;
  days int; xp bigint; ev text; missing text[] := '{}';
  ord jsonb := '{"self_reported":0,"device_recorded":1,"admin_reviewed":2}';
begin
  select * into r from public.rank_definitions where rank_key = p_rank_key;
  if not found then return jsonb_build_object('eligible', false, 'missing', jsonb_build_array('unknown_rank')); end if;
  select rd.* into cur from public.rank_definitions rd join public.profiles p on p.rank_key = rd.rank_key where p.user_id = p_user;
  if r.ordinal <= cur.ordinal then return jsonb_build_object('eligible', false, 'missing', jsonb_build_array('already_earned')); end if;
  if r.ordinal <> cur.ordinal + 1 then missing := array_append(missing, 'not_next_rank'::text); end if;
  select * into req from public.rank_requirements where rank_key = p_rank_key and rules_version = ver;
  if not found then return jsonb_build_object('eligible', false, 'missing', jsonb_build_array('no_requirements_for_rules_version')); end if;

  select coalesce(sum(qualified_days), 0) into days from public.user_campaigns where user_id = p_user;
  select coalesce(sum(xp_delta), 0) into xp from public.xp_ledger where user_id = p_user;       -- ledger is the truth
  if days < req.min_qualified_days then missing := array_append(missing, 'qualified_days'::text); end if;
  if xp < req.min_lifetime_xp then missing := array_append(missing, 'lifetime_xp'::text); end if;
  if req.requires_trial then
    select a.evidence_type into ev
      from public.user_challenges c join public.challenge_attempts a on a.id = c.resolved_attempt_id
     where c.user_id = p_user and c.linked_rank_key = p_rank_key and c.state = 'passed' and a.verification_status = 'accepted'
     order by (ord->>a.evidence_type)::int desc limit 1;
    if ev is null then missing := array_append(missing, 'trial'::text);
    elsif (ord->>ev)::int < (ord->>req.min_evidence_level)::int then missing := array_append(missing, 'trial_evidence_level'::text); end if;
  end if;
  return jsonb_build_object('eligible', coalesce(array_length(missing,1),0) = 0, 'missing', to_jsonb(missing),
    'qualifiedDays', days, 'lifetimeXp', xp, 'requiredDays', req.min_qualified_days, 'requiredXp', req.min_lifetime_xp);
end $$;

create or replace function public.evaluate_promotion_eligibility(p_rank_key text)
returns jsonb language plpgsql stable security definer set search_path = public, internal, pg_temp as $$
begin return internal.promotion_eval(internal.require_user(), p_rank_key); end $$;

create or replace function public.claim_promotion(p_rank_key text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare
  uid uuid := internal.require_user(); ev jsonb; a jsonb; before_level int; after_level int; v_attempt uuid; v_days int; v_tz text; v_today date;
begin
  perform internal.lock_player(uid);     -- concurrent claims serialise here; the second sees the history row
  if exists (select 1 from public.user_rank_history where user_id = uid and rank_key = p_rank_key) then
    return jsonb_build_object('playerState', internal.player_state(uid), 'newRewards', '[]'::jsonb, 'duplicate', true);
  end if;
  ev := internal.promotion_eval(uid, p_rank_key);
  if not (ev->>'eligible')::boolean then raise exception 'promotion_not_eligible: %', ev->>'missing' using errcode = 'P0001'; end if;

  select c.resolved_attempt_id into v_attempt from public.user_challenges c
   where c.user_id = uid and c.linked_rank_key = p_rank_key and c.state = 'passed' order by c.updated_at desc limit 1;
  v_days := (ev->>'qualifiedDays')::int;
  select timezone into v_tz from public.user_settings where user_id = uid;
  v_today := (internal.clock_now() at time zone coalesce(v_tz,'UTC'))::date;

  select level into before_level from public.profiles where user_id = uid;
  insert into public.user_rank_history (user_id, rank_key, campaign_day, challenge_attempt_id, rules_version)
  values (uid, p_rank_key, v_days, v_attempt, internal.current_rules_version());
  update public.profiles set rank_key = p_rank_key where user_id = uid;
  a := internal.award_xp(uid, 'promotion_boss', internal.det_uuid(uid::text || ':promotion:' || p_rank_key), v_today);
  insert into public.user_inventory (user_id, item_key) select uid, key from public.cosmetic_items where unlock_rank_key = p_rank_key on conflict do nothing;
  insert into public.user_achievements (user_id, achievement_key) select uid, 'rank_' || p_rank_key where exists (select 1 from public.achievement_definitions where key = 'rank_' || p_rank_key) on conflict do nothing;
  perform internal.audit(uid, 'rank_promoted', 'rank', p_rank_key, jsonb_build_object('idempotency_key', p_idempotency_key, 'attempt', v_attempt));
  select level into after_level from public.profiles where user_id = uid;

  return jsonb_build_object('playerState', internal.player_state(uid), 'duplicate', false,
    'newRewards', internal.reward_list((a->>'xp')::int, (a->>'coins')::int, after_level > before_level, after_level,
      jsonb_build_array(jsonb_build_object('kind','rank_unlocked','label',(select name from public.rank_definitions where rank_key = p_rank_key),
        'accessibleText','You have been promoted to '||(select name from public.rank_definitions where rank_key = p_rank_key)||'.'))));
end $$;

-- =====================================================================================
-- Reads
-- =====================================================================================
create or replace function public.get_command_center(p_local_date date)
returns jsonb language plpgsql stable security definer set search_path = public, internal, pg_temp as $$
declare
  uid uuid := internal.require_user(); camp public.user_campaigns; tpl public.campaign_templates; v_rec int; v_day int; d public.campaign_day_templates;
  sides jsonb := '[]'; side jsonb; idx int := 0; done boolean; next_rank text; boss jsonb;
begin
  select * into camp from public.user_campaigns where user_id = uid order by created_at desc limit 1;
  if found then
    select * into tpl from public.campaign_templates where id = camp.template_id;
    select program_day into v_rec from public.campaign_day_records where campaign_id = camp.id and calendar_date_local = p_local_date;
    v_day := coalesce(v_rec, least(camp.qualified_days + 1, tpl.total_qualifying_days));
    select * into d from public.campaign_day_templates where template_id = tpl.id and day_number = v_day;
    for side in select * from jsonb_array_elements(coalesce(d.quest_spec->'side','[]')) loop
      done := exists (select 1 from public.xp_ledger where user_id = uid and source_type = 'side_quest' and source_id = internal.det_uuid(camp.id::text || ':' || v_day || ':side:' || idx))
              or (side->>'type' = 'reflection' and exists (select 1 from public.stoic_reflections where user_id = uid and local_date = p_local_date));
      sides := sides || jsonb_build_array(side || jsonb_build_object('completed', done, 'index', idx));
      idx := idx + 1;
    end loop;
  end if;
  select rd.rank_key into next_rank from public.rank_definitions rd
   where rd.ordinal = (select r2.ordinal + 1 from public.rank_definitions r2 join public.profiles p on p.rank_key = r2.rank_key where p.user_id = uid);
  if next_rank is not null then boss := internal.promotion_eval(uid, next_rank) || jsonb_build_object('rankKey', next_rank, 'rankName', (select name from public.rank_definitions where rank_key = next_rank)); end if;

  return jsonb_build_object(
    'player', internal.player_state(uid),
    'profile', (select jsonb_build_object('displayName', display_name, 'avatarId', avatar_id, 'rankName', (select name from public.rank_definitions r where r.rank_key = p.rank_key)) from public.profiles p where user_id = uid),
    'campaign', case when camp.id is null then null else jsonb_build_object(
        'id', camp.id, 'state', camp.state, 'qualifiedDays', camp.qualified_days, 'totalDays', tpl.total_qualifying_days,
        'programDay', v_day, 'qualifiedToday', v_rec is not null,
        'day', jsonb_build_object('title', d.title, 'description', d.description, 'focus', d.focus, 'spec', d.quest_spec),
        'sideQuests', sides) end,
    'nextRank', boss,
    'recentXp', coalesce((select jsonb_agg(jsonb_build_object('source', source_type, 'xp', xp_delta, 'at', awarded_at) order by awarded_at desc)
                          from (select * from public.xp_ledger where user_id = uid order by awarded_at desc limit 5) x), '[]'));
end $$;

create or replace function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user();
begin
  return jsonb_build_object(
    'exportedAt', now(),
    'profile', (select to_jsonb(p) from public.profiles p where user_id = uid),
    'settings', (select to_jsonb(s) from public.user_settings s where user_id = uid),
    'consents', coalesce((select jsonb_agg(to_jsonb(c)) from public.user_consents c where user_id = uid), '[]'),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(c)) from public.user_campaigns c where user_id = uid), '[]'),
    'dayRecords', coalesce((select jsonb_agg(to_jsonb(r)) from public.campaign_day_records r join public.user_campaigns c on c.id = r.campaign_id where c.user_id = uid), '[]'),
    'workouts', coalesce((select jsonb_agg(to_jsonb(w)) from public.workout_sessions w where user_id = uid), '[]'),
    'measurements', coalesce((select jsonb_agg(to_jsonb(m)) from public.body_measurements m where user_id = uid), '[]'),
    'reflections', coalesce((select jsonb_agg(to_jsonb(r)) from public.stoic_reflections r where user_id = uid), '[]'),
    'xpLedger', coalesce((select jsonb_agg(to_jsonb(x)) from public.xp_ledger x where user_id = uid), '[]'),
    'coinLedger', coalesce((select jsonb_agg(to_jsonb(x)) from public.coin_ledger x where user_id = uid), '[]'),
    'rankHistory', coalesce((select jsonb_agg(to_jsonb(x)) from public.user_rank_history x where user_id = uid), '[]'),
    'challenges', coalesce((select jsonb_agg(to_jsonb(c)) from public.user_challenges c where user_id = uid), '[]'),
    'attempts', coalesce((select jsonb_agg(to_jsonb(a)) from public.challenge_attempts a where user_id = uid), '[]'));
end $$;
