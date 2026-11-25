-- ОЧИЩЕННЯ ТЕСТОВИХ ДАНИХ ПЕРЕД ЗАПУСКОМ (25.11.2026, на прохання власниці).
-- Лишаються: ваш акаунт адміністратора та Ірина Лебеденко (irinalebedenko2703@gmail.com).
-- Видаляються НАЗАВЖДИ: усі інші акаунти та ВСІ тестові фінанси (оплати, повернення, журнал, акти, чеки, рахунки mono).
--
-- КРОК 1 — подивитися (запустіть окремо):
--   select email, role, is_admin from public.profiles order by is_admin desc, email;
--   select (select count(*) from public.finance_payments) as оплати, (select count(*) from public.ledger_entries) as журнал,
--          (select count(*) from public.purchases) as покупки, (select count(*) from public.service_acts) as акти,
--          (select count(*) from public.fiscal_receipts) as чеки;
--
-- КРОК 2 — очищення (весь блок одним запуском):
begin;

do $$ begin
  if not exists (select 1 from public.profiles where is_admin) then raise exception 'Адміністратора не знайдено — скасовано.'; end if;
end $$;

-- 1) усі тестові фінанси. Захист журналу від очищення вимикається лише всередині цієї транзакції й одразу вмикається знову.
alter table public.ledger_entries disable trigger ledger_no_truncate;
truncate table
  public.ledger_entries, public.finance_audit_log, public.finance_operations, public.finance_payments, public.finance_refunds,
  public.fiscal_receipts, public.service_acts, public.mono_invoices, public.purchases, public.acquired_content,
  public.purchase_consents, public.refund_requests, public.refund_reserves, public.payouts, public.author_debts,
  public.tariff_daily_checks, public.tariff_refund_tasks, public.financial_notifications, public.referral_attributions;
alter table public.ledger_entries enable trigger ledger_no_truncate;

-- 2) усі акаунти, крім адміністратора та Ірини Лебеденко
create temp table keep_ids on commit drop as
  select id from public.profiles where is_admin or lower(email) = 'irinalebedenko2703@gmail.com';
delete from public.closed_participants where profile_id not in (select id from keep_ids);
delete from public.closed_authors where profile_id not in (select id from keep_ids);
delete from public.author_fiscal where author_id not in (select id from keep_ids);
update public.content_items set material_id = null
  where material_id in (select id from public.content where author_id not in (select id from keep_ids));
alter table public.content disable trigger protect_sold_content_trg;
alter table public.content disable trigger content_keep_if_acquired_trg;
delete from auth.users where id not in (select id from keep_ids);
alter table public.content enable trigger protect_sold_content_trg;
alter table public.content enable trigger content_keep_if_acquired_trg;
delete from public.author_mono_receivers where author_id not in (select id from keep_ids);

commit;

-- КРОК 3 — перевірка: два акаунти, нулі у фінансах
--   select email, role, is_admin from public.profiles;
--   select count(*) from public.ledger_entries;
