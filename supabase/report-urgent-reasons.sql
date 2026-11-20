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
