-- Строки зберігання з Політики конфіденційності (розділ «Строки зберігання») — автоматичне видалення
-- (повторна звірка 22.11.2026; юрист: «строк у Політиці — обіцянка, зберігати довше не можна»).
-- Щоночі о 03:40 UTC. Ідемпотентно (можна запускати повторно); потрібне розширення pg_cron.
--
--   одноразові коди .................. 24 години (доказ підпису кодом лишається в legal_consents.otp_verified_at)
--   технічні дані сеансів входу ...... 12 місяців від останнього входу з пристрою
--   журнал відкриття матеріалів (IP) . 1 825 днів
--   хеш пошти закритого акаунта ...... 1 825 днів від закриття
--   скарги й звернення ............... 3 роки після закриття: текст і дані людей видаляються, лишається знеособлений
--                                      рядок (дата, вид, причина чи категорія, рішення) у complaint_stats
--
-- Не тут (див. Порядок обробки ПД, розділ 2, і щорічний перегляд у п. 7):
--   акаунт + 14 днів — функція purge-deleted-accounts; дані про стан — при відкликанні згоди (purge_health_data) і
--   без згоди за 30 днів (health-data-retention.sql); документи про освіту — видаляються під час рішення в адмінці
--   (рішення — не пізніше 30 днів); фінансові записи й згоди — строк за законом, видаляються вручну раз на рік.

-- знеособлена статистика скарг і звернень (без людей і текстів)
create table if not exists public.complaint_stats (
  id bigserial primary key,
  source text not null,          -- з якої таблиці
  kind text,                     -- причина скарги або категорія звернення
  decision text,                 -- статус на момент закриття
  created_at timestamptz not null,
  archived_at timestamptz not null default now()
);
alter table public.complaint_stats enable row level security; -- лише service role / SQL-редактор

create or replace function public.purge_retention()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  delete from public.legal_otp where sent_at < now() - interval '24 hours';
  delete from public.user_sessions where last_seen_at < now() - interval '12 months';
  delete from public.content_access_log where created_at < now() - interval '1825 days';
  delete from public.closed_participants where closed_at < now() - interval '1825 days';

  -- скарги й звернення: 3 роки після закриття. Дата закриття окремо не зберігається, тож рахуємо від подання з запасом
  -- на розгляд: 3 роки й 30 днів.
  for t in select * from (values
    ('message_reports', 'reason'), ('content_reports', 'reason'), ('content_comment_reports', 'reason'),
    ('author_post_comment_reports', 'reason'), ('entity_reports', 'reason'), ('support_tickets', 'category')
  ) as v(tbl, kind_col) loop
    if to_regclass('public.' || t.tbl) is null then continue; end if;
    begin
      execute format(
        'with gone as (delete from public.%I where status is distinct from %L and created_at < now() - interval ''3 years 30 days''
           returning %I::text as kind, status::text as decision, created_at)
         insert into public.complaint_stats (source, kind, decision, created_at)
         select %L, kind, decision, created_at from gone',
        t.tbl, 'open', t.kind_col, t.tbl);
    exception when undefined_column then
      null; -- таблиця без status / created_at: не чіпаємо, перевірити вручну під час щорічного перегляду
    end;
  end loop;
end;
$$;
revoke all on function public.purge_retention() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'purge-retention';
select cron.schedule('purge-retention', '40 3 * * *', $$ select public.purge_retention() $$);
