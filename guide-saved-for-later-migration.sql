-- Миграція для функції "Додати гайд в обране" (Збережено на потім) —
-- людина сама позначає гайд зіркою в кабінеті, не чекаючи, поки він
-- потрапить в enrollments. Виконати в Supabase → SQL Editor одним
-- запитом.
--
-- Same plain-toggle shape as content_item_bookmarks/
-- content_item_saved_practices: saved means a row exists, unsaved means
-- it's deleted. guide_id is plain text (no FK — guides.ts is static
-- demo data, same as every other content_item_*/guide_* table);
-- guide_title is denormalized for the same reason those tables
-- denormalize their own titles — showing what was saved shouldn't
-- depend on guides.ts never changing.

create table public.guide_saved_for_later (
  id uuid primary key default gen_random_uuid(),
  guide_id text not null,
  guide_title text,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (guide_id, user_id)
);

create index guide_saved_for_later_user_idx on public.guide_saved_for_later (user_id, created_at desc);

alter table public.guide_saved_for_later enable row level security;

create policy "users manage their own saved guides"
  on public.guide_saved_for_later for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
