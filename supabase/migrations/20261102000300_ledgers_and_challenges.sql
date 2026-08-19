-- Append-only ledgers, rank history, cosmetics, challenges.
create table public.xp_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  source_type text not null check (source_type in ('primary_quest','side_quest','reflection','personal_record','weekly_consistency','challenge_pass','promotion_boss')),
  source_id uuid not null,
  rule_version int not null references public.game_rule_versions(id),
  xp_delta int not null check (xp_delta >= 0),
  local_day date not null,
  awarded_at timestamptz not null default now(),
  unique (user_id, source_type, source_id, rule_version)    -- idempotency
);
create index xp_ledger_user_awarded_idx on public.xp_ledger (user_id, awarded_at);
create index xp_ledger_user_day_idx on public.xp_ledger (user_id, local_day);

create table public.coin_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  rule_version int not null references public.game_rule_versions(id),
  coin_delta int not null check (coin_delta >= 0),
  awarded_at timestamptz not null default now(),
  unique (user_id, source_type, source_id, rule_version)
);
create index coin_ledger_user_awarded_idx on public.coin_ledger (user_id, awarded_at);

-- Ledgers are append-only. Deleting rows is only allowed once the owning profile is gone (account deletion).
create or replace function internal.ledger_append_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then raise exception '% is append-only', tg_table_name; end if;
  if tg_op = 'DELETE' and exists (select 1 from public.profiles where user_id = old.user_id) then
    raise exception '% is append-only', tg_table_name;
  end if;
  return old;
end $$;
create trigger xp_ledger_append_only before update or delete on public.xp_ledger for each row execute function internal.ledger_append_only();
create trigger coin_ledger_append_only before update or delete on public.coin_ledger for each row execute function internal.ledger_append_only();

create table public.user_rank_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  rank_key text not null references public.rank_definitions(rank_key),
  campaign_day int,
  challenge_attempt_id uuid,
  awarded_at timestamptz not null default now(),
  rules_version int not null references public.game_rule_versions(id),
  unique (user_id, rank_key)                                   -- a rank is earned once
);

create table public.achievement_definitions (
  key text primary key, title text not null, description text not null
);
create table public.user_achievements (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  achievement_key text not null references public.achievement_definitions(key),
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_key)
);

create table public.cosmetic_items (
  key text primary key,
  name text not null,
  slot text not null check (slot in ('helmet','shield','cloak','spear','crest','title')),
  unlock_rank_key text references public.rank_definitions(rank_key),
  coin_price int check (coin_price is null or coin_price >= 0)
);
create table public.user_inventory (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  item_key text not null references public.cosmetic_items(key),
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_key)
);
create table public.user_avatar_loadout (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  slot text not null,
  item_key text not null,
  primary key (user_id, slot),
  foreign key (user_id, item_key) references public.user_inventory(user_id, item_key) on delete cascade
);

create table public.challenge_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  metric text not null,
  direction text not null check (direction in ('higher_better','lower_better')),
  default_unit text not null,
  validation_type text not null default 'self_reported',
  min_prep_guidance text not null default '',
  active boolean not null default true
);

create table public.user_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  template_id uuid references public.challenge_templates(id),
  title text not null check (char_length(title) between 3 and 80),
  metric text not null,
  direction text not null check (direction in ('higher_better','lower_better')),
  baseline numeric check (baseline is null or baseline >= 0),
  target numeric not null check (target > 0),
  unit text not null check (unit in ('kg','lb','m','km','mi','s','min','h','reps')),
  start_date date not null default current_date,
  due_date date not null,
  evidence_method text not null default 'self_reported' check (evidence_method in ('self_reported')),
  pass_rule text not null default 'meet_target' check (pass_rule in ('meet_target','improve_on_baseline')),
  safety_notes text,
  visibility text not null default 'private' check (visibility in ('private','friends','squad')),
  linked_rank_key text references public.rank_definitions(rank_key),
  state text not null default 'draft' check (state in ('draft','active','attempted','submitted','verified','passed','failed')),
  resolved_attempt_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date >= start_date)
);
create index user_challenges_user_state_idx on public.user_challenges (user_id, state);
create index user_challenges_user_rank_idx on public.user_challenges (user_id, linked_rank_key);
create trigger user_challenges_touch before update on public.user_challenges for each row execute function internal.touch_updated_at();

create table public.challenge_attempts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.user_challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  attempted_at timestamptz not null default now(),
  value numeric not null check (value >= 0),
  unit text not null,
  evidence_type text not null default 'self_reported' check (evidence_type in ('self_reported','device_recorded','admin_reviewed')),
  verification_status text not null default 'pending' check (verification_status in ('pending','accepted','needs_review','rejected')),
  reviewer_id uuid,
  review_reason text,
  idempotency_key uuid not null,
  unique (challenge_id, idempotency_key)
);
create index challenge_attempts_challenge_idx on public.challenge_attempts (challenge_id, attempted_at);
alter table public.user_challenges add constraint user_challenges_resolved_attempt_fk
  foreign key (resolved_attempt_id) references public.challenge_attempts(id) on delete set null;
alter table public.user_rank_history add constraint user_rank_history_attempt_fk
  foreign key (challenge_attempt_id) references public.challenge_attempts(id) on delete set null;

create table public.challenge_evidence (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.challenge_attempts(id) on delete cascade,
  private_storage_path text not null,
  media_type text not null check (media_type in ('image/jpeg','image/png','video/mp4')),
  source_record_id uuid
);
