-- Migration 002 — AI resolver: shared alias cache, usage cap, variant provenance
--
-- Run in the Supabase SQL editor after schema.sql.
--
-- The AI is a fallback, not the primary path. Every phrase it resolves is cached here so
-- the same description never costs a second model call. High-confidence answers are
-- SHARED (user_id null) so the app teaches itself across everyone who uses it; shaky ones
-- stay private to the lifter who triggered them.

create table if not exists exercise_aliases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete cascade,  -- null = shared by everyone
  shared      boolean not null default false,
  phrase      text not null,                                  -- normalised: lowercase, single-spaced
  base        text not null,
  mods        text[] not null default '{}',                    -- sorted, matching variant lookups
  muscle      text,
  body_part   text check (body_part in ('chest','back','arms','legs')),
  note        text,                                            -- the loading explanation, cached with it
  confidence  text not null default 'high' check (confidence in ('high','low')),
  source      text not null default 'ai' check (source in ('ai','manual')),
  created_at  timestamptz not null default now()
);

-- One row per phrase per owner. Postgres treats NULLs as distinct in a unique index, so
-- the shared row (user_id null) needs its own partial unique index.
create unique index if not exists idx_alias_user_phrase
  on exercise_aliases (user_id, phrase) where user_id is not null;
create unique index if not exists idx_alias_shared_phrase
  on exercise_aliases (phrase) where user_id is null;
create index if not exists idx_alias_lookup on exercise_aliases (phrase);

alter table exercise_aliases enable row level security;

-- Readable if it's shared or yours. Only the service role (the Edge Function) writes,
-- so there is no insert/update policy for users at all.
drop policy if exists "read shared or own" on exercise_aliases;
create policy "read shared or own" on exercise_aliases
  for select using (user_id is null or auth.uid() = user_id);

-- ---------------------------------------------------------------- usage cap

create table if not exists resolver_usage (
  user_id uuid not null references auth.users on delete cascade,
  day     date not null,
  calls   integer not null default 0,
  primary key (user_id, day)
);

alter table resolver_usage enable row level security;

drop policy if exists "read own usage" on resolver_usage;
create policy "read own usage" on resolver_usage
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------- provenance

-- So the UI can be honest about a variant whose loading note was inferred by a model
-- rather than known, and so low-confidence resolutions can be reviewed later.
alter table exercise_variants
  add column if not exists resolved_by text
  check (resolved_by in ('dictionary','ai','manual'));

alter table exercise_variants
  add column if not exists load_note text;

alter table exercise_variants
  add column if not exists confidence text
  check (confidence in ('high','low'));
