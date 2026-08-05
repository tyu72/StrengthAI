-- Migration 007 — joint actions replace the single movement pattern
--
-- Run in the Supabase SQL editor after 005. Supersedes 006 entirely; safe to run whether
-- or not 006 was applied.
--
-- Why this replaces 006: `pattern text` held one value from a list that mixed two different
-- taxonomies — trainer shorthand ("vertical push", "hip hinge") alongside anatomy
-- ("shoulder abduction"). That made it ambiguous and, worse, wrong: a machine shoulder press
-- is shoulder abduction AND elbow extension, so one value per lift cannot describe it.
--
-- Joint actions are anatomical and plural. They also aggregate the way fatigue actually
-- does: elbow extension accumulates across bench, dips and pushdowns whatever those lifts
-- are called, and an imbalance at a joint (all horizontal adduction, no horizontal
-- abduction) is invisible in per-muscle totals.

alter table exercise_variants drop column if exists pattern;
alter table exercise_aliases  drop column if exists pattern;
drop index if exists idx_variants_pattern;

alter table exercise_variants add column if not exists joint_actions text[] not null default '{}';
alter table exercise_aliases  add column if not exists joint_actions text[] not null default '{}';

-- No check constraint: the action list is prompt vocabulary that will grow, and 002's
-- body_part constraint is exactly how a widened list silently broke every cache write.
-- The edge function validates against JOINT_ACTIONS before writing; unknown values are
-- dropped rather than stored.

-- GIN, because every query is "which variants contain this action".
create index if not exists idx_variants_actions
  on exercise_variants using gin (joint_actions);
