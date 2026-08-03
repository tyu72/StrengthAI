-- StrengthAI — Supabase schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).
--
-- Design notes:
--   * Weights are stored in KILOGRAMS everywhere. Display unit is a user preference.
--   * Exercise variants are per-user. There is no global exercise catalogue — the
--     resolver builds each lifter's registry from what they actually log.
--   * Row Level Security is on for every table: a row is only visible to its owner.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- profiles

create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text,
  unit        text not null default 'lb' check (unit in ('kg','lb')),
  diet_phase  text check (diet_phase in ('cutting','maintaining','bulking')),
  created_at  timestamptz not null default now()
);

-- create a profile row automatically when someone signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------- variants

-- One row per distinct movement + modifier combination this user has logged.
-- `mods` is a sorted text array: ['cuff','single arm'] — sorting makes the unique
-- index meaningful, so the resolver can rely on the database to dedupe.
create table if not exists exercise_variants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  base        text not null,
  mods        text[] not null default '{}',
  muscle      text,
  body_part   text check (body_part in ('chest','back','arms','legs')),
  source_text text,                       -- what the lifter originally typed
  uses        integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, base, mods)
);

-- ---------------------------------------------------------------- sessions

create table if not exists workout_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  name           text,
  status         text not null default 'active' check (status in ('active','completed')),
  template_id    uuid,
  exercise_order uuid[] not null default '{}',
  notes          text,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz
);

create index if not exists idx_sessions_user_time
  on workout_sessions (user_id, started_at desc);

-- ---------------------------------------------------------------- sets

create table if not exists workout_sets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  session_id  uuid not null references workout_sessions on delete cascade,
  variant_id  uuid not null references exercise_variants on delete cascade,
  weight_kg   numeric(7,2) not null,
  reps        integer not null,
  rir         numeric(3,1),
  rpe         numeric(3,1),
  set_number  integer not null default 1,
  logged_at   timestamptz not null default now()
);

-- the index the trend queries actually use
create index if not exists idx_sets_variant_time
  on workout_sets (user_id, variant_id, logged_at);
create index if not exists idx_sets_session
  on workout_sets (session_id);

-- ---------------------------------------------------------------- readiness

create table if not exists readiness_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  session_id  uuid references workout_sessions on delete cascade,
  sleep_hours numeric(3,1),
  energy      numeric(3,1),
  soreness    numeric(3,1),
  stress      numeric(3,1),
  score       numeric(3,1),
  created_at  timestamptz not null default now(),
  unique (session_id)
);

-- ---------------------------------------------------------------- flags

-- Fatigue / injury advisories raised by the coach.
create table if not exists pattern_flags (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  session_id       uuid references workout_sessions on delete set null,
  variant_ids      uuid[] not null default '{}',
  kind             text not null,          -- rpe_trend | rep_decline | readiness_trend | systemic_fatigue
  status           text not null default 'pending'
                   check (status in ('pending','pending_exclusion','dismissed','accepted','excluded')),
  is_medical       boolean not null default false,
  explanation      text,
  recommendation   text,
  reasoning        text,
  user_reply       text,
  ai_response      text,
  exclusion_reason text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_flags_user_status
  on pattern_flags (user_id, status, created_at desc);

-- ---------------------------------------------------------------- templates

create table if not exists workout_templates (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  name           text not null default 'New workout',
  exercise_order uuid[] not null default '{}',
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- goals

create table if not exists strength_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  variant_id    uuid not null references exercise_variants on delete cascade,
  target_kg     numeric(7,2) not null,
  target_reps   integer not null default 5,
  status        text not null default 'active' check (status in ('active','achieved','archived')),
  achieved_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists muscle_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  body_part     text not null check (body_part in ('chest','back','arms','legs')),
  weekly_target integer not null default 0,
  unique (user_id, body_part)
);

-- ---------------------------------------------------------------- coach output

-- A recommendation the lifter accepted, staged onto their next session.
create table if not exists coach_plans (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  variant_id     uuid not null references exercise_variants on delete cascade,
  target_load_kg numeric(7,2),
  note           text,
  created_at     timestamptz not null default now(),
  consumed_at    timestamptz,
  unique (user_id, variant_id)
);

create table if not exists coach_recommendations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  kind        text not null check (kind in ('plateau','program','tip')),
  variant_id  uuid references exercise_variants on delete cascade,
  title       text,
  body        text,
  actions     jsonb not null default '[]',
  status      text not null default 'open' check (status in ('open','accepted','dismissed')),
  created_at  timestamptz not null default now()
);

create table if not exists weekly_reports (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  week_start     date not null,
  week_end       date not null,
  sessions_count integer not null default 0,
  sets_count     integer not null default 0,
  avg_readiness  numeric(3,1),
  avg_sleep      numeric(3,1),
  avg_rpe        numeric(3,1),
  volume_kg      numeric(10,2),
  recap          text,
  created_at     timestamptz not null default now(),
  unique (user_id, week_start)
);

-- ---------------------------------------------------------------- helpers

-- Bump a variant's use count without a read-modify-write round trip.
create or replace function increment_variant_use(variant uuid)
returns void language sql security definer set search_path = public as $$
  update exercise_variants
     set uses = uses + 1
   where id = variant and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------- security
--
-- Every table: you can only see and touch your own rows. Without this, anyone with
-- your anon key could read everyone's data — the anon key ships in the app bundle,
-- so RLS is the actual security boundary, not a nicety.

alter table profiles              enable row level security;
alter table exercise_variants     enable row level security;
alter table workout_sessions      enable row level security;
alter table workout_sets          enable row level security;
alter table readiness_entries     enable row level security;
alter table pattern_flags         enable row level security;
alter table workout_templates     enable row level security;
alter table strength_goals        enable row level security;
alter table muscle_goals          enable row level security;
alter table coach_plans           enable row level security;
alter table coach_recommendations enable row level security;
alter table weekly_reports        enable row level security;

drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

do $$
declare t text;
begin
  foreach t in array array[
    'exercise_variants','workout_sessions','workout_sets','readiness_entries',
    'pattern_flags','workout_templates','strength_goals','muscle_goals',
    'coach_plans','coach_recommendations','weekly_reports'
  ] loop
    execute format('drop policy if exists "own rows" on %I', t);
    execute format(
      'create policy "own rows" on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t
    );
  end loop;
end $$;
