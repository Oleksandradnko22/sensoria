-- Запрет live-режима оплаты до релизов B (согласия) и C (оплата) — docs/consent-legal-spec.md, раздел 12.
-- Идемпотентно. Запускает владелец в SQL Editor.
-- finance_settings.mode = 'live' отклоняется, пока в базе нет:
--   • таблиц legal_documents, purchase_consents, author_fiscal;
--   • текущих редакций participant_agreement и author_agreement в legal_documents.

create or replace function public.finance_live_ready() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  n int;
begin
  if to_regclass('public.legal_documents') is null
     or to_regclass('public.purchase_consents') is null
     or to_regclass('public.author_fiscal') is null then
    return false;
  end if;
  execute $q$select count(distinct document) from public.legal_documents
             where is_current and document in ('participant_agreement', 'author_agreement')$q$ into n;
  return n = 2;
end $$;

create or replace function public.finance_settings_live_guard() returns trigger
language plpgsql as $$
begin
  if new.mode = 'live' and (tg_op = 'INSERT' or old.mode is distinct from 'live') and not public.finance_live_ready() then
    raise exception 'live_not_ready: реальний режим оплати заборонено до релізів B і C (згоди, галочка негайного доступу, ПРРО)'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists finance_settings_live_guard on public.finance_settings;
create trigger finance_settings_live_guard
  before insert or update of mode on public.finance_settings
  for each row execute function public.finance_settings_live_guard();
