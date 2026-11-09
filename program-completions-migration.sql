-- Run this in the Supabase SQL editor.
-- Adds the frozen "Підсумок програми" report snapshot table.

create table public.content_program_completions (
  id uuid primary key default gen_random_uuid(),
  program_id text not null,
  program_title text,
  user_id uuid not null references public.profiles (id) on delete cascade,
  completed_at timestamptz not null default now(),
  modules_done integer not null default 0,
  modules_total integer not null default 0,
  items_done integer not null default 0,
  items_total integer not null default 0,
  practices_count integer not null default 0,
  reflections_count integer not null default 0,
  unique (program_id, user_id)
);

alter table public.content_program_completions enable row level security;

create policy "users view their own program completions"
  on public.content_program_completions for select
  using (auth.uid() = user_id);

create policy "users record their own program completions"
  on public.content_program_completions for insert
  with check (auth.uid() = user_id);
