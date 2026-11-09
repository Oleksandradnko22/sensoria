-- Миграция для функции "Що я помітив? Що змінилося?" (Ваші спостереження)
-- Выполнить в Supabase → SQL Editor одним запросом.

create table public.content_item_reflections (
  id uuid primary key default gen_random_uuid(),
  content_item_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_id text,
  program_title text,
  item_title text,
  note text not null,
  created_at timestamptz not null default now()
);

create index content_item_reflections_user_idx on public.content_item_reflections (user_id, created_at desc);

alter table public.content_item_reflections enable row level security;

create policy "users manage their own reflections"
  on public.content_item_reflections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
