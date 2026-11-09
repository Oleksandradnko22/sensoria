-- Миграція для «Запитати автора» на гайдах (2026-09-09, за спецом
-- Sasha) — id→автор мапінг для гайдів, точна копія вже існуючої
-- meditation_authors (schema.sql) — дає реальний шлях "хто справжній
-- автор цього гайду" без потреби, щоб гайди стали повноцінними рядками
-- в таблиці content. Виконати в Supabase → SQL Editor одним запитом.

create table public.guide_authors (
  guide_id text primary key,
  author_id uuid not null references public.profiles (id) on delete cascade
);

alter table public.guide_authors enable row level security;

-- Так само нешкідливо читати, як і meditation_authors — просто мапінг
-- id→id, без персональних даних.
create policy "guide_authors readable by signed-in users"
  on public.guide_authors for select
  using (auth.uid() is not null);
