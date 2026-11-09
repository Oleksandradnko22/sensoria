-- Миграция для функции "Практика після уроку" ("Спробуйте зараз")
-- Выполнить в Supabase → SQL Editor одним запросом.

-- 1) Новая колонка в content_items — хранит опциональную практику урока
alter table public.content_items
  add column if not exists practice jsonb;

-- 2) Таблица ответов участников на практику (по одному ответу на человека,
-- повторная отправка перезаписывает предыдущий)
create table public.content_item_practice_responses (
  id uuid primary key default gen_random_uuid(),
  content_item_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  response jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (content_item_id, user_id)
);

create index content_item_practice_responses_item_idx on public.content_item_practice_responses (content_item_id);

alter table public.content_item_practice_responses enable row level security;

create policy "users manage their own practice responses"
  on public.content_item_practice_responses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
