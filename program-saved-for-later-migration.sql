-- Миграція для функції "Зберегти програму" (Збережено на потім) —
-- людина сама позначає програму зіркою в кабінеті, незалежно від
-- enrollments/progress. Виконати в Supabase → SQL Editor одним
-- запитом.
--
-- Exact mirror of guide-saved-for-later-migration.sql's shape (see that
-- file's own comment) — same plain-toggle pattern as every other
-- content_item_*/guide_*/program_* saved-state table in this schema:
-- saved means a row exists, unsaved means it's deleted. program_id is
-- plain text (no FK — most programs live in data/programs.ts as static
-- demo data, same reasoning as guide_id); program_title is denormalized
-- for the same reason guide_title is.

create table public.program_saved_for_later (
  id uuid primary key default gen_random_uuid(),
  program_id text not null,
  program_title text,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (program_id, user_id)
);

create index program_saved_for_later_user_idx on public.program_saved_for_later (user_id, created_at desc);

alter table public.program_saved_for_later enable row level security;

create policy "users manage their own saved programs"
  on public.program_saved_for_later for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
