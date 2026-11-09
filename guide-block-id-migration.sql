-- Привʼязка відповідей у гайдах до id блоку, а не до його позиції
-- (чек-листи й самооцінка "Було/Стало"). Після цього можна безпечно додавати
-- й переставляти блоки в гайді — чужі збережені відповіді не поїдуть.
-- Виконати в Supabase → SQL Editor одним запитом. Нічого не видаляє:
-- існуючі рядки лише отримують block_id. Код працює і до цього SQL
-- (тоді просто використовує позицію), тож порядок не критичний.

-- 1. Нова колонка + дозволити порожній block_index
alter table public.guide_checklist_checks add column if not exists block_id text;
alter table public.guide_self_assessments add column if not exists block_id text;
alter table public.guide_checklist_checks alter column block_index drop not null;
alter table public.guide_self_assessments alter column block_index drop not null;

-- 2. Заповнити block_id для вже збережених відповідей гайду
--    "what-to-do-when-anxiety-hits" (id блоку за його поточною позицією).
update public.guide_checklist_checks set block_id = case block_index
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
where guide_id = 'what-to-do-when-anxiety-hits' and block_id is null;

update public.guide_self_assessments set block_id = case block_index
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
where guide_id = 'what-to-do-when-anxiety-hits' and block_id is null;

-- 3. Замінити унікальність за позицією на унікальність за block_id
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where contype = 'u'
      and conrelid in ('public.guide_checklist_checks'::regclass, 'public.guide_self_assessments'::regclass)
      and pg_get_constraintdef(oid) ilike '%block_index%'
  loop
    execute (
      select format('alter table %s drop constraint %I', conrelid::regclass, conname)
      from pg_constraint where conname = c limit 1
    );
  end loop;
end $$;

create unique index if not exists guide_checklist_checks_block_id_uidx
  on public.guide_checklist_checks (guide_id, block_id, item_index, user_id);
create unique index if not exists guide_self_assessments_block_id_uidx
  on public.guide_self_assessments (guide_id, block_id, phase, user_id);
