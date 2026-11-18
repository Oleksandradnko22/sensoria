-- Повторна відправка фіскальних чеків (ПРРО) кожні 5 хвилин і щоденні задачі фінансів.
-- Без цього чек, який не пройшов з першої спроби, лишається в черзі назавжди.
-- Виконати один раз у Supabase SQL Editor, замінивши ВАШ_CRON_SECRET на значення секрету CRON_SECRET
-- (Edge Functions → Secrets). Повторний запуск безпечний: старі розклади з тими самими назвами замінюються.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobname) from cron.job where jobname in ('finance-fiscal-tick', 'finance-run-jobs');

-- чеки: кожні 5 хвилин (повтори через 1 / 5 / 15 / 60 / 180 / 360 хв)
select cron.schedule(
  'finance-fiscal-tick',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://gvetalfctsojvwucxmeo.supabase.co/functions/v1/finance',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'ВАШ_CRON_SECRET'),
       body := '{"action":"fiscalTick"}'::jsonb
     ) $$
);

-- фінанси: щодня о 03:00 UTC (пропущені вебхуки, звірка з випискою, акти, черга чеків)
select cron.schedule(
  'finance-run-jobs',
  '0 3 * * *',
  $$ select net.http_post(
       url := 'https://gvetalfctsojvwucxmeo.supabase.co/functions/v1/finance',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'ВАШ_CRON_SECRET'),
       body := '{"action":"runJobs"}'::jsonb
     ) $$
);
