-- Миграція для "Інтерактивних елементів" усередині гайду (2026-09-09,
-- за спецом Sasha) — три нові таблиці:
--   1. guide_checklist_checks — реально відмічені пункти чек-листа
--   2. guide_notes            — вільна замітка людини під конкретним
--                                блоком гайду ("Що я помітив/ла?")
--   3. guide_self_assessments — самооцінка 1–10 до/після ("Було/Стало")
-- Виконати в Supabase → SQL Editor одним запитом.
--
-- Той самий підхід, що і в guide_fragment_saves/guide_saved_for_later:
-- guide_id — простий text (guides.ts — статичні демо-дані, не таблиця),
-- block_index/item_index прив'язують запис до конкретного блоку
-- всередині guide.content, RLS дозволяє людині керувати лише своїми
-- рядками.

-- ── GUIDE CHECKLIST CHECKS ("Чек-лист" — реально відмічені пункти) ──
-- Плаский toggle: рядок існує → пункт відмічено, видалений → ні. Немає
-- сенсу зберігати "не відмічено" рядками — це той самий підхід, що і в
-- guide_saved_for_later.
create table public.guide_checklist_checks (
  id uuid primary key default gen_random_uuid(),
  guide_id text not null,
  block_index integer not null,
  item_index integer not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (guide_id, block_index, item_index, user_id)
);

create index guide_checklist_checks_user_idx on public.guide_checklist_checks (user_id, guide_id);

alter table public.guide_checklist_checks enable row level security;

create policy "users manage their own guide checklist checks"
  on public.guide_checklist_checks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── GUIDE NOTES ("Поле для замітки" — вільний текст під блоком) ──
-- Один запис на людину+гайд+блок — повторне збереження перезаписує
-- note_text (upsert), а не накопичує історію версій.
create table public.guide_notes (
  id uuid primary key default gen_random_uuid(),
  guide_id text not null,
  block_index integer not null,
  note_text text not null default '',
  user_id uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now(),
  unique (guide_id, block_index, user_id)
);

create index guide_notes_user_idx on public.guide_notes (user_id, guide_id);

alter table public.guide_notes enable row level security;

create policy "users manage their own guide notes"
  on public.guide_notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── GUIDE SELF ASSESSMENTS ("Самооцінка" 1–10, Було/Стало) ──
-- phase розрізняє "before"/"after" для того самого блоку — так одна
-- людина може мати окремо "Було: 8" і "Стало: 5" для однієї й тієї ж
-- пари блоків у гайді. Повторне проходження перезаписує phase (upsert).
create table public.guide_self_assessments (
  id uuid primary key default gen_random_uuid(),
  guide_id text not null,
  block_index integer not null,
  phase text not null check (phase in ('before', 'after')),
  score integer not null check (score between 1 and 10),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (guide_id, block_index, phase, user_id)
);

create index guide_self_assessments_user_idx on public.guide_self_assessments (user_id, guide_id);

alter table public.guide_self_assessments enable row level security;

create policy "users manage their own guide self-assessments"
  on public.guide_self_assessments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
