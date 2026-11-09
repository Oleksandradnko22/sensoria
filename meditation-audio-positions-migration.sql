-- Run this in Supabase SQL Editor.
-- Adds real "продовжити з місця зупинки" (resume) support for the new
-- meditation audio player — same shape as the existing
-- content_item_video_positions table, just keyed by meditation_id.

create table public.meditation_audio_positions (
  id uuid primary key default gen_random_uuid(),
  meditation_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  position_seconds numeric not null,
  duration_seconds numeric,
  updated_at timestamptz not null default now(),
  unique (meditation_id, user_id)
);

alter table public.meditation_audio_positions enable row level security;

create policy "users manage their own meditation audio positions"
  on public.meditation_audio_positions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
