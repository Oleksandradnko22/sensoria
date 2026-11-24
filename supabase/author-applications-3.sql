-- Сповіщення про нового автора: тепер це анкета, яка чекає схвалення (24.11.2026). Решта функції — як у
-- admin-alerts-no-text.sql. Ідемпотентно.
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
      perform public.admin_alert('ticket', 'Нове звернення в підтримку', public.admin_alert_text(r, array['category']));
    when 'author_verification_requests' then
      perform public.admin_alert('verification', 'Нова заявка на верифікацію автора', null);
    when 'refund_requests' then
      perform public.admin_alert('refund', 'Новий запит на повернення коштів', public.admin_alert_text(r, array['content_title', 'amount'])); -- причину пише покупець: лише в адмінці
    when 'entity_reports' then
      perform public.admin_alert('report', 'Нова скарга: ' || coalesce(case r ->> 'target_type' when 'post' then 'публікація' when 'author' then 'автор' when 'review' then 'відгук' else r ->> 'target_type' end, 'об’єкт'),
        public.admin_alert_text(r, array['target_label', 'reason']), public.is_urgent_report_reason(r ->> 'reason'));
    when 'content_reports' then
      perform public.admin_alert('report', 'Нова скарга на матеріал', public.admin_alert_text(r, array['content_title', 'reason']), public.is_urgent_report_reason(r ->> 'reason'));
    when 'message_reports' then
      perform public.admin_alert('report', 'Нова скарга на повідомлення', public.admin_alert_text(r, array['reason']), public.is_urgent_report_reason(r ->> 'reason'));
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
          'Текст — в адмінці, вкладка «Модерація».',
          (r ->> 'hidden_reason') = 'crisis');
      end if;
    when 'profiles' then
      if (r ->> 'role') = 'author' and (tg_op = 'INSERT' or (to_jsonb(old) ->> 'role') is distinct from 'author') then
        perform public.admin_alert('author', 'Нова анкета автора — чекає схвалення', coalesce(r ->> 'name', '') || '. Адмінка → «Звернення» → «Заявки авторів».');
      end if;
    else
      null;
  end case;
  return null;
exception when others then
  return null; -- never break the person's action because of an alert
end;
$$;

