-- Серверне дзеркало прогресу проходження (раніше жив тільки в
-- localStorage браузера) — щоб прогрес не обнулявся на новому
-- пристрої/після очищення браузера. Виконати в Supabase → SQL Editor
-- одним запитом.

create table public.content_progress (
  id uuid primary key default gen_random_uuid(),
  content_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (content_id, user_id)
);

alter table public.content_progress enable row level security;

create policy "users manage their own content progress"
  on public.content_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
