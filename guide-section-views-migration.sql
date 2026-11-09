-- Миграція для реального прогресу читання гайду за розділами
-- (2026-09-09, за спецом Sasha — "Ви переглянули X із Y розділів"
-- замість штучного %). Виконати в Supabase → SQL Editor одним запитом.
--
-- Той самий підхід, що і в guide_checklist_checks/guide_saved_for_later:
-- guide_id — простий text (guides.ts — статичні демо-дані), плаский
-- toggle (рядок існує → розділ переглянуто), RLS дозволяє людині
-- керувати лише своїми рядками. section_index відповідає індексу
-- "сторінки" в GuideBlockRenderer.tsx (кожен heading = нова сторінка).

create table public.guide_section_views (
  id uuid primary key default gen_random_uuid(),
  guide_id text not null,
  section_index integer not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (guide_id, section_index, user_id)
);

create index guide_section_views_user_idx on public.guide_section_views (user_id, guide_id);

alter table public.guide_section_views enable row level security;

create policy "users manage their own guide section views"
  on public.guide_section_views for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
