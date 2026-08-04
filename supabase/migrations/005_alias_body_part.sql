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
