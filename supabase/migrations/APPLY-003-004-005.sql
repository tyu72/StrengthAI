-- Paste this whole file into the Supabase SQL editor and run it.
-- Migrations 003, 004 and 005 in order. 002 is already applied.
-- Generated for the AI-first resolver swap.

-- ==================== 003_fix_alias_cache.sql ====================
-- Migration 003 — fix the alias cache write
--
-- Run in the Supabase SQL editor after 002.
--
-- Bug this fixes: 002 created two PARTIAL unique indexes (one for personal rows, one for
-- shared rows where user_id is null). Postgres cannot infer a partial index from
-- `ON CONFLICT (phrase, user_id)` without repeating its WHERE predicate, which supabase-js
-- cannot express — so every cache write failed and exercise_aliases stayed empty. The
-- resolver then paid the model again for phrases it had already resolved.
--
-- Fix: one plain unique index with NULLS NOT DISTINCT (Postgres 15+), so a null user_id
-- (a shared row) collides with itself the way a real value would.

drop index if exists idx_alias_user_phrase;
drop index if exists idx_alias_shared_phrase;

-- de-duplicate anything that slipped in before the constraint existed
delete from exercise_aliases a
  using exercise_aliases b
 where a.ctid > b.ctid
   and a.phrase = b.phrase
   and a.user_id is not distinct from b.user_id;

alter table exercise_aliases
  drop constraint if exists exercise_aliases_phrase_user_key;

alter table exercise_aliases
  add constraint exercise_aliases_phrase_user_key
  unique nulls not distinct (phrase, user_id);

-- ==================== 004_ai_first_resolver.sql ====================
-- Migration 004 — AI-first resolver
--
-- Run in the Supabase SQL editor after 002 and 003.
--
-- Three changes, all driven by the same shift: the model is now the authority on what an
-- exercise is, and it returns richer information than the old dictionary could.
--
--   1. Muscles, plural, with roles. Fatigue is not per-exercise, it is per-muscle — a bench
--      press stalls because the triceps absorbed eighteen sets across bench, dips and
--      pushdowns. Per-exercise analysis can never see that. Storing primary and secondary
--      muscles at resolve time is what makes cross-movement fatigue detection possible.
--
--   2. Wider body parts. chest/back/arms/legs filed delts under arms and had nowhere to put
--      core, which makes weekly volume dishonest for anyone training shoulders directly.
--
--   3. Alias cache carries muscles too, so a cache hit is as complete as a fresh call.

-- ---------------------------------------------------------------- body parts

alter table exercise_variants drop constraint if exists exercise_variants_body_part_check;
alter table exercise_variants
  add constraint exercise_variants_body_part_check
  check (body_part is null or body_part in ('chest','back','shoulders','arms','legs','core'));

alter table muscle_goals drop constraint if exists muscle_goals_body_part_check;
alter table muscle_goals
  add constraint muscle_goals_body_part_check
  check (body_part in ('chest','back','shoulders','arms','legs','core'));

-- ---------------------------------------------------------------- muscles

-- [{"name":"triceps","role":"primary"},{"name":"pectorals","role":"secondary"}]
--
-- jsonb rather than a join table on purpose: this is always read whole, alongside its
-- variant, and never queried across variants. A join table would be three more joins on
-- every trend query for no gain at personal scale.
alter table exercise_variants add column if not exists muscles jsonb not null default '[]';
alter table exercise_aliases  add column if not exists muscles jsonb not null default '[]';

-- `muscle` (singular) stays as the primary muscle's name, so existing screens keep working.
-- Backfill it into the new shape for anything resolved before this migration.
update exercise_variants
   set muscles = jsonb_build_array(jsonb_build_object('name', muscle, 'role', 'primary'))
 where muscles = '[]'::jsonb and muscle is not null and muscle <> '';

-- Index for "which variants train this muscle" — the query behind per-muscle volume.
create index if not exists idx_variants_muscles on exercise_variants using gin (muscles);

-- ---------------------------------------------------------------- provenance

-- 'seed' is deliberately absent. An earlier design pre-seeded the cache with hand-written
-- entries for common lifts; that reintroduced exactly the hand-written-guess problem this
-- rebuild exists to remove. The cache fills from real use instead, and because
-- high-confidence rows are shared, only the first lifter to describe a movement pays for it.
alter table exercise_variants drop constraint if exists exercise_variants_resolved_by_check;
alter table exercise_variants
  add constraint exercise_variants_resolved_by_check
  check (resolved_by is null or resolved_by in ('ai','manual'));

-- ---------------------------------------------------------------- cleanup

-- Variants resolved by the old dictionary carry tags it may have got wrong — the silent
-- merges this rebuild fixes. Mark them so the app can offer to re-resolve, rather than
-- deleting training history that is otherwise perfectly good.
update exercise_variants set resolved_by = 'manual' where resolved_by = 'dictionary';

-- Dictionary-era cache rows are worse than useless: they would keep serving the wrong
-- answer for free, forever, and no model call would ever correct them.
delete from exercise_aliases where source = 'dictionary' or source = 'seed';

-- ==================== 005_alias_body_part.sql ====================
-- Migration 005 — widen the alias cache's body_part too
--
-- Run in the Supabase SQL editor after 004.
--
-- Bug this fixes: 004 widened body_part to include 'shoulders' and 'core' on
-- exercise_variants and muscle_goals, but exercise_aliases kept the original
-- chest/back/arms/legs check from 002. The edge function writes body_part into that cache
-- (`resolve-exercise/index.ts`, the exercise_aliases upsert), so the first lateral raise or
-- ab wheel anyone resolved would violate the constraint, fail the cache write, and get
-- billed again on every single repeat — by every user, forever.
--
-- It fails quietly, too: the cache error is logged and the resolution is still returned, so
-- the app looks fine and only the bill shows it. Exactly the failure mode 003 was written
-- for, one table over.

alter table exercise_aliases drop constraint if exists exercise_aliases_body_part_check;
alter table exercise_aliases
  add constraint exercise_aliases_body_part_check
  check (body_part is null or body_part in ('chest','back','shoulders','arms','legs','core'));

