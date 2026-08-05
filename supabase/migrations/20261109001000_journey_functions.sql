-- Choose Your Journey: server-authoritative programming, journey commands, legacy backfill, RLS.
-- `internal.generate_sessions` mirrors packages/campaigns/src/programming.ts exactly (parity-tested in scripts/test-migrations.sh).

-- =====================================================================================
-- Programming (pure, deterministic, integer arithmetic only)
-- =====================================================================================
create or replace function internal.plan_phase(p_day int, p_horizon int, p_event_day int) returns text language sql immutable as $$
  select case
    when p_event_day is not null and p_horizon >= 90 and p_event_day between 17 and p_horizon and p_day = p_event_day then 'event'
    when p_event_day is not null and p_horizon >= 90 and p_event_day between 17 and p_horizon and p_day between p_event_day - 7 and p_event_day - 1 then 'peak'
    when p_event_day is not null and p_horizon >= 90 and p_event_day between 17 and p_horizon and p_day between p_event_day + 1 and p_event_day + 7 then 'transition'
    when p_day <= 9 or p_horizon <= 9 then 'preparation'
    when p_horizon <= 30 then 'base'
    when p_horizon <= 60 then case when p_day <= 33 then 'base' else 'build' end
    when p_horizon <= 90 then case when p_day <= 45 then 'base' else 'build' end
    when p_day <= 100 then 'base'
    when p_day <= 200 then 'build'
    when p_day <= 214 then 'transition'
    else 'build' end
$$;

create or replace function internal.checkpoint_json(p_day int, p_horizon int) returns jsonb language sql immutable as $$
  select case when p_day in (3,9,30,60,90,300) and p_day <= p_horizon then
    jsonb_build_object('day', p_day, 'kind', case when p_day = 3 then 'readiness' else 'promotion' end,
      'rankKey', case p_day when 9 then 'hoplites' when 30 then 'enomotarches' when 60 then 'pentekonter' when 90 then 'lochagos' when 300 then 'polemarchos' end)
  else 'null'::jsonb end
$$;

create or replace function internal.generate_sessions(p_horizon int, p_inputs jsonb, p_anchor date, p_from_day int)
returns jsonb language plpgsql stable as $$
declare
  exp text := p_inputs->>'experience';
  focus text := p_inputs->>'focus';
  equip text := p_inputs->>'equipment';
  lim boolean := coalesce((p_inputs->>'hasLimitations')::boolean, false);
  maxm int := (p_inputs->>'maxSessionMinutes')::int;
  rstyle text := coalesce(p_inputs->>'recoveryStyle', 'active');
  avail int[] := array(select (jsonb_array_elements_text(coalesce(p_inputs->'availableWeekdays','[]')))::int);
  sport int[] := array(select (jsonb_array_elements_text(coalesce(p_inputs->'sportDays','[]')))::int);
  ev_day int; rot text[]; k int := 0; d int; dt date; wd int; ph text; dl boolean; st text; it text; m int; minsec int;
  sets int; reps text; ex jsonb; a public.session_archetypes; out jsonb := '[]';
