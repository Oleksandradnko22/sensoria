-- Стабільна ідентичність у гайдах: збережені фрагменти і прогрес по розділах
-- привʼязуються до id блоку (id заголовка розділу), а не до позиції.
-- Продовження guide-block-id-migration.sql (відповіді/чек-листи/шкали).
-- Виконати в Supabase → SQL Editor одним запитом. Нічого не видаляє:
-- існуючі рядки лише отримують ідентифікатор. Код працює і до цього SQL
-- (тоді користується позицією), тож порядок не критичний.
--
-- Історія не стирається: якщо блок чи розділ прибрали з гайду, рядки
-- залишаються в таблицях; інтерфейс їх просто не показує і не рахує.

-- 1. Нові колонки; позиція стає необовʼязковою
alter table public.guide_fragment_saves add column if not exists fragment_block_id text;
alter table public.guide_fragment_saves alter column fragment_index drop not null;
alter table public.guide_section_views add column if not exists section_id text;
alter table public.guide_section_views alter column section_index drop not null;

-- 2. Заповнити id для вже збережених рядків гайду "what-to-do-when-anxiety-hits"
update public.guide_fragment_saves set fragment_block_id = case fragment_index
    when 0 then 'h-check-in'
    when 1 then 't-check-in'
    when 2 then 'c-now'
    when 3 then 'h-what-happens'
    when 4 then 't-what-happens'
    when 5 then 'f-chain'
    when 6 then 'co-not-diagnosis'
    when 7 then 'h-reaction'
    when 8 then 'c-reactions'
    when 9 then 'h-try'
    when 10 then 't-try'
    when 11 then 's-before'
    when 12 then 'p-grounding'
    when 13 then 'h-changed'
    when 14 then 't-changed'
    when 15 then 's-after'
    when 16 then 'h-returns'
    when 17 then 'd-returns'
    when 18 then 'co-support'
    when 19 then 'h-next'
    when 20 then 'r-next'
    when 21 then 'h-observation'
    when 22 then 'n-observation'
    when 23 then 'h-plan'
    when 24 then 'a-plan'
    when 25 then 'h-closing'
    when 26 then 't-closing'
    when 27 then 'co-optional-next'
  end
where guide_id = 'what-to-do-when-anxiety-hits' and fragment_block_id is null;

update public.guide_section_views set section_id = case section_index
    when 0 then 'h-check-in'
    when 1 then 'h-what-happens'
    when 2 then 'h-reaction'
    when 3 then 'h-try'
    when 4 then 'h-changed'
    when 5 then 'h-returns'
    when 6 then 'h-next'
    when 7 then 'h-observation'
    when 8 then 'h-plan'
    when 9 then 'h-closing'
  end
where guide_id = 'what-to-do-when-anxiety-hits' and section_id is null;

-- 3. Унікальність за id замість позиції
do $$
declare r record;
begin
  for r in
    select conrelid::regclass as tbl, conname from pg_constraint
    where contype = 'u'
      and conrelid in ('public.guide_fragment_saves'::regclass, 'public.guide_section_views'::regclass)
      and (pg_get_constraintdef(oid) ilike '%fragment_index%' or pg_get_constraintdef(oid) ilike '%section_index%')
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

create unique index if not exists guide_fragment_saves_block_id_uidx
  on public.guide_fragment_saves (guide_id, fragment_block_id, user_id);
create unique index if not exists guide_section_views_section_id_uidx
  on public.guide_section_views (guide_id, section_id, user_id);
