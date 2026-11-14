-- E-mail to the admin about everything that needs attention. Run ONCE in the Supabase SQL editor (safe to re-run),
-- AFTER supabase/feeds.sql, and deploy the function: npx --yes supabase functions deploy admin-alerts --no-verify-jwt
--
-- How it works: each event writes one line into admin_alert_outbox (a trigger on the table where it happens); the
-- outbox pings the admin-alerts function (pg_net), which sends the waiting lines by e-mail to every admin
-- (profiles.is_admin, owner role) and marks them sent. The ping carries no data, so calling the function from outside
-- can only deliver what is already waiting — never send anything else, to anyone else.
--
-- What is reported: support tickets, author verification requests, refund requests, every kind of report (materials,
-- messages, comments, posts, authors, reviews), a material sent to moderation, a «Спільнота» post hidden automatically
-- (crisis words — marked urgent, 3 reports, photo check), a new author account.

create extension if not exists pg_net with schema extensions;

create table if not exists public.admin_alert_outbox (
  id bigserial primary key,
  kind text not null,
  title text not null,
  details text,
  urgent boolean not null default false,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists admin_alert_outbox_pending_idx on public.admin_alert_outbox (id) where sent_at is null;
alter table public.admin_alert_outbox enable row level security; -- nobody reads it from the app; the function uses the service role

-- one line into the outbox
create or replace function public.admin_alert(p_kind text, p_title text, p_details text default null, p_urgent boolean default false)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.admin_alert_outbox (kind, title, details, urgent) values (p_kind, p_title, left(p_details, 600), p_urgent);
$$;
revoke all on function public.admin_alert(text, text, text, boolean) from public, anon, authenticated;

-- the outbox wakes the sender (once per statement, so a batch is one e-mail)
create or replace function public.admin_alert_ping()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://gvetalfctsojvwucxmeo.supabase.co/functions/v1/admin-alerts',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return null;
exception when others then
  return null; -- an e-mail problem must never break what the person was doing
end;
$$;
drop trigger if exists admin_alert_ping on public.admin_alert_outbox;
create trigger admin_alert_ping after insert on public.admin_alert_outbox for each statement execute function public.admin_alert_ping();

-- the sender takes the waiting lines (and only once, even if two pings come together)
create or replace function public.admin_alerts_claim()
returns setof public.admin_alert_outbox
language sql
security definer
set search_path = public
as $$
  update public.admin_alert_outbox o set sent_at = now()
   where o.id in (select id from public.admin_alert_outbox where sent_at is null order by id limit 50 for update skip locked)
  returning o.*;
$$;
revoke all on function public.admin_alerts_claim() from public, anon, authenticated;

-- ── the events ─────────────────────────────────────────────────────────────────────────────────────────────────
-- the text of a row, safely (columns differ between tables and schema versions)
create or replace function public.admin_alert_text(r jsonb, keys text[])
returns text
language sql
immutable
as $$
  select string_agg(r ->> k, ' · ') from unnest(keys) k where coalesce(r ->> k, '') <> '';
$$;

create or replace function public.admin_alert_on_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb := to_jsonb(new);
begin
  case tg_table_name
    when 'support_tickets' then
      perform public.admin_alert('ticket', 'Нове звернення в підтримку', public.admin_alert_text(r, array['category', 'description']));
    when 'author_verification_requests' then
      perform public.admin_alert('verification', 'Нова заявка на верифікацію автора', null);
    when 'refund_requests' then
      perform public.admin_alert('refund', 'Новий запит на повернення коштів', public.admin_alert_text(r, array['reason', 'details']));
    when 'entity_reports' then
      perform public.admin_alert('report', 'Нова скарга: ' || coalesce(case r ->> 'target_type' when 'post' then 'публікація' when 'author' then 'автор' when 'review' then 'відгук' else r ->> 'target_type' end, 'об’єкт'),
        public.admin_alert_text(r, array['target_label', 'reason', 'details']));
    when 'content_reports' then
      perform public.admin_alert('report', 'Нова скарга на матеріал', public.admin_alert_text(r, array['content_title', 'reason', 'details']));
    when 'message_reports' then
      perform public.admin_alert('report', 'Нова скарга на повідомлення', public.admin_alert_text(r, array['reason', 'details']));
    when 'author_post_comment_reports' then
      perform public.admin_alert('report', 'Нова скарга на коментар у «Спільноті»', public.admin_alert_text(r, array['reason']));
    when 'content_comment_reports' then
      perform public.admin_alert('report', 'Нова скарга на коментар до уроку', public.admin_alert_text(r, array['reason']));
    when 'content' then
      if (r ->> 'status') = 'review' and (tg_op = 'INSERT' or (to_jsonb(old) ->> 'status') is distinct from 'review') then
        perform public.admin_alert('moderation', 'Матеріал надіслано на модерацію', public.admin_alert_text(r, array['kind', 'title']));
      end if;
    when 'author_posts' then
      if (r ->> 'hidden_at') is not null and (tg_op = 'INSERT' or (to_jsonb(old) ->> 'hidden_at') is null) then
        perform public.admin_alert('post_hidden',
          case r ->> 'hidden_reason'
            when 'crisis' then 'ТЕРМІНОВО: кризова публікація в «Спільноті»'
            when 'reports' then 'Публікацію приховано після 3 скарг'
            when 'image_check' then 'Публікацію приховано: фото не пройшло перевірку'
            else 'Публікацію приховано' end,
          left(r ->> 'body', 300),
          (r ->> 'hidden_reason') = 'crisis');
      end if;
    when 'profiles' then
      if (r ->> 'role') = 'author' and (tg_op = 'INSERT' or (to_jsonb(old) ->> 'role') is distinct from 'author') then
        perform public.admin_alert('author', 'Новий автор на платформі', r ->> 'name');
      end if;
    else
      null;
  end case;
  return null;
exception when others then
  return null; -- never break the person's action because of an alert
end;
$$;

do $$
declare
  t text;
begin
  -- inserts
  foreach t in array array['support_tickets', 'author_verification_requests', 'refund_requests', 'entity_reports', 'content_reports',
                           'message_reports', 'author_post_comment_reports', 'content_comment_reports'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists admin_alert on public.%I', t);
      execute format('create trigger admin_alert after insert on public.%I for each row execute function public.admin_alert_on_row()', t);
    end if;
  end loop;
  -- inserts and status changes
  foreach t in array array['content', 'author_posts', 'profiles'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists admin_alert on public.%I', t);
      execute format('create trigger admin_alert after insert or update on public.%I for each row execute function public.admin_alert_on_row()', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ── reports: one open report per person per thing, at most 20 reports a day (so nobody floods moderation or the
-- admin's mailbox). The app treats «already reported» as sent.
do $$
begin
  if to_regclass('public.content_reports') is not null then
    execute 'create unique index if not exists content_reports_one_open_per_reporter on public.content_reports (reporter_id, content_item_id) where status = ''open''';
  end if;
  if to_regclass('public.message_reports') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'message_reports' and column_name = 'reported_id') then
    execute 'create unique index if not exists message_reports_one_open_per_reporter on public.message_reports (reporter_id, reported_id) where status = ''open''';
  end if;
exception when others then
  null; -- old duplicates in the data: the daily limit below still protects
end $$;

create or replace function public.report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  execute format('select count(*) from public.%I where reporter_id = $1 and created_at > now() - interval ''24 hours''', tg_table_name) into n using new.reporter_id;
  if n >= 20 then
    raise exception 'Забагато скарг за добу. Спробуйте завтра.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
do $$
declare
  t text;
begin
  foreach t in array array['entity_reports', 'content_reports', 'message_reports', 'author_post_comment_reports', 'content_comment_reports'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists report_rate_limit on public.%I', t);
      execute format('create trigger report_rate_limit before insert on public.%I for each row execute function public.report_rate_limit()', t);
    end if;
  end loop;
end $$;
