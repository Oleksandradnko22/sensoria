-- Міграція для функції "Повернутися пізніше" (відновлення відео з
-- позиції, де ви зупинились, замість початку). Виконати в Supabase →
-- SQL Editor одним запитом.

create table public.content_item_video_positions (
  id uuid primary key default gen_random_uuid(),
  content_item_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  position_seconds numeric not null,
  duration_seconds numeric,
  updated_at timestamptz not null default now(),
  unique (content_item_id, user_id)
);

alter table public.content_item_video_positions enable row level security;

create policy "users manage their own video positions"
  on public.content_item_video_positions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
