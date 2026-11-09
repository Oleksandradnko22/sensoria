-- Серверна історія сесій медитацій (скільки разів, коли востаннє,
-- коли завершено) — щоб лічильник жив між пристроями. Без змагальності.
-- Виконати в Supabase → SQL Editor одним запитом. Безпечно: нова таблиця.
-- Без цього SQL застосунок працює як раніше (історія лише на пристрої).

create table if not exists public.meditation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Стабільний id медитації (data/meditations.ts), не позиція.
  meditation_id text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists meditation_sessions_user_idx
  on public.meditation_sessions (user_id, meditation_id, started_at desc);

alter table public.meditation_sessions enable row level security;

create policy "users manage their own meditation sessions"
  on public.meditation_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
