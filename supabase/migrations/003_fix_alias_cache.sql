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
