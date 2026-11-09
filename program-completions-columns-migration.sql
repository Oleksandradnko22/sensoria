-- Run this in the Supabase SQL editor.
-- Adds the richer report fields to content_program_completions
-- (time invested, mood dynamics, reflection excerpts, module/item
-- checklist) — only needed if you already ran
-- program-completions-migration.sql earlier.

alter table public.content_program_completions
  add column if not exists invested_minutes integer not null default 0,
  add column if not exists mood_before_avg real,
  add column if not exists mood_after_avg real,
  add column if not exists reflection_excerpts jsonb not null default '[]'::jsonb,
  add column if not exists modules_snapshot jsonb not null default '[]'::jsonb;
