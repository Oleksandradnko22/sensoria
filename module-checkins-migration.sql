-- Міграція для модульного чек-іну ("Перед тим як почнемо" / "Що
-- змінилося?"). Виконати в Supabase → SQL Editor одним запитом.

create table public.content_module_mood_checkins (
  id uuid primary key default gen_random_uuid(),
  module_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_id text,
  program_title text,
  module_title text,
  before_value text check (before_value in ('calm', 'neutral', 'hard')),
  after_value text check (after_value in ('easier', 'same', 'harder')),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (module_id, user_id)
);

alter table public.content_module_mood_checkins enable row level security;

create policy "users manage their own module check-ins"
  on public.content_module_mood_checkins for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
