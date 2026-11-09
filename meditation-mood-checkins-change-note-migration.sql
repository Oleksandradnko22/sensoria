-- Run this in Supabase SQL Editor (after the earlier
-- meditation-mood-checkins-migration.sql).
-- Adds the "Що змінилося?" answer, asked right after the post-
-- meditation intensity number.

alter table public.meditation_mood_checkins
  add column change_note text;
