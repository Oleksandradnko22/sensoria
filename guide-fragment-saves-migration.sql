-- Миграція для функції "Зберегти конкретну частину" (гайди) —
-- зберігається не весь гайд, а один конкретний пункт/фрагмент тексту.
-- Виконати в Supabase → SQL Editor одним запитом.
--
-- guide_id — plain text, no FK (guides.ts is static demo data, not a
-- real table, same reasoning as every content_item_* table in
-- schema.sql). guide_title/fragment_text are denormalized for the same
-- reason those tables denormalize program_title/item_title — "Мої
-- збереження" must be able to show what was actually saved even if
-- guides.ts changes later. fragment_index (not the text itself) is
-- what the unique constraint keys on — two different steps could
-- coincidentally share text, but never the same index within the same
-- guide.

create table public.guide_fragment_saves (
  id uuid primary key default gen_random_uuid(),
  guide_id text not null,
  fragment_index integer not null,
  fragment_text text not null,
  guide_title text,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (guide_id, fragment_index, user_id)
);

create index guide_fragment_saves_user_idx on public.guide_fragment_saves (user_id, created_at desc);

alter table public.guide_fragment_saves enable row level security;

create policy "users manage their own guide fragment saves"
  on public.guide_fragment_saves for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
