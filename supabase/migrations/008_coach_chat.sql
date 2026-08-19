-- Migration 008 — the chat coach
--
-- Run in the Supabase SQL editor after 007.
--
-- Two things: a daily per-user cap on chat messages, and somewhere for the coach to record
-- how many sets it suggested for an exercise it staged.

-- ---------------------------------------------------------------- usage cap
--
-- Mirrors `resolver_usage` from 002: one counter row per user per day, incremented by the
-- edge function under the service-role key.
--
-- Why a daily cap where the resolver has a monthly one: resolve calls cache forever, so a
-- lifter's cost curve flattens to nothing once their vocabulary is described. A chat turn is
-- personal and never repeats, so nothing amortises and the only brake is the cap itself. A
-- daily window also fails gracefully — someone who burns through it is training again
-- tomorrow, rather than locked out for three more weeks.

create table if not exists coach_chat_usage (
  user_id uuid not null references auth.users on delete cascade,
  day     date not null default (now() at time zone 'utc')::date,
  calls   integer not null default 0,
  primary key (user_id, day)
);

alter table coach_chat_usage enable row level security;

-- Read-only for the owner, matching resolver_usage. There is deliberately no insert or
-- update policy: the count is written by the edge function with the service-role key, and a
-- client that could write its own usage row could reset its own cap.
drop policy if exists "read own chat usage" on coach_chat_usage;
create policy "read own chat usage" on coach_chat_usage
  for select using (auth.uid() = user_id);

-- Atomic increment. `upsert` from the client library cannot express `calls = calls + 1`, and
-- read-then-write would lose a message under two concurrent sends. Returns the new count so
-- the caller can report remaining budget without a second round trip.
create or replace function bump_coach_chat_usage(target_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  insert into coach_chat_usage (user_id, day, calls)
  values (target_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day)
  do update set calls = coach_chat_usage.calls + 1
  returning calls into n;
  return n;
end $$;

-- ------------------------------------------------- resolver cap (bug fix)
--
-- `resolver_usage` has been correct since 002 — (user_id, day, calls). The edge function was
-- not: it counted rows filtered on a `created_at` column that does not exist, and inserted a
-- `phrase` column that does not exist while omitting the not-null `day`.
--
-- Both halves failed. The read errored so `count` came back undefined and `undefined >= 400`
-- was false; the write failed with its error unchecked. The result was a cap that had never
-- once fired, and a usage table that had never once been written to. Verified against the
-- live database before changing anything: the schema was right, the code was wrong.
--
-- The function is what was missing. Same shape as the chat counter below it.

create or replace function bump_resolver_usage(target_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  insert into resolver_usage (user_id, day, calls)
  values (target_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day)
  do update set calls = resolver_usage.calls + 1
  returning calls into n;
  return n;
end $$;

-- ------------------------------------------------------------- target sets
--
-- How many sets the coach suggested per exercise when it staged a session, as
-- {variant_id: count}.
--
-- This is a UI count and nothing more: ExerciseBlock renders that many empty "Log set"
-- prompts instead of one. It never becomes a workout_sets row. Weight, reps and RIR are
-- user-entered, always — a fabricated set would corrupt the trend line this whole app exists
-- to keep honest, and it would do it in a way the lifter could not see.

alter table workout_sessions add column if not exists target_sets jsonb;
