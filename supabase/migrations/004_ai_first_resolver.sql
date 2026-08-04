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
