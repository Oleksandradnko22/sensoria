-- Миграція для функції "Закладки" (збереження конкретного уроку)
-- Виконати в Supabase → SQL Editor одним запитом.

create table public.content_item_bookmarks (
  id uuid primary key default gen_random_uuid(),
  content_item_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_id text,
  program_title text,
  item_title text,
  created_at timestamptz not null default now(),
  unique (content_item_id, user_id)
);

create index content_item_bookmarks_user_idx on public.content_item_bookmarks (user_id, created_at desc);

alter table public.content_item_bookmarks enable row level security;

create policy "users manage their own bookmarks"
  on public.content_item_bookmarks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
