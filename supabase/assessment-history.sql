-- «Ваш емоційний профіль» by the last 3 assessments. Run ONCE in the Supabase SQL editor; safe to re-run.
--
-- assessment_results keeps one (latest) row per person; every save there now also writes a line here, so the
-- profile can be built from the last 3 attempts and «Як змінювався ваш стан» shows a real history.
-- People read and add only their own lines; nobody edits or deletes them from the app.

create table if not exists public.assessment_history (
  id bigserial primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary_state text not null,
  intensity text not null,
  primary_score int not null,
  secondary_state text,
  supporting_patterns jsonb not null default '[]'::jsonb,
  completed_at timestamptz not null default now()
);
create index if not exists assessment_history_profile_idx on public.assessment_history (profile_id, completed_at desc);

alter table public.assessment_history enable row level security;
drop policy if exists "people read their own assessment history" on public.assessment_history;
create policy "people read their own assessment history" on public.assessment_history
  for select using (auth.uid() = profile_id);
revoke insert, update, delete on public.assessment_history from anon, authenticated;

-- every saved assessment becomes a history line (written by the database itself, so it cannot be skipped or faked)
create or replace function public.assessment_to_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.assessment_history (profile_id, primary_state, intensity, primary_score, secondary_state, supporting_patterns, completed_at)
  values (new.profile_id, new.primary_state, new.intensity, new.primary_score, new.secondary_state, new.supporting_patterns, new.completed_at);
  return null;
end;
$$;
drop trigger if exists assessment_to_history_trg on public.assessment_results;
create trigger assessment_to_history_trg
  after insert or update on public.assessment_results
  for each row execute function public.assessment_to_history();

-- the assessments already taken become the first history lines (once)
insert into public.assessment_history (profile_id, primary_state, intensity, primary_score, secondary_state, supporting_patterns, completed_at)
select r.profile_id, r.primary_state, r.intensity, r.primary_score, r.secondary_state, r.supporting_patterns, r.completed_at
  from public.assessment_results r
 where not exists (select 1 from public.assessment_history h where h.profile_id = r.profile_id);

notify pgrst, 'reload schema';