begin
  if nullif(p_inputs->>'eventDate', '') is not null then ev_day := p_from_day + ((p_inputs->>'eventDate')::date - p_anchor); end if;
  for d in p_from_day..p_horizon loop
    dt := p_anchor + (d - p_from_day);
    wd := extract(isodow from dt)::int - 1;                     -- Monday = 0
    ph := internal.plan_phase(d, p_horizon, ev_day);
    dl := ph in ('base','build') and ((d - 10) / 7) % 4 = 3;    -- d >= 10 whenever phase is base/build
    st := case
      when d = 1 then 'orientation'
      when d = 3 then 'assessment'
      when d in (9,30,60,90,300) then 'trial'
      when (d + 1) in (9,30,60,90,300) and d + 1 <= p_horizon then 'trial_prep'
      when ph = 'event' then 'event'
      when wd = any(sport) then 'sport'
      when ((wd + 6) % 7) = any(sport) then 'recovery'
      when not (wd = any(avail)) then 'recovery'
      else null end;
    if st is null then
      rot := case when ph = 'preparation' then array['strength','aerobic','mobility']
             else case focus
               when 'strength' then array['strength','aerobic','strength','tempo','mobility']
               when 'cardio' then array['aerobic','strength','tempo','aerobic','mobility']
               when 'hybrid' then array['strength','aerobic','tempo','strength','mobility']
               when 'mobility' then array['mobility','strength','aerobic','mobility','tempo']
               else array['aerobic','strength','mobility','aerobic','tempo'] end end;
      st := rot[(k % array_length(rot, 1)) + 1]; k := k + 1;
      if st = 'tempo' and not (ph in ('build','peak') and not dl and exp in ('regular','experienced') and not lim and not (((wd + 1) % 7) = any(sport))) then
        st := 'aerobic';
      end if;
    end if;
    select * into a from public.session_archetypes where session_type = st;

    if a.fixed_minutes is not null then m := a.fixed_minutes;
    else
      m := (case exp when 'new' then 20 when 'returning' then 25 when 'regular' then 35 else 45 end)
           + (case when d > 9 then least(15, 2 * ((d - 10) / 7)) else 0 end) + (case when ph = 'build' then 5 else 0 end);
      m := (m * a.factor_pct + 50) / 100;
      m := (m * (case ph when 'preparation' then 80 when 'peak' then 60 when 'transition' then 70 else 100 end) + 50) / 100;
      if dl then m := (m * 70 + 50) / 100; end if;
      m := greatest(10, ((m + 2) / 5) * 5);
    end if;
    if st not in ('sport','recovery','event') then m := least(m, maxm); end if;
    minsec := case when st = 'recovery' then 0 else greatest(300, (m / 2) * 60) end;

    it := a.intensity;
    if st = 'strength' and (ph in ('preparation','transition') or dl) then it := 'easy'; end if;

    if st = 'strength' then
      sets := case when ph in ('base','build') then case when dl then 2 else 3 end else 2 end;
      reps := case when dl then '10' else case ph when 'preparation' then '8' when 'base' then '10' when 'build' then '8' when 'peak' then '6' else '10' end end;
      ex := jsonb_build_array(
        jsonb_build_object('slug', case when lim then 'box-squat' when equip = 'none' then 'bodyweight-squat' else 'goblet-squat' end, 'sets', sets, 'reps', reps),
        jsonb_build_object('slug', case when lim or exp = 'new' then 'incline-push-up' else 'push-up' end, 'sets', sets, 'reps', reps),
        jsonb_build_object('slug', case equip when 'none' then 'inverted-row' when 'home_basic' then 'band-row' else 'dumbbell-row' end, 'sets', sets, 'reps', reps),
        jsonb_build_object('slug', case when equip = 'none' then 'hip-hinge-drill' else 'romanian-deadlift' end, 'sets', sets, 'reps', reps),
        jsonb_build_object('slug', case when lim then 'dead-bug' else 'plank' end, 'sets', sets, 'reps', '30s'));
      if ph = 'build' and equip <> 'none' and not dl then ex := ex || jsonb_build_array(jsonb_build_object('slug', 'farmer-carry', 'sets', sets, 'reps', '40m')); end if;
    elsif st = 'mobility' then
      ex := '[{"slug":"cat-cow","sets":1,"reps":"60s"},{"slug":"worlds-greatest-stretch","sets":1,"reps":"60s"},{"slug":"hip-flexor-stretch","sets":1,"reps":"60s"}]';
    elsif st = 'aerobic' then
      ex := jsonb_build_array(jsonb_build_object('slug', case when lim then 'zone2-bike' when exp in ('new','returning') then 'zone2-walk' else 'zone2-jog' end, 'sets', 1, 'reps', m || ' min'));
    else ex := '[]';
    end if;

    out := out || jsonb_build_array(jsonb_build_object(
      'programDay', d, 'scheduledFor', to_char(dt, 'YYYY-MM-DD'), 'phase', ph, 'week', (d - 1) / 7 + 1, 'deload', dl,
      'sessionType', st, 'intensity', it, 'plannedMinutes', m, 'title', a.title, 'description', a.description,
      'primary', jsonb_build_object('type', a.quest_type, 'allowedActivityTypes', to_jsonb(a.allowed_activity_types), 'minDurationSeconds', minsec),
      'side', case when st = 'recovery' and rstyle = 'full_rest' then '[]'::jsonb else a.side end,
      'alternatives', a.alternatives, 'exercises', ex, 'checkpoint', internal.checkpoint_json(d, p_horizon)));
  end loop;
  return out;
end $$;

-- Mirrors validatePlanInputs() + PlanInputsSchema. Raises a stable error code on the first problem.
create or replace function internal.validate_plan_inputs(p jsonb, p_today date) returns void language plpgsql stable as $$
declare n int; ev date; bad boolean;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'invalid_plan_inputs'; end if;
  if coalesce(p->>'experience','') not in ('new','returning','regular','experienced') then raise exception 'invalid_plan_inputs: experience'; end if;
  if coalesce(p->>'focus','') not in ('strength','cardio','hybrid','mobility','general_health') then raise exception 'invalid_plan_inputs: focus'; end if;
  if coalesce(p->>'equipment','') not in ('none','home_basic','full_gym') then raise exception 'invalid_plan_inputs: equipment'; end if;
  if coalesce(p->>'recoveryStyle','') not in ('active','full_rest') then raise exception 'invalid_plan_inputs: recoveryStyle'; end if;
  if jsonb_typeof(p->'hasLimitations') is distinct from 'boolean' then raise exception 'invalid_plan_inputs: hasLimitations'; end if;
  if jsonb_typeof(p->'availableWeekdays') is distinct from 'array' or jsonb_typeof(p->'sportDays') is distinct from 'array' then raise exception 'invalid_plan_inputs: weekdays'; end if;
  select bool_or(jsonb_typeof(e) <> 'number' or e::text !~ '^[0-6]$') into bad
    from (select jsonb_array_elements(p->'availableWeekdays') e union all select jsonb_array_elements(p->'sportDays')) x;
  if coalesce(bad, false) then raise exception 'invalid_weekday'; end if;
  select count(distinct e::text) into n from jsonb_array_elements(p->'availableWeekdays') e;
  if n < 1 then raise exception 'choose_at_least_one_training_day'; end if;
  if n > 6 then raise exception 'keep_at_least_one_rest_day'; end if;
  if (select count(distinct e::text) from jsonb_array_elements(p->'sportDays') e) > 4 then raise exception 'too_many_sport_days'; end if;
  if jsonb_typeof(p->'maxSessionMinutes') is distinct from 'number' or (p->>'maxSessionMinutes') !~ '^\d+$'
     or (p->>'maxSessionMinutes')::int not between 10 and 180 then raise exception 'session_minutes_out_of_range'; end if;
  if nullif(p->>'eventDate', '') is not null then
    begin ev := (p->>'eventDate')::date; exception when others then raise exception 'invalid_plan_inputs: eventDate'; end;
    if ev < p_today then raise exception 'event_in_past'; end if;
    if ev > p_today + 400 then raise exception 'event_too_far'; end if;
  end if;
