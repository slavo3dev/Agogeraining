-- Campaign templates, user campaigns, training records.
create table public.campaign_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  rules_version int not null references public.game_rule_versions(id),
  lifecycle text not null default 'live' check (lifecycle in ('draft','live','retired')),
  total_qualifying_days int not null check (total_qualifying_days > 0)
);

create table public.campaign_day_templates (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.campaign_templates(id) on delete cascade,
  day_number int not null check (day_number > 0),
  focus text not null,
  title text not null,
  description text not null default '',
  quest_spec jsonb not null,   -- {primary:{type,allowedActivityTypes[],minDurationSeconds}, side:[...], alternatives:{...}}
  unique (template_id, day_number)
);

create table public.quest_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  type text not null check (type in ('strength','cardio','mobility','skill','logging','reflection','recovery','custom')),
  default_xp int not null check (default_xp >= 0),
  validation_schema jsonb not null default '{}'
);

create table public.user_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  template_id uuid not null references public.campaign_templates(id),
  qualified_days int not null default 0 check (qualified_days >= 0),
  start_at timestamptz not null default now(),
  paused_at timestamptz,
  state text not null default 'active' check (state in ('active','paused','completed')),
  baseline jsonb not null default '{}',
  preferences jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- one in-progress campaign per user
create unique index user_campaigns_one_open on public.user_campaigns (user_id) where state in ('active','paused');
create trigger user_campaigns_touch before update on public.user_campaigns for each row execute function internal.touch_updated_at();

create table public.exercise_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  movement_pattern text not null,
  category text not null check (category in ('strength','cardio','mobility')),
  equipment text not null,
  instructions text not null,
  alternatives text[] not null default '{}'
);

create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  activity_type text not null
);
create table public.workout_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.workout_templates(id) on delete cascade,
  exercise_id uuid not null references public.exercise_catalog(id),
  item_order int not null,
  target_sets int,
  target_reps int,
  unique (template_id, item_order)
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  activity_type text not null check (activity_type in ('running','walking','hiking','cycling','swimming','strength','mobility','obstacle','recovery','custom')),
  started_at timestamptz not null,
  completed_at timestamptz not null default now(),
  local_day date not null,
  timezone text not null,
  status text not null default 'completed' check (status in ('completed')),   -- drafts live on-device until accepted
  duration_seconds int not null check (duration_seconds between 0 and 43200),
  distance_m numeric check (distance_m is null or distance_m between 0 and 500000),
  rpe int check (rpe is null or rpe between 1 and 10),
  notes text check (notes is null or char_length(notes) <= 2000),
  origin text not null default 'manual' check (origin in ('manual','healthkit','health_connect')),
  external_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, origin, external_id)       -- idempotency + import dedupe, scoped per user/source
);
create index workout_sessions_user_completed_idx on public.workout_sessions (user_id, completed_at desc);
create index workout_sessions_user_day_idx on public.workout_sessions (user_id, local_day);

create table public.workout_exercise_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id uuid not null references public.exercise_catalog(id),
  set_order int not null,
  reps int check (reps >= 0),
  load_kg numeric check (load_kg >= 0),
  duration_seconds int check (duration_seconds >= 0),
  distance_m numeric check (distance_m >= 0),
  unique (session_id, set_order)
);

create table public.campaign_day_records (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.user_campaigns(id) on delete cascade,
  program_day int not null check (program_day > 0),
  calendar_date_local date not null,
  timezone text not null,
  status text not null default 'qualified' check (status in ('qualified')),
  qualified_at timestamptz not null default now(),
  qualifying_activity_id uuid references public.workout_sessions(id) on delete set null,
  unique (campaign_id, program_day),
  unique (campaign_id, calendar_date_local)
);
create index campaign_day_records_week_idx on public.campaign_day_records (campaign_id, calendar_date_local);

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  measured_at timestamptz not null,
  metric_type text not null check (metric_type in ('weight','body_fat','waist','pushups_max','grip')),
  value numeric not null check (value > 0),
  unit text not null check (unit in ('kg','cm','percent','reps')),   -- canonical units only; converted on write
  source text not null default 'manual',
  method text,
  created_at timestamptz not null default now()
);
create index body_measurements_user_measured_idx on public.body_measurements (user_id, measured_at desc);

create table public.personal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  metric text not null,
  amount numeric not null,
  unit text not null,
  achieved_at timestamptz not null,
  evidence_level text not null default 'self_reported' check (evidence_level in ('self_reported','device_recorded','admin_reviewed'))
);
create index personal_records_user_idx on public.personal_records (user_id, metric, achieved_at desc);

create table public.stoic_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  local_date date not null,
  prompt_key text not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique (user_id, local_date)
);
