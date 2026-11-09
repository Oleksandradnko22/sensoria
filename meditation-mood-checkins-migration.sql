-- Run this in Supabase SQL Editor.
-- Adds the optional "Як ви почуваєтесь зараз?" before/after tension
-- check-in around a meditation session. One row PER SESSION (not
-- overwritten like content_item_mood_checkins) — a meditation is
-- reusable, so every fresh start gets its own before/after pair,
-- building real history over time.

create table public.meditation_mood_checkins (
  id uuid primary key default gen_random_uuid(),
  meditation_id text not null,
  meditation_title text,
  user_id uuid not null references public.profiles (id) on delete cascade,
  states text[] not null default '{}',
  before_value numeric,
  after_value numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meditation_mood_checkins_user_idx on public.meditation_mood_checkins (user_id, created_at desc);

alter table public.meditation_mood_checkins enable row level security;

create policy "users manage their own meditation mood checkins"
  on public.meditation_mood_checkins for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