end $$;

create or replace function internal.validate_goal(g jsonb, p_today date) returns void language plpgsql stable as $$
declare ratio numeric; b numeric; t numeric;
begin
  if g is null or jsonb_typeof(g) <> 'object' then raise exception 'goal_required'; end if;
  if char_length(trim(coalesce(g->>'title',''))) not between 3 and 80 then raise exception 'invalid_goal: title'; end if;
  if coalesce(g->>'metric','') = '' then raise exception 'invalid_goal: metric'; end if;
  if coalesce(g->>'direction','') not in ('higher_better','lower_better') then raise exception 'invalid_goal: direction'; end if;
  if coalesce(g->>'unit','') not in ('kg','lb','m','km','mi','s','min','h','reps') then raise exception 'invalid_goal: unit'; end if;
  t := (g->>'target')::numeric; b := nullif(g->>'baseline','')::numeric;
  if t is null or t <= 0 then raise exception 'invalid_goal: target'; end if;
  if b is not null and b < 0 then raise exception 'invalid_goal: baseline'; end if;
  if (g->>'targetDate')::date < p_today or (g->>'targetDate')::date > p_today + 400 then raise exception 'invalid_goal: targetDate'; end if;
  if b is not null and b > 0 then
    ratio := case when g->>'direction' = 'higher_better' then t / b else b / t end;
    if ratio > 3 then raise exception 'target_implausible_choose_smaller_step'; end if;
  end if;
end $$;

-- =====================================================================================
-- Journey helpers
-- =====================================================================================
create or replace function internal.local_today(p_user uuid) returns date language sql stable as $$
  select (internal.clock_now() at time zone coalesce((select timezone from public.user_settings where user_id = p_user), 'UTC'))::date
$$;

create or replace function internal.store_sessions(p_camp uuid, p_user uuid, p_gen int, p_sessions jsonb) returns void language sql as $$
  insert into public.planned_sessions (campaign_id, user_id, generation_version, program_day, scheduled_for, phase, session_type, intensity, planned_minutes, spec)
  select p_camp, p_user, p_gen, (s->>'programDay')::int, (s->>'scheduledFor')::date, s->>'phase', s->>'sessionType', s->>'intensity', (s->>'plannedMinutes')::int, s
    from jsonb_array_elements(coalesce(p_sessions, '[]')) s
$$;

-- Plan inputs for journeys created before Choose Your Journey (old onboarding stored `preferences`).
create or replace function internal.legacy_plan_inputs(p_prefs jsonb, p_focus text) returns jsonb language sql immutable as $$
  with days as (
    select coalesce(array_agg(distinct (e)::int order by (e)::int) filter (where e ~ '^[0-6]$'), '{}') a
      from jsonb_array_elements_text(case when jsonb_typeof(p_prefs->'preferredDays') = 'array' then p_prefs->'preferredDays' else '[]' end) e)
  select jsonb_build_object(
    'experience', case p_prefs->>'difficulty' when 'challenging' then 'regular' when 'standard' then 'returning' else 'new' end,
    'focus', coalesce(p_focus, 'hybrid'),
    'availableWeekdays', to_jsonb(case when cardinality(a) = 0 then array[0,2,4] when cardinality(a) = 7 then array[0,1,2,3,4,5] else a end),
    'sportDays', '[]'::jsonb, 'sportName', null,
    'maxSessionMinutes', 60,
    'equipment', case when p_prefs->>'equipment' in ('none','home_basic','full_gym') then p_prefs->>'equipment' else 'none' end,
    'hasLimitations', coalesce(nullif(trim(p_prefs->>'limitations'), ''), null) is not null,
    'recoveryStyle', 'active', 'eventDate', null)
  from days
$$;

-- The original fixed nine-day content (campaign_day_templates) as planned sessions — keeps legacy journeys bit-for-bit.
create or replace function internal.legacy_sessions(p_camp uuid, p_anchor date) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'programDay', d.day_number,
      'scheduledFor', to_char(coalesce(r.calendar_date_local, p_anchor + (d.day_number - (c.qualified_days + 1))), 'YYYY-MM-DD'),
      'phase', 'preparation', 'week', (d.day_number - 1) / 7 + 1, 'deload', false,
      'sessionType', case d.focus when 'oath' then 'orientation' when 'cardio' then 'aerobic' else d.focus end,
      'intensity', case d.focus when 'recovery' then 'rest' when 'trial' then 'moderate' else 'easy' end,
      'plannedMinutes', ((d.quest_spec->'primary'->>'minDurationSeconds')::int + 59) / 60,
      'title', d.title, 'description', d.description,
      'primary', d.quest_spec->'primary', 'side', coalesce(d.quest_spec->'side', '[]'), 'alternatives', d.quest_spec->'alternatives',
      'exercises', '[]'::jsonb, 'checkpoint', internal.checkpoint_json(d.day_number, t.total_qualifying_days)) order by d.day_number), '[]')
  from public.user_campaigns c
  join public.campaign_templates t on t.id = c.template_id
  join public.campaign_day_templates d on d.template_id = c.template_id
  left join public.campaign_day_records r on r.campaign_id = c.id and r.program_day = d.day_number
  where c.id = p_camp
$$;

