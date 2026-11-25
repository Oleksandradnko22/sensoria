-- ОЧИЩЕННЯ ТЕСТОВИХ СКАРГ І ЛИСТІВ У ПІДТРИМКУ (25.11.2026, на прохання власниці). Незворотно.
-- Видаляються всі скарги (на матеріали, публікації, авторів, відгуки, повідомлення, коментарі) і всі звернення в підтримку.
-- Заявки авторів на верифікацію НЕ чіпаються. Таблиці, яких у базі немає, пропускаються.
-- Перевірка до й після:
--   select 'content_reports', count(*) from public.content_reports union all select 'support_tickets', count(*) from public.support_tickets;
begin;
do $$
declare t text;
begin
  foreach t in array array['content_reports', 'entity_reports', 'message_reports', 'content_comment_reports',
                           'author_post_comment_reports', 'support_tickets'] loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I', t);
    end if;
  end loop;
end $$;
commit;
