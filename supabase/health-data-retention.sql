-- Дані про емоційний стан без чинної згоди health_data — docs/consent-legal-spec.md,
-- розділ 4: нові записи без згоди база й так не приймає; старі зберігаються 30 днів, щоб людина могла дати згоду,
-- завантажити копію або видалити їх сама; за 7 днів до строку — попередження в кабінеті; потім — автоматичне видалення.
-- Початок відліку: перше прийняття Угоди учасника, але не раніше 21.11.2026 (день запуску цього правила) — нікого не
-- позбавляємо 30 днів. Ідемпотентно; після health-consent.sql. Розклад — pg_cron, щодня о 03:30 UTC.

create or replace function public.has_health_data(p_uid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare t record; found boolean;
begin
  for t in select * from (values
    ('assessment_results', 'profile_id'), ('assessment_history', 'profile_id'),
    ('content_item_mood_checkins', 'user_id'), ('content_module_mood_checkins', 'user_id'), ('meditation_mood_checkins', 'user_id'),
    ('content_item_reflections', 'user_id'), ('content_item_practice_responses', 'user_id'),
    ('guide_self_assessments', 'user_id'), ('guide_notes', 'user_id')
  ) as v(tbl, col) loop
    if to_regclass('public.' || t.tbl) is not null then
      execute format('select exists (select 1 from public.%I where %I = $1)', t.tbl, t.col) into found using p_uid;
      if found then return true; end if;
    end if;
  end loop;
  return false;
end $$;
revoke execute on function public.has_health_data(uuid) from public, anon, authenticated;

-- коли дані без згоди буде видалено (null — видаляти нічого: згода є або даних немає)
create or replace function public.health_data_deadline(p_uid uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case
    when p_uid is null or public.has_current_consent(p_uid, 'health_data') or not public.has_health_data(p_uid) then null
    else greatest(
      coalesce((select min(accepted_at) from legal_consents where user_id = p_uid and document = 'participant_agreement'), now()),
      timestamptz '2026-11-21 00:00:00+02'
    ) + interval '30 days'
  end
$$;
revoke execute on function public.health_data_deadline(uuid) from public, anon, authenticated;

-- для кабінету: лише свій стан
create or replace function public.my_health_data_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('deadline', public.health_data_deadline(auth.uid()))
$$;
revoke all on function public.my_health_data_status() from public, anon;
grant execute on function public.my_health_data_status() to authenticated;

-- «Видалити зараз» — сам учасник
create or replace function public.purge_my_health_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.purge_health_data(auth.uid());
end $$;
revoke all on function public.purge_my_health_data() from public, anon;
grant execute on function public.purge_my_health_data() to authenticated;

-- щоденне видалення тих, у кого строк минув
create or replace function public.purge_unconsented_health_data() returns int
language plpgsql security definer set search_path = public as $$
declare u uuid; n int := 0;
begin
  for u in select id from profiles where role = 'participant' loop
    if public.health_data_deadline(u) <= now() then
      perform public.purge_health_data(u);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.purge_unconsented_health_data() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.unschedule(jobname) from cron.job where jobname = 'purge-unconsented-health-data';
select cron.schedule('purge-unconsented-health-data', '30 3 * * *', $$ select public.purge_unconsented_health_data() $$);
