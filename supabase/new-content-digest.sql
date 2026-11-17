-- Розсилка «Нові матеріали» без даних про стан (docs/consent-legal-spec.md, 4.5). Ідемпотентно.
-- Запускати після legal-gate-migration.sql. Потім: задеплоїти notify-new-content (з --no-verify-jwt)
-- і створити щоденний запуск (блок у кінці файлу, вставити свій CRON_SECRET).

-- Опубліковані матеріали чекають тижневого листа тут (не з таблиць тесту).
create table if not exists public.new_content_queue (
  content_id uuid primary key references public.content (id) on delete cascade,
  queued_at timestamptz not null default now()
);
alter table public.new_content_queue enable row level security;  -- лише service role

-- Коли учаснику востаннє надіслано лист «Нові матеріали» (не частіше разу на 7 днів).
create table if not exists public.new_content_digest_log (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  last_sent_at timestamptz not null
);
alter table public.new_content_digest_log enable row level security;  -- лише service role

-- Теми, які учасник обрав сам («Мені цікаві теми»). Порожньо = про всі нові матеріали.
create or replace function public.set_new_content_topics(p_topics text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := array['stress', 'anxiety', 'burnout', 'relationships', 'motivation', 'selfEsteem'];
  clean text[];
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select coalesce(array_agg(distinct t), '{}') into clean from unnest(coalesce(p_topics, '{}')) t where t = any (allowed);
  update profiles
    set notification_prefs = jsonb_set(coalesce(notification_prefs, '{}'::jsonb), '{topics}', to_jsonb(clean), true)
    where id = auth.uid();
end $$;
grant execute on function public.set_new_content_topics(text[]) to authenticated;

-- ─── Щоденний запуск (виконати один раз; замінити ВАШ_CRON_SECRET на значення секрету CRON_SECRET) ───
-- select cron.schedule(
--   'new-content-digest',
--   '0 9 * * *',
--   $$ select net.http_post(
--        url := 'https://gvetalfctsojvwucxmeo.supabase.co/functions/v1/notify-new-content',
--        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'ВАШ_CRON_SECRET'),
--        body := '{"action":"digest"}'::jsonb
--      ) $$
-- );
