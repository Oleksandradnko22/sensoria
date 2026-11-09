-- Remember which step of the program wizard the author stopped on, so reopening a draft continues from there.
-- Run ONCE in the Supabase SQL editor; safe to re-run.
alter table public.content add column if not exists draft_step smallint check (draft_step between 1 and 20);