-- Supersede and regenerate every program day after the last credited one. History is never touched.
create or replace function internal.regenerate_future(p_camp uuid, p_kind text, p_reason text, p_from_template text, p_from_days int)
returns jsonb language plpgsql as $$
declare c public.user_campaigns; t public.campaign_templates; v_today date; v_anchor date; v_from int; v_gen int;
begin
  select * into c from public.user_campaigns where id = p_camp for update;
  select * into t from public.campaign_templates where id = c.template_id;
  v_today := internal.local_today(c.user_id);
  v_anchor := case when exists (select 1 from public.campaign_day_records where campaign_id = c.id and calendar_date_local = v_today) then v_today + 1 else v_today end;
  v_from := c.qualified_days + 1;
  v_gen := c.generation_version + 1;
  update public.planned_sessions set superseded_at = now() where campaign_id = c.id and superseded_at is null and program_day >= v_from;
  if v_from <= t.total_qualifying_days then
    perform internal.store_sessions(c.id, c.user_id, v_gen,
      internal.generate_sessions(t.total_qualifying_days, coalesce(c.plan_inputs, internal.legacy_plan_inputs(c.preferences, null)), v_anchor, v_from));
  end if;
  update public.user_campaigns set generation_version = v_gen where id = c.id;
  insert into public.journey_plan_changes (campaign_id, user_id, kind, from_template_key, to_template_key, from_days, to_days,
    effective_program_day, effective_date, from_generation, to_generation, reason, applied_by)
  values (c.id, c.user_id, p_kind, p_from_template, t.key, p_from_days, t.total_qualifying_days, v_from, v_anchor, c.generation_version, v_gen, p_reason, auth.uid());
  return jsonb_build_object('fromDay', v_from, 'anchor', v_anchor, 'generation', v_gen);
end $$;

create or replace function internal.insert_goal(p_user uuid, p_camp uuid, g jsonb) returns uuid language sql as $$
  insert into public.player_goals (user_id, campaign_id, title, metric, direction, baseline, target, unit, target_date)
  values (p_user, p_camp, trim(g->>'title'), g->>'metric', g->>'direction', nullif(g->>'baseline','')::numeric, (g->>'target')::numeric, g->>'unit', (g->>'targetDate')::date)
  returning id
$$;

create or replace function internal.start_journey(p_user uuid, p_template public.campaign_templates, p_inputs jsonb, p_baseline jsonb, p_goal jsonb,
  p_timezone text, p_legacy boolean) returns uuid language plpgsql as $$
declare v_today date := (internal.clock_now() at time zone p_timezone)::date; v_id uuid;
begin
  insert into public.user_campaigns (user_id, template_id, baseline, preferences, plan_inputs, timezone, start_date, goal_snapshot, generation_version)
  values (p_user, p_template.id, coalesce(p_baseline, '{}'), coalesce(p_inputs, '{}'), p_inputs, p_timezone, v_today, p_goal, 1)
  returning id into v_id;
  perform internal.store_sessions(v_id, p_user, 1, case when p_legacy then internal.legacy_sessions(v_id, v_today)
                                                     else internal.generate_sessions(p_template.total_qualifying_days, p_inputs, v_today, 1) end);
  insert into public.journey_plan_changes (campaign_id, user_id, kind, to_template_key, to_days, effective_program_day, effective_date, to_generation, applied_by)
  values (v_id, p_user, 'created', p_template.key, p_template.total_qualifying_days, 1, v_today, 1, p_user);
  if p_goal is not null then perform internal.insert_goal(p_user, v_id, p_goal); end if;
  perform internal.audit(p_user, 'journey_started', 'campaign', v_id::text, jsonb_build_object('template', p_template.key, 'days', p_template.total_qualifying_days));
  return v_id;
end $$;

create or replace function internal.mutation(p_user uuid, p_extra jsonb default '{}') returns jsonb language sql stable as $$
  select jsonb_build_object('playerState', internal.player_state(p_user), 'newRewards', '[]'::jsonb, 'duplicate', false) || p_extra
$$;

-- =====================================================================================
-- Journey commands
-- =====================================================================================
create or replace function public.create_journey(p_template_key text, p_plan_inputs jsonb, p_baseline jsonb, p_goal jsonb, p_timezone text)
returns jsonb language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user(); t public.campaign_templates; v_today date; v_open uuid; v_id uuid;
begin
  perform internal.lock_player(uid);
  begin v_today := (internal.clock_now() at time zone p_timezone)::date; exception when others then raise exception 'invalid_timezone'; end;
  select * into t from public.campaign_templates where key = p_template_key and lifecycle = 'live';
  if not found then raise exception 'unknown_plan'; end if;
  select id into v_open from public.user_campaigns where user_id = uid and state in ('active','paused');
  if found then return internal.mutation(uid, jsonb_build_object('duplicate', true, 'journeyId', v_open)); end if;   -- retry-safe
  perform internal.validate_plan_inputs(p_plan_inputs, v_today);
  perform internal.validate_goal(p_goal, v_today);
  update public.user_settings set timezone = p_timezone where user_id = uid;
  v_id := internal.start_journey(uid, t, p_plan_inputs, p_baseline, p_goal, p_timezone, false);
  return internal.mutation(uid, jsonb_build_object('journeyId', v_id));
end $$;

-- Legacy entry point (pre-journey app builds): fixed nine-day content, preferences mapped to plan inputs.
create or replace function public.create_campaign_enrollment(p_template_key text, p_baseline jsonb, p_preferences jsonb)
returns jsonb language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user(); t public.campaign_templates; tz text; focus text;
begin
  perform internal.lock_player(uid);
  select * into t from public.campaign_templates where key = p_template_key and lifecycle = 'live';
  if not found then raise exception 'unknown_campaign_template'; end if;
  if exists (select 1 from public.user_campaigns where user_id = uid and state in ('active','paused')) then
    return internal.player_state(uid);   -- idempotent: already enrolled
  end if;
  select timezone into tz from public.user_settings where user_id = uid;
  select primary_focus into focus from public.profiles where user_id = uid;
  perform internal.start_journey(uid, t, internal.legacy_plan_inputs(coalesce(p_preferences, '{}'), focus), p_baseline, null, coalesce(tz, 'UTC'),
    exists (select 1 from public.campaign_day_templates where template_id = t.id));
  update public.user_campaigns set preferences = coalesce(p_preferences, '{}') where user_id = uid and state = 'active';
  perform internal.audit(uid, 'campaign_enrolled', 'campaign_template', p_template_key);
  return internal.player_state(uid);
