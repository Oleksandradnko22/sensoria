-- Миграция для функції "Як ви себе почуваєте зараз?" (до/після уроку) +
-- відображення в "Ваші спостереження". Якщо ти вже виконувала попередню
-- версію цього файлу без полів program_id/program_title/item_title —
-- спочатку виконай "DROP TABLE public.content_item_mood_checkins;",
-- потім цей файл повністю.
-- Виконати в Supabase → SQL Editor одним запитом.

create table public.content_item_mood_checkins (
  id uuid primary key default gen_random_uuid(),
  content_item_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_id text,
  program_title text,
  item_title text,
  before_value smallint check (before_value between 1 and 10),
  after_value smallint check (after_value between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (content_item_id, user_id)
);

create index content_item_mood_checkins_item_idx on public.content_item_mood_checkins (content_item_id);

alter table public.content_item_mood_checkins enable row level security;

create policy "users manage their own mood checkins"
  on public.content_item_mood_checkins for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
