-- Дві термінові причини скарг (перевірка безпеки 21.11.2026, С11): «Небезпечно для життя чи здоров’я» (danger) і
-- «Схоже, людині зараз потрібна допомога» (needs_help). Ідемпотентно: знімає старі обмеження причин і ставить ширші.
do $$
declare
  t record;
  c record;
  keys text := $k$('inappropriate_content','requests_contact_info','offers_off_platform_payment','inappropriate_behavior',
    'incorrect_claims','harassment','spam_or_ads','misleading','impersonation','other','danger','needs_help')$k$;
  labels text := $l$('Спам','Образи / агресія','Неприйнятний контент','Реклама','Порушення правил платформи','Інше',
    'Небезпечно для життя чи здоров’я','Схоже, людині зараз потрібна допомога')$l$;
begin
  for t in select * from (values
    ('message_reports', 'keys'), ('content_reports', 'keys'), ('entity_reports', 'keys'),
    ('content_comment_reports', 'labels'), ('author_post_comment_reports', 'labels')
  ) as v(tbl, kind) loop
    if to_regclass('public.' || t.tbl) is null then continue; end if;
    for c in select conname from pg_constraint
              where conrelid = ('public.' || t.tbl)::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%reason%' loop
      execute format('alter table public.%I drop constraint %I', t.tbl, c.conname);
    end loop;
    execute format('alter table public.%I add constraint %I check (reason in %s)', t.tbl, t.tbl || '_reason_check',
      case when t.kind = 'keys' then keys else labels end);
  end loop;
end $$;

-- термінові — першими в черзі модерації
create or replace function public.is_urgent_report_reason(r text)
returns boolean language sql immutable as $$
  select r in ('danger', 'needs_help', 'Небезпечно для життя чи здоров’я', 'Схоже, людині зараз потрібна допомога');
$$;

-- лист власниці про термінову скаргу позначено як терміновий (admin-alerts.sql, той самий тригер)
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
        public.admin_alert_text(r, array['target_label', 'reason', 'details']), public.is_urgent_report_reason(r ->> 'reason'));
    when 'content_reports' then
      perform public.admin_alert('report', 'Нова скарга на матеріал', public.admin_alert_text(r, array['content_title', 'reason', 'details']), public.is_urgent_report_reason(r ->> 'reason'));
    when 'message_reports' then
      perform public.admin_alert('report', 'Нова скарга на повідомлення', public.admin_alert_text(r, array['reason', 'details']), public.is_urgent_report_reason(r ->> 'reason'));
    when 'author_post_comment_reports' then
      perform public.admin_alert('report', 'Нова скарга на коментар у «Спільноті»', public.admin_alert_text(r, array['reason']), public.is_urgent_report_reason(r ->> 'reason'));
    when 'content_comment_reports' then
      perform public.admin_alert('report', 'Нова скарга на коментар до уроку', public.admin_alert_text(r, array['reason']), public.is_urgent_report_reason(r ->> 'reason'));
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