end $$;

-- Preview only: nothing is persisted. Anchored at the caller's local today.
create or replace function public.preview_journey(p_template_key text, p_plan_inputs jsonb, p_from_day int default 1)
returns jsonb language plpgsql stable security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user(); t public.campaign_templates; v_today date := internal.local_today(uid);
begin
  select * into t from public.campaign_templates where key = p_template_key and lifecycle = 'live';
  if not found then raise exception 'unknown_plan'; end if;
  perform internal.validate_plan_inputs(p_plan_inputs, v_today);
  if p_from_day < 1 or p_from_day > t.total_qualifying_days then raise exception 'invalid_from_day'; end if;
  return jsonb_build_object('templateKey', t.key, 'totalDays', t.total_qualifying_days, 'anchor', v_today,
    'sessions', internal.generate_sessions(t.total_qualifying_days, p_plan_inputs, v_today, p_from_day));
end $$;

-- Grow the horizon of the latest journey. Keeps credited days, workouts, XP, rewards and ranks; regenerates the future only.
create or replace function public.extend_journey(p_template_key text, p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user(); c public.user_campaigns; t_from public.campaign_templates; t_to public.campaign_templates; r jsonb;
begin
  perform internal.lock_player(uid);
  select * into c from public.user_campaigns where user_id = uid order by created_at desc limit 1 for update;
  if not found then raise exception 'no_journey'; end if;
  select * into t_from from public.campaign_templates where id = c.template_id;
  select * into t_to from public.campaign_templates where key = p_template_key and lifecycle = 'live';
  if not found then raise exception 'unknown_plan'; end if;
  if t_to.total_qualifying_days = t_from.total_qualifying_days then raise exception 'same_horizon'; end if;
  if t_to.total_qualifying_days < t_from.total_qualifying_days then raise exception 'shortening_not_supported'; end if;
  if c.state = 'paused' then raise exception 'resume_before_extending'; end if;
  if not coalesce(p_confirmed, false) then raise exception 'confirmation_required'; end if;
  if c.state = 'completed' and exists (select 1 from public.user_campaigns where user_id = uid and id <> c.id and state in ('active','paused')) then
    raise exception 'another_journey_open';
  end if;
  update public.user_campaigns set template_id = t_to.id, state = 'active', plan_inputs = coalesce(plan_inputs, internal.legacy_plan_inputs(preferences, null)) where id = c.id;
  r := internal.regenerate_future(c.id, 'extended', null, t_from.key, t_from.total_qualifying_days);
  insert into public.user_achievements (user_id, achievement_key) values (uid, 'journey_extended') on conflict do nothing;
  perform internal.audit(uid, 'journey_extended', 'campaign', c.id::text, jsonb_build_object('from', t_from.key, 'to', t_to.key, 'fromDay', r->'fromDay'));
  return internal.mutation(uid, jsonb_build_object('fromDay', r->'fromDay', 'generation', r->'generation'));
end $$;

-- Change availability / sport days / equipment / event, or (p_plan_inputs = null) just re-project from today.
create or replace function public.update_journey_plan(p_plan_inputs jsonb, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user(); c public.user_campaigns; t public.campaign_templates; r jsonb;
begin
  perform internal.lock_player(uid);
  select * into c from public.user_campaigns where user_id = uid and state in ('active','paused') for update;
  if not found then raise exception 'no_open_journey'; end if;
  if p_reason is not null and char_length(p_reason) > 300 then raise exception 'reason_too_long'; end if;
  select * into t from public.campaign_templates where id = c.template_id;
  if p_plan_inputs is not null then
    perform internal.validate_plan_inputs(p_plan_inputs, internal.local_today(uid));
    update public.user_campaigns set plan_inputs = p_plan_inputs where id = c.id;
  end if;
  r := internal.regenerate_future(c.id, case when p_plan_inputs is null then 'rescheduled' else 'plan_adjusted' end, p_reason, t.key, t.total_qualifying_days);
  perform internal.audit(uid, 'journey_plan_updated', 'campaign', c.id::text, jsonb_build_object('rescheduleOnly', p_plan_inputs is null));
  return internal.mutation(uid, jsonb_build_object('fromDay', r->'fromDay', 'generation', r->'generation'));
end $$;

-- Pause keeps everything; resume re-projects the remaining days from today so the finish forecast moves instead.
create or replace function public.set_campaign_paused(p_paused boolean)
returns jsonb language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user(); c public.user_campaigns; t public.campaign_templates;
begin
  perform internal.lock_player(uid);
  if p_paused then
    update public.user_campaigns set state = 'paused', paused_at = now() where user_id = uid and state = 'active' returning * into c;
    if found then
      select * into t from public.campaign_templates where id = c.template_id;
      insert into public.journey_plan_changes (campaign_id, user_id, kind, from_template_key, to_template_key, from_days, to_days, effective_program_day, effective_date, from_generation, to_generation, applied_by)
      values (c.id, uid, 'paused', t.key, t.key, t.total_qualifying_days, t.total_qualifying_days, c.qualified_days + 1, internal.local_today(uid), c.generation_version, c.generation_version, uid);
    end if;
  else
    update public.user_campaigns set state = 'active', paused_at = null where user_id = uid and state = 'paused' returning * into c;
    if found then
      select * into t from public.campaign_templates where id = c.template_id;
      perform internal.regenerate_future(c.id, 'resumed', null, t.key, t.total_qualifying_days);
    end if;
  end if;
  return internal.player_state(uid);
end $$;

create or replace function public.add_player_goal(p_goal jsonb)
returns uuid language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user(); v_camp uuid;
begin
  perform internal.lock_player(uid);
  perform internal.validate_goal(p_goal, internal.local_today(uid));
  if (select count(*) from public.player_goals where user_id = uid and status = 'active') >= 5 then raise exception 'too_many_active_goals'; end if;
  select id into v_camp from public.user_campaigns where user_id = uid order by created_at desc limit 1;
  return internal.insert_goal(uid, v_camp, p_goal);
end $$;

create or replace function public.set_goal_status(p_goal_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user();
begin
  if p_status not in ('active','achieved','retired') then raise exception 'invalid_status'; end if;
  update public.player_goals set status = p_status where id = p_goal_id and user_id = uid;
  if not found then raise exception 'goal_not_found'; end if;
end $$;

-- Checkpoint review (Day 3 readiness reflection, optional later reviews). Editable; awards no XP and never a rank.
create or replace function public.record_checkpoint_assessment(p_checkpoint_day int, p_responses jsonb)
returns jsonb language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare uid uuid := internal.require_user(); c public.user_campaigns; t public.campaign_templates;
begin
  perform internal.lock_player(uid);
  select * into c from public.user_campaigns where user_id = uid order by created_at desc limit 1;
  if not found then raise exception 'no_journey'; end if;
  select * into t from public.campaign_templates where id = c.template_id;
  if p_checkpoint_day not in (3,9,30,60,90,300) or p_checkpoint_day > t.total_qualifying_days then raise exception 'not_a_checkpoint'; end if;
  if c.qualified_days < p_checkpoint_day then raise exception 'checkpoint_not_reached'; end if;
  if jsonb_typeof(p_responses) is distinct from 'object'
     or coalesce(p_responses->>'energy','') !~ '^[1-5]$' or coalesce(p_responses->>'soreness','') !~ '^[1-5]$' or coalesce(p_responses->>'confidence','') !~ '^[1-5]$'
     or coalesce(p_responses->>'scheduleFit','') not in ('good','too_much','too_little')
     or char_length(coalesce(p_responses->>'notes','')) > 1000 then raise exception 'invalid_responses'; end if;
  insert into public.journey_assessments (campaign_id, user_id, checkpoint_day, responses) values (c.id, uid, p_checkpoint_day, p_responses)
  on conflict (campaign_id, checkpoint_day) do update set responses = excluded.responses;
  if p_checkpoint_day = 3 then insert into public.user_achievements (user_id, achievement_key) values (uid, 'readiness_review') on conflict do nothing; end if;
  perform internal.audit(uid, 'checkpoint_reviewed', 'campaign', c.id::text, jsonb_build_object('day', p_checkpoint_day));
  return internal.mutation(uid);
end $$;

-- =====================================================================================
-- Workouts -> eligible day credit -> XP  (replaces the 000500 version; same signature)
-- =====================================================================================
create or replace function public.complete_workout(
  p_idempotency_key uuid, p_activity_type text, p_started_at timestamptz, p_duration_seconds int,
  p_distance_m numeric, p_rpe int, p_notes text, p_local_day date, p_timezone text)
returns jsonb language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare
  uid uuid := internal.require_user();
  v_today date; v_session uuid; camp public.user_campaigns; v_rec int; v_next int; ps public.planned_sessions; v_total int; v_last date;
  v_xp int := 0; v_coins int := 0; v_new_level int; a jsonb; v_before_level int; v_reason text; v_label text;
  v_extra jsonb := '[]'; side jsonb; idx int; v_qualified_now boolean := false; v_week int;
begin
  perform internal.lock_player(uid);
  begin v_today := (internal.clock_now() at time zone p_timezone)::date; exception when others then raise exception 'invalid_timezone'; end;
  if p_local_day > v_today or p_local_day < v_today - 1 then raise exception 'local_day_out_of_range'; end if;
  if p_started_at > internal.clock_now() + interval '5 minutes' then raise exception 'started_in_future'; end if;

  -- replay: same key => same result, no new rewards (also dedupes offline drafts)
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

  select * into camp from public.user_campaigns where user_id = uid and state = 'active' for update;
  if found then
    select total_qualifying_days into v_total from public.campaign_templates where id = camp.template_id;
    select program_day into v_rec from public.campaign_day_records where campaign_id = camp.id and calendar_date_local = p_local_day;
    select max(calendar_date_local) into v_last from public.campaign_day_records where campaign_id = camp.id;
    -- at most one credit per local date, always in chronological order (travel/DST can't re-open an earlier date)
    if v_rec is null and (v_last is null or p_local_day > v_last) and camp.qualified_days < v_total then
      v_next := camp.qualified_days + 1;
      select * into ps from public.planned_sessions where campaign_id = camp.id and program_day = v_next and superseded_at is null;
      if found and internal.activity_matches(ps.spec->'primary', p_activity_type, p_duration_seconds) then
        v_reason := case when ps.spec->'checkpoint' <> 'null'::jsonb then 'checkpoint' when ps.session_type = 'recovery' then 'planned_recovery' else 'planned_training' end;
        insert into public.campaign_day_records (campaign_id, program_day, calendar_date_local, timezone, qualifying_activity_id, eligibility_reason, planned_session_id)
        values (camp.id, v_next, p_local_day, p_timezone, v_session, v_reason, ps.id);
        update public.user_campaigns set qualified_days = v_next, state = case when v_next >= v_total then 'completed' else 'active' end where id = camp.id;
        v_rec := v_next; v_qualified_now := true;
        a := internal.award_xp(uid, 'primary_quest', v_session, p_local_day);
        v_xp := v_xp + (a->>'xp')::int; v_coins := v_coins + (a->>'coins')::int;
        v_label := case
          when v_next >= v_total then 'Day ' || v_next || ' — journey complete'
          when v_next = 3 then 'Day 3 — readiness checkpoint reached'
          when v_next in (9,30,60,90,300) then 'Day ' || v_next || ' — promotion trial unlocked'
          else 'Day ' || v_next || ' complete' end;
        v_extra := v_extra || jsonb_build_array(jsonb_build_object('kind','campaign_day','amount',v_next,'label',v_label,'accessibleText','Program day '||v_next||' of '||v_total||' complete.'));
        if v_next = 1 then insert into public.user_achievements (user_id, achievement_key) values (uid, 'first_oath') on conflict do nothing; end if;
        if v_next = 3 then insert into public.user_achievements (user_id, achievement_key) values (uid, 'initiation_complete') on conflict do nothing; end if;
        perform internal.audit(uid, 'day_credited', 'campaign', camp.id::text, jsonb_build_object('day', v_next, 'reason', v_reason, 'localDay', p_local_day));
        -- weekly consistency milestone: 5 credited days in the same week, once per week
        select count(*) into v_week from public.campaign_day_records
         where campaign_id = camp.id and date_trunc('week', calendar_date_local::timestamp) = date_trunc('week', p_local_day::timestamp);
        if v_week >= 5 then
          a := internal.award_xp(uid, 'weekly_consistency', internal.det_uuid(camp.id::text || date_trunc('week', p_local_day::timestamp)::text), p_local_day);
          v_xp := v_xp + (a->>'xp')::int; v_coins := v_coins + (a->>'coins')::int;
        end if;
      end if;
    end if;

    -- side quests for the program day credited on this date (never from the session that just credited it)
    if v_rec is not null and not v_qualified_now then
      select * into ps from public.planned_sessions where campaign_id = camp.id and program_day = v_rec and superseded_at is null;
      idx := 0;
      for side in select * from jsonb_array_elements(coalesce(ps.spec->'side', '[]')) loop
        if side->>'type' <> 'reflection' and internal.activity_matches(side, p_activity_type, p_duration_seconds) then
          a := internal.award_xp(uid, 'side_quest', internal.det_uuid(camp.id::text || ':' || v_rec || ':side:' || idx), p_local_day);
          v_xp := v_xp + (a->>'xp')::int; v_coins := v_coins + (a->>'coins')::int;
        end if;
        idx := idx + 1;
      end loop;
    end if;
  end if;

  select level into v_new_level from public.profiles where user_id = uid;
  return jsonb_build_object('playerState', internal.player_state(uid),
    'newRewards', internal.reward_list(v_xp, v_coins, v_new_level > v_before_level, v_new_level, v_extra), 'duplicate', false);
end $$;

-- =====================================================================================
-- Read model (replaces the 000500 version; adds journey fields, keeps existing keys)
-- =====================================================================================
create or replace function public.get_command_center(p_local_date date)
returns jsonb language plpgsql stable security definer set search_path = public, internal, pg_temp as $$
declare
  uid uuid := internal.require_user(); camp public.user_campaigns; tpl public.campaign_templates; v_rec int; v_day int; ps public.planned_sessions;
  sides jsonb := '[]'; side jsonb; idx int := 0; done boolean; next_rank text; boss jsonb; v_upcoming jsonb; v_pending jsonb;
begin
  select * into camp from public.user_campaigns where user_id = uid order by created_at desc limit 1;
  if found then
    select * into tpl from public.campaign_templates where id = camp.template_id;
    select program_day into v_rec from public.campaign_day_records where campaign_id = camp.id and calendar_date_local = p_local_date;
    v_day := coalesce(v_rec, least(camp.qualified_days + 1, tpl.total_qualifying_days));
    select * into ps from public.planned_sessions where campaign_id = camp.id and program_day = v_day and superseded_at is null;
    for side in select * from jsonb_array_elements(coalesce(ps.spec->'side','[]')) loop
      done := exists (select 1 from public.xp_ledger where user_id = uid and source_type = 'side_quest' and source_id = internal.det_uuid(camp.id::text || ':' || v_day || ':side:' || idx))
              or (side->>'type' = 'reflection' and exists (select 1 from public.stoic_reflections where user_id = uid and local_date = p_local_date));
      sides := sides || jsonb_build_array(side || jsonb_build_object('completed', done, 'index', idx));
      idx := idx + 1;
    end loop;
    select coalesce(jsonb_agg(spec order by program_day), '[]') into v_upcoming from (
      select spec, program_day from public.planned_sessions
       where campaign_id = camp.id and superseded_at is null and program_day > camp.qualified_days order by program_day limit 7) u;
    select coalesce(jsonb_agg(d order by d), '[]') into v_pending from unnest(array[3,9,30,60,90,300]) d
     where d <= camp.qualified_days and d <= tpl.total_qualifying_days
       and not exists (select 1 from public.journey_assessments ja where ja.campaign_id = camp.id and ja.checkpoint_day = d);
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
        'day', jsonb_build_object('title', ps.spec->>'title', 'description', ps.spec->>'description', 'focus', ps.session_type,
                                  'spec', jsonb_build_object('primary', ps.spec->'primary', 'theme', ps.spec->>'title', 'alternatives', ps.spec->'alternatives')),
        'sideQuests', sides,
        'templateKey', tpl.key, 'planName', tpl.name, 'tier', tpl.tier, 'startDate', camp.start_date, 'generation', camp.generation_version,
        'planInputs', camp.plan_inputs, 'session', ps.spec, 'upcoming', v_upcoming, 'pendingReviews', v_pending) end,
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
    'plannedSessions', coalesce((select jsonb_agg(to_jsonb(s)) from public.planned_sessions s where user_id = uid), '[]'),
    'planChanges', coalesce((select jsonb_agg(to_jsonb(x)) from public.journey_plan_changes x where user_id = uid), '[]'),
    'goals', coalesce((select jsonb_agg(to_jsonb(g)) from public.player_goals g where user_id = uid), '[]'),
    'assessments', coalesce((select jsonb_agg(to_jsonb(a)) from public.journey_assessments a where user_id = uid), '[]'),
    'workouts', coalesce((select jsonb_agg(to_jsonb(w)) from public.workout_sessions w where user_id = uid), '[]'),
    'measurements', coalesce((select jsonb_agg(to_jsonb(m)) from public.body_measurements m where user_id = uid), '[]'),
    'reflections', coalesce((select jsonb_agg(to_jsonb(r)) from public.stoic_reflections r where user_id = uid), '[]'),
    'xpLedger', coalesce((select jsonb_agg(to_jsonb(x)) from public.xp_ledger x where user_id = uid), '[]'),
    'coinLedger', coalesce((select jsonb_agg(to_jsonb(x)) from public.coin_ledger x where user_id = uid), '[]'),
    'rankHistory', coalesce((select jsonb_agg(to_jsonb(x)) from public.user_rank_history x where user_id = uid), '[]'),
    'challenges', coalesce((select jsonb_agg(to_jsonb(c)) from public.user_challenges c where user_id = uid), '[]'),
    'attempts', coalesce((select jsonb_agg(to_jsonb(a)) from public.challenge_attempts a where user_id = uid), '[]'));
end $$;

-- =====================================================================================
-- Backfill: every existing journey (original nine-day campaign) gets plan inputs and its exact original sessions.
-- No ledger rows are touched, so no XP is repeated; credited days keep their dates.
-- =====================================================================================
do $$
declare c record; v_today date;
begin
  for c in select uc.*, coalesce(s.timezone, 'UTC') tz, p.primary_focus from public.user_campaigns uc
             join public.profiles p on p.user_id = uc.user_id left join public.user_settings s on s.user_id = uc.user_id
            where not exists (select 1 from public.planned_sessions ps where ps.campaign_id = uc.id) loop
    v_today := (internal.clock_now() at time zone c.tz)::date;
    update public.user_campaigns set
      timezone = c.tz,
      start_date = coalesce((select min(calendar_date_local) from public.campaign_day_records where campaign_id = c.id), (c.start_at at time zone c.tz)::date),
      plan_inputs = coalesce(plan_inputs, internal.legacy_plan_inputs(c.preferences, c.primary_focus))
    where id = c.id;
    perform internal.store_sessions(c.id, c.user_id, 1, internal.legacy_sessions(c.id,
      case when exists (select 1 from public.campaign_day_records where campaign_id = c.id and calendar_date_local = v_today) then v_today + 1 else v_today end));
    update public.campaign_day_records r set eligibility_reason = 'legacy',
      planned_session_id = (select id from public.planned_sessions ps where ps.campaign_id = r.campaign_id and ps.program_day = r.program_day and ps.superseded_at is null)
     where r.campaign_id = c.id and r.eligibility_reason is null;
    insert into public.journey_plan_changes (campaign_id, user_id, kind, to_template_key, to_days, effective_program_day, effective_date, to_generation, reason)
    select c.id, c.user_id, 'migrated', t.key, t.total_qualifying_days, c.qualified_days + 1, v_today, 1, 'Backfilled from the original nine-day campaign'
      from public.campaign_templates t where t.id = c.template_id;
  end loop;
end $$;

-- =====================================================================================
-- RLS + grants
-- =====================================================================================
revoke all on public.session_archetypes, public.planned_sessions, public.journey_plan_changes, public.player_goals, public.journey_assessments from anon, authenticated;

alter table public.session_archetypes enable row level security;
create policy session_archetypes_read on public.session_archetypes for select to authenticated using (true);
grant select on public.session_archetypes to authenticated;

do $$ declare t text; begin
  foreach t in array array['planned_sessions','journey_plan_changes','player_goals','journey_assessments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = auth.uid())', t || '_own_read', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

revoke all on function
  public.create_journey(text,jsonb,jsonb,jsonb,text), public.preview_journey(text,jsonb,int), public.extend_journey(text,boolean),
  public.update_journey_plan(jsonb,text), public.add_player_goal(jsonb), public.set_goal_status(uuid,text),
  public.record_checkpoint_assessment(int,jsonb)
from public, anon, authenticated;
grant execute on function
  public.create_journey(text,jsonb,jsonb,jsonb,text), public.preview_journey(text,jsonb,int), public.extend_journey(text,boolean),
  public.update_journey_plan(jsonb,text), public.add_player_goal(jsonb), public.set_goal_status(uuid,text),
  public.record_checkpoint_assessment(int,jsonb)
to authenticated;
