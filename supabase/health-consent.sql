-- Дані про емоційний стан — лише за окремою згодою (docs/consent-legal-spec.md, розділ 4). Ідемпотентно.
-- Запускати після legal-gate-migration.sql.
-- Без чинної згоди health_data база не приймає нові записи тесту, настрою, нотаток і відповідей у вправах.
-- Відкликання згоди видаляє ці дані (purge_health_data). Раніше збережені дані без згоди автоматично не видаляються.

do $$
declare
  t record;
begin
  for t in select * from (values
    ('assessment_results', 'profile_id'),
    ('assessment_history', 'profile_id'),
    ('content_item_mood_checkins', 'user_id'),
    ('content_module_mood_checkins', 'user_id'),
    ('meditation_mood_checkins', 'user_id'),
    ('content_item_reflections', 'user_id'),
    ('content_item_practice_responses', 'user_id'),
    ('guide_self_assessments', 'user_id'),
    ('guide_notes', 'user_id')
  ) as v(tbl, col) loop
    if to_regclass('public.' || t.tbl) is not null then
      execute format('drop policy if exists "health consent required" on public.%I', t.tbl);
      execute format('create policy "health consent required" on public.%I as restrictive for insert to authenticated with check (public.has_current_consent(auth.uid(), %L))', t.tbl, 'health_data');
      execute format('drop policy if exists "health consent required to change" on public.%I', t.tbl);
      execute format('create policy "health consent required to change" on public.%I as restrictive for update to authenticated using (true) with check (public.has_current_consent(auth.uid(), %L))', t.tbl, 'health_data');
    end if;
  end loop;
end $$;

-- Видалити всі дані про емоційний стан користувача (під час відкликання згоди).
create or replace function public.purge_health_data(p_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('public.assessment_results') is not null then delete from assessment_results where profile_id = p_uid; end if;
  if to_regclass('public.assessment_history') is not null then delete from assessment_history where profile_id = p_uid; end if;
  if to_regclass('public.content_item_mood_checkins') is not null then delete from content_item_mood_checkins where user_id = p_uid; end if;
  if to_regclass('public.content_module_mood_checkins') is not null then delete from content_module_mood_checkins where user_id = p_uid; end if;
  if to_regclass('public.meditation_mood_checkins') is not null then delete from meditation_mood_checkins where user_id = p_uid; end if;
  if to_regclass('public.content_item_reflections') is not null then delete from content_item_reflections where user_id = p_uid; end if;
  if to_regclass('public.content_item_practice_responses') is not null then delete from content_item_practice_responses where user_id = p_uid; end if;
  if to_regclass('public.guide_self_assessments') is not null then delete from guide_self_assessments where user_id = p_uid; end if;
  if to_regclass('public.guide_notes') is not null then delete from guide_notes where user_id = p_uid; end if;
end $$;
revoke execute on function public.purge_health_data(uuid) from public, anon, authenticated;

-- Відкликання: для даних про стан — ще й видалення самих даних (запис згоди лишається як доказ законності обробки).
create or replace function public.withdraw_consent(p_document text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_document not in ('health_data', 'marketing_email') then raise exception 'not_withdrawable'; end if;
  update legal_consents set withdrawn_at = now()
    where user_id = auth.uid() and document = p_document and withdrawn_at is null;
  if p_document = 'health_data' then
    perform public.purge_health_data(auth.uid());
  end if;
end $$;
grant execute on function public.withdraw_consent(text) to authenticated;
