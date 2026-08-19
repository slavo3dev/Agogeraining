-- Identity, preferences, versioned rules, ranks, ops tables.
create extension if not exists pgcrypto;

create schema if not exists internal;           -- trusted helpers; never exposed through the API
revoke all on schema internal from public;

create or replace function internal.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ---------- versioned game rules ----------
create table public.game_rule_versions (
  id int primary key,
  effective_at timestamptz not null,
  rules jsonb not null,
  checksum text not null,
  created_at timestamptz not null default now()
);

create table public.rank_definitions (
  rank_key text primary key,
  ordinal int not null unique check (ordinal >= 0),
  name text not null,
  note text not null default ''
);

create table public.rank_requirements (
  rank_key text not null references public.rank_definitions(rank_key),
  rules_version int not null references public.game_rule_versions(id),
  min_qualified_days int not null check (min_qualified_days >= 0),
  min_lifetime_xp int not null check (min_lifetime_xp >= 0),
  requires_trial boolean not null,
  min_evidence_level text not null check (min_evidence_level in ('self_reported','device_recorded','admin_reviewed')),
  primary key (rank_key, rules_version)
);

-- ---------- identity ----------
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 32),
  avatar_id text not null,
  rank_key text not null default 'agoge_trainee' references public.rank_definitions(rank_key),
  level int not null default 1 check (level between 1 and 100),   -- cached; ledger is the truth
  lifetime_xp bigint not null default 0 check (lifetime_xp >= 0),  -- cached; ledger is the truth
  coins bigint not null default 0 check (coins >= 0),
  age_band text check (age_band in ('18-29','30-39','40-49','50-59','60+')),
  primary_focus text not null check (primary_focus in ('strength','cardio','hybrid','mobility','general_health')),
  secondary_focuses text[] not null default '{}',
  is_demo boolean not null default false,                          -- demo accounts never enter real leaderboards
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function internal.touch_updated_at();

-- XP is monotonic: ordinary play can never reduce it.
create or replace function internal.forbid_xp_decrease() returns trigger language plpgsql as $$
begin
  if new.lifetime_xp < old.lifetime_xp then raise exception 'lifetime_xp cannot decrease'; end if;
  return new;
end $$;
create trigger profiles_xp_monotonic before update on public.profiles for each row execute function internal.forbid_xp_decrease();

create table public.user_settings (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  timezone text not null,
  unit_system text not null default 'metric' check (unit_system in ('metric','imperial')),
  profile_visibility text not null default 'private' check (profile_visibility in ('private','friends','public')),
  notifications_enabled boolean not null default false,
  social_sharing_enabled boolean not null default false,
  analytics_opt_in boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  sound_enabled boolean not null default true,
  haptics_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger user_settings_touch before update on public.user_settings for each row execute function internal.touch_updated_at();

create table public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  type text not null check (type in ('terms','privacy','notifications','social_sharing','health_access','analytics')),
  version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index user_consents_user_idx on public.user_consents (user_id, type, granted_at desc);

create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios','android')),
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now()
);

-- ---------- operations ----------
create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id, created_at);
create index audit_events_actor_idx on public.audit_events (actor_id, created_at);

create table public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  status text not null check (status in ('implemented','feature_flagged','planned')),
  description text not null default ''
);
create table public.app_config (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
create table public.entitlements (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  key text not null,
  active boolean not null default false,
  expires_at timestamptz,
  primary key (user_id, key)
);
