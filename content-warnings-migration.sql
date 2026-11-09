-- Міграція для "Перед початком" (content warnings). Виконати в
-- Supabase → SQL Editor одним запитом.

alter table public.content_items
  add column if not exists content_warning text;

create table public.content_item_warning_acks (
  id uuid primary key default gen_random_uuid(),
  content_item_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (content_item_id, user_id)
);

alter table public.content_item_warning_acks enable row level security;

create policy "users manage their own warning acks"
  on public.content_item_warning_acks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
