-- Дозволяє оцінку 0 у "Було/Стало" (шкала гайду 0–10).
-- Раніше CHECK приймав лише 1–10, тому 0 не зберігалась.
-- Виконати в Supabase → SQL Editor. Безпечно: існуючі рядки (1–10) не змінюються.

do $$
declare c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.guide_self_assessments'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%score%';
  if c is not null then
    execute format('alter table public.guide_self_assessments drop constraint %I', c);
  end if;
end $$;

alter table public.guide_self_assessments
  add constraint guide_self_assessments_score_check check (score between 0 and 10);
