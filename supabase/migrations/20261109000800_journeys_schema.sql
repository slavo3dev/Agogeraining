-- Choose Your Journey: plan horizons, versioned per-journey schedules, plan-change history, goals, checkpoint reviews.
-- Additive only. Existing tables keep their names and meaning:
--   campaign_templates   = plan templates (3/9/30/60/90/300)      user_campaigns       = player journeys
--   campaign_day_records = credited journey days (unique per journey+day and journey+local date)

-- Fixed weekly sport (e.g. Thursday soccer) is a first-class activity.
alter table public.workout_sessions drop constraint workout_sessions_activity_type_check;
alter table public.workout_sessions add constraint workout_sessions_activity_type_check
  check (activity_type in ('running','walking','hiking','cycling','swimming','strength','mobility','obstacle','recovery','sport','custom'));

-- ---------- plan templates ----------
alter table public.campaign_templates
  add column tier text not null default 'prep' check (tier in ('prep','campaign')),
  add column version int not null default 1 check (version > 0),
  add column description text not null default '';

-- Session content library (generated from packages/campaigns SESSION_LIBRARY).
create table public.session_archetypes (
  session_type text primary key,
  quest_type text not null check (quest_type in ('strength','cardio','mobility','skill','recovery','custom')),
  title text not null,
  description text not null,
  allowed_activity_types text[] not null,
  intensity text not null check (intensity in ('rest','easy','moderate','hard')),
  factor_pct int not null check (factor_pct between 0 and 200),
  fixed_minutes int check (fixed_minutes is null or fixed_minutes between 0 and 300),
  side jsonb not null default '[]',
  alternatives jsonb not null
);

-- ---------- journeys ----------
alter table public.user_campaigns
  add column timezone text,
  add column start_date date,
  add column plan_inputs jsonb,                       -- availability, sport days, equipment, limits, event date…
  add column goal_snapshot jsonb,
  add column generation_version int not null default 1 check (generation_version > 0);

alter table public.campaign_day_records
  add column eligibility_reason text check (eligibility_reason in ('planned_training','planned_recovery','checkpoint','legacy')),
  add column planned_session_id uuid;

-- Versioned generated schedule. A regeneration supersedes only rows after the last credited day.
create table public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.user_campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  generation_version int not null check (generation_version > 0),
  program_day int not null check (program_day > 0),
  scheduled_for date not null,                        -- projected date; the plan follows credited days, not the calendar
  phase text not null check (phase in ('preparation','base','build','peak','event','transition')),
  session_type text not null,
  intensity text not null check (intensity in ('rest','easy','moderate','hard')),
  planned_minutes int not null check (planned_minutes between 0 and 300),
  spec jsonb not null,                                -- full PlannedSession: primary/side quests, alternatives, exercises, checkpoint
  created_at timestamptz not null default now(),
  superseded_at timestamptz
);
create unique index planned_sessions_current on public.planned_sessions (campaign_id, program_day) where superseded_at is null;
create index planned_sessions_user_idx on public.planned_sessions (user_id, campaign_id, program_day);
alter table public.campaign_day_records add constraint campaign_day_records_session_fk
  foreign key (planned_session_id) references public.planned_sessions(id) on delete set null;

-- History is immutable: a planned session can only be superseded, and never once its day has been credited.
create or replace function internal.planned_sessions_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    -- only as part of account/journey deletion cascades
    if exists (select 1 from public.user_campaigns where id = old.campaign_id) and exists (select 1 from public.profiles where user_id = old.user_id) then
      raise exception 'planned_sessions are immutable';
    end if;
    return old;
  end if;
  if (to_jsonb(new) - 'superseded_at') is distinct from (to_jsonb(old) - 'superseded_at') or old.superseded_at is not null or new.superseded_at is null then
    raise exception 'planned_sessions are immutable';
  end if;
  if exists (select 1 from public.user_campaigns c where c.id = old.campaign_id and old.program_day <= c.qualified_days) then
    raise exception 'cannot_rewrite_credited_history';
  end if;
  return new;
end $$;
create trigger planned_sessions_immutable before update or delete on public.planned_sessions
  for each row execute function internal.planned_sessions_guard();

create table public.journey_plan_changes (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.user_campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  kind text not null check (kind in ('created','migrated','extended','plan_adjusted','rescheduled','paused','resumed')),
  from_template_key text,
  to_template_key text not null,
  from_days int,
  to_days int not null,
  effective_program_day int not null,
  effective_date date not null,
  from_generation int,
  to_generation int not null,
  reason text check (reason is null or char_length(reason) <= 300),
  applied_by uuid,
  created_at timestamptz not null default now()
);
create index journey_plan_changes_campaign_idx on public.journey_plan_changes (campaign_id, created_at);

create table public.player_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  campaign_id uuid references public.user_campaigns(id) on delete set null,
  title text not null check (char_length(title) between 3 and 80),
  metric text not null,
  direction text not null check (direction in ('higher_better','lower_better')),
  baseline numeric check (baseline is null or baseline >= 0),
  target numeric not null check (target > 0),
  unit text not null check (unit in ('kg','lb','m','km','mi','s','min','h','reps')),
  target_date date not null,
  status text not null default 'active' check (status in ('active','achieved','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index player_goals_user_idx on public.player_goals (user_id, status);
create trigger player_goals_touch before update on public.player_goals for each row execute function internal.touch_updated_at();

-- Checkpoint reviews (Day 3 readiness reflection; optional reviews at later checkpoints). Not physical tests.
create table public.journey_assessments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.user_campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  checkpoint_day int not null check (checkpoint_day in (3,9,30,60,90,300)),
  responses jsonb not null,
  created_at timestamptz not null default now(),
  unique (campaign_id, checkpoint_day)
);
