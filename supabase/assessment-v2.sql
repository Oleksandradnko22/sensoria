-- Опитування стану, версія 2 (21.11.2026): версія анкети й деталі результату (вплив на життя, блок підтримки,
-- підказка іншого стану, рівень другого обраного стану) — у результаті й в історії.
-- Ідемпотентно; після assessment-history.sql. Старі рядки лишаються з version = 1.
alter table public.assessment_results add column if not exists version smallint not null default 1;
alter table public.assessment_results add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.assessment_history add column if not exists version smallint not null default 1;
alter table public.assessment_history add column if not exists details jsonb not null default '{}'::jsonb;

create or replace function public.assessment_to_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.assessment_history (profile_id, primary_state, intensity, primary_score, secondary_state, supporting_patterns, completed_at, version, details)
  values (new.profile_id, new.primary_state, new.intensity, new.primary_score, new.secondary_state, new.supporting_patterns, new.completed_at, new.version, new.details);
  return null;
end;
$$;

notify pgrst, 'reload schema';
