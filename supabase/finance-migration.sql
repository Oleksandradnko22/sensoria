-- Sensoria own finance module: immutable ledger, author accounts, refunds,
-- debts, reserve, payouts, notifications, audit.
-- Run in the Supabase SQL Editor (safe to re-run). Run AFTER account-deletion-migration.sql.
-- It REPLACES the earlier Tranzzo-oriented payments-migration.sql (cleaned up in section 0).
--
-- Design (docs/finance-engine.md):
--  * every calculation is done by supabase/functions/finance (code tested in
--    src/utils/financeEngine.test.ts); this file stores the result atomically;
--  * all money is bigint KOPECKS;
--  * ledger_entries is append-only (update/delete/truncate are rejected);
--  * author_financial_accounts is a projection of the ledger, changed only by
--    finance_apply() in the same transaction as the ledger lines;
--  * nothing here moves real money. Real payments/payouts need the banking
--    layer after the legal review; until then finance_settings.mode = 'test'.

-- ── 0) remove the earlier Tranzzo-oriented objects ─────────────────────────
drop trigger if exists purchase_set_settlement_trg on public.purchases;
drop trigger if exists purchase_guard_settlement_trg on public.purchases;
drop function if exists public.purchase_set_settlement();
drop function if exists public.purchase_guard_settlement();
drop function if exists public.request_payout(numeric);
drop function if exists public.my_author_balance();
drop function if exists public.author_balance_of(uuid);
drop function if exists public.platform_commission_rate();
drop function if exists public.payment_hold_days();
drop function if exists public.min_payout_amount();
drop table if exists public.payout_requests;
drop table if exists public.author_card_tokens;
drop table if exists public.author_payment_accounts;
alter table public.purchases
  drop column if exists settlement_status,
  drop column if exists hold_until,
  drop column if exists platform_fee,
  drop column if exists author_amount,
  drop column if exists released_at,
  drop column if exists disputed_at,
  drop column if exists tranzzo_order_id,
  drop column if exists tranzzo_split_id;

-- ── 1) settings (one row; percentages live ONLY here) ──────────────────────
create table if not exists public.finance_settings (
  id int primary key default 1 check (id = 1),
  author_bps int not null default 7000 check (author_bps between 0 and 10000),
  commission_bps int not null default 3000 check (commission_bps between 0 and 10000),
  referral_commission_bps int not null default 1500 check (referral_commission_bps between 0 and 10000),
  hold_days int not null default 14 check (hold_days >= 0),
  reserve_bps int not null default 0 check (reserve_bps between 0 and 10000),
  reserve_days int not null default 0 check (reserve_days >= 0),
  inactivity_days int not null default 14 check (inactivity_days > 0),
  warning_grace_days int not null default 3 check (warning_grace_days >= 0),
  reminder_days int not null default 3 check (reminder_days >= 0),
  min_payout_kop bigint not null default 50000 check (min_payout_kop >= 0),
  -- the bank's tariff, charged to the BUYER on top of the price (grossed up by the engine)
  bank_fee_bps int not null default 0 check (bank_fee_bps between 0 and 9999),
  bank_fee_fixed_kop bigint not null default 0 check (bank_fee_fixed_kop >= 0),
  auto_payout boolean not null default true,
  -- the acquirer/bank splits each payment at once: 25 % to Sensoria's FOP account, 75 % to the author's (no hold, no payouts)
  split_at_source boolean not null default true,
  -- Sensoria's own account that receives the platform's 25 % (shown in the registry)
  sensoria_iban text,
  sensoria_account_holder text,
  -- 'test' = nothing real moves; 'live' needs the banking layer (not built yet)
  mode text not null default 'test' check (mode in ('test', 'live')),
  updated_at timestamptz not null default now(),
  constraint finance_shares_sum check (author_bps + commission_bps = 10000)
);
insert into public.finance_settings (id) values (1) on conflict do nothing;
alter table public.finance_settings enable row level security;
-- no policies: read/changed only by the finance Edge Function (service role)

-- ── 2) accounts, payments, debts, reserves, refunds, payouts ───────────────
-- No foreign keys to profiles/purchases on purpose: the financial history must
-- survive the deletion or closing of any account.
create table if not exists public.author_financial_accounts (
  author_id uuid primary key,
  pending_kop bigint not null default 0 check (pending_kop >= 0),
  available_kop bigint not null default 0 check (available_kop >= 0),
  reserved_kop bigint not null default 0 check (reserved_kop >= 0),
  debt_kop bigint not null default 0 check (debt_kop >= 0),
  in_flight_kop bigint not null default 0 check (in_flight_kop >= 0),
  lifetime_earnings_kop bigint not null default 0,
  total_paid_out_kop bigint not null default 0,
  total_refunded_kop bigint not null default 0,
  account_status text not null default 'ACTIVE'
    check (account_status in ('ACTIVE','DEBT','INACTIVE_WITH_DEBT','WARNING','SALES_SUSPENDED','DEBT_COLLECTION','CLOSURE_REQUESTED','CLOSED')),
  admin_hold boolean not null default false,
  sales_suspended boolean not null default false,
  last_meaningful_activity_at timestamptz,
  warning_at timestamptz,
  reminder_sent_at timestamptz,
  version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_payments (
  id uuid primary key,
  purchase_id uuid not null unique,
  author_id uuid not null,
  buyer_id uuid,
  amount_kop bigint not null check (amount_kop > 0),     -- the PRICE
  fee_kop bigint not null default 0 check (fee_kop >= 0),  -- bank fee the buyer paid on top
  gross_kop bigint,                                        -- price + fee: what the buyer was charged
  content_id uuid,
  content_title text,
  fee_refunded_kop bigint not null default 0,
  split_author_kop bigint,      -- instruction for the acquirer: what goes to the author's account
  split_sensoria_kop bigint,    -- ... and what goes to Sensoria's (25 % + author debt recovered)
  currency text not null default 'UAH',
  payment_status text not null default 'received'
    check (payment_status in ('initiated','confirmed','received','failed')),
  external_reference text,
  mode text not null default 'test' check (mode in ('test','live')),
  -- the shares this order was made with: later settings changes never touch it
  author_bps int not null,
  commission_bps int not null,
  sale_source text not null default 'catalog' check (sale_source in ('catalog','referral')),
  author_kop bigint not null,
  sensoria_kop bigint not null,
  pending_kop bigint not null default 0 check (pending_kop >= 0),
  hold_until timestamptz not null,
  refunded_kop bigint not null default 0 check (refunded_kop >= 0),
  author_refunded_kop bigint not null default 0,
  sensoria_refunded_kop bigint not null default 0,
  disputed boolean not null default false,
  confirmed_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  check (author_kop + sensoria_kop = amount_kop),
  check (refunded_kop <= amount_kop)
);
create index if not exists finance_payments_author_idx on public.finance_payments (author_id, hold_until);

create table if not exists public.finance_refunds (
  id uuid primary key,
  payment_id uuid not null references public.finance_payments (id),
  order_id uuid not null,
  buyer_id uuid,
  author_id uuid not null,
  total_refund_kop bigint not null check (total_refund_kop > 0),  -- price part
  fee_refund_kop bigint not null default 0,                         -- bank fee returned to the buyer
  buyer_refund_kop bigint,                                          -- price part + fee: what the buyer gets
  author_share_kop bigint not null,
  sensoria_share_kop bigint not null,
  refund_type text not null check (refund_type in ('full','partial','chargeback')),
  idempotency_key text not null unique,
  status text not null default 'approved' check (status in ('requested','approved','completed','failed')),
  reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.author_debts (
  id uuid primary key,
  author_id uuid not null,
  source_refund_id uuid references public.finance_refunds (id),
  original_kop bigint not null check (original_kop > 0),
  outstanding_kop bigint not null check (outstanding_kop >= 0),
  reason text not null,
  status text not null default 'open' check (status in ('open','repaid')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists author_debts_author_idx on public.author_debts (author_id, status, created_at);

create table if not exists public.refund_reserves (
  id uuid primary key,
  author_id uuid not null,
  payment_id uuid not null references public.finance_payments (id),
  reserved_kop bigint not null check (reserved_kop > 0),
  released_kop bigint not null default 0,
  used_kop bigint not null default 0,
  status text not null default 'held' check (status in ('held','released','used')),
  release_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (released_kop + used_kop <= reserved_kop)
);
create index if not exists refund_reserves_author_idx on public.refund_reserves (author_id, status, release_at);

create table if not exists public.payouts (
  id uuid primary key,
  author_id uuid not null,
  amount_kop bigint not null check (amount_kop > 0),
  currency text not null default 'UAH',
  payout_status text not null default 'requested'
    check (payout_status in ('requested','processing','paid','failed','cancelled')),
  destination text not null,           -- masked label for screens
  bank_account_id uuid,                -- the author's VERIFIED account this order was made for
  destination_iban text,               -- snapshot for the bank registry (the only place it is copied)
  destination_holder text,
  destination_tax_id text,
  is_auto boolean not null default false,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  confirmation_reference text,
  failure_reason text
);
create index if not exists payouts_author_idx on public.payouts (author_id, requested_at desc);
create index if not exists payouts_status_idx on public.payouts (payout_status);

-- The author's bank account. Money is paid ONLY to a 'verified' one: an
-- administrator checks that the holder is the author (name + tax id) before
-- verifying. A changed account starts as 'pending' again; the old verified one
-- keeps working until the new one is verified (then it becomes 'replaced').
create table if not exists public.author_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  iban text not null check (iban ~ '^UA[0-9]{27}$'),
  bank_name text,
  holder_name text not null check (length(btrim(holder_name)) >= 5),
  tax_id text not null check (tax_id ~ '^([0-9]{8}|[0-9]{10})$'),
  status text not null default 'pending' check (status in ('pending','verified','rejected','replaced')),
  reject_reason text,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists author_bank_one_verified on public.author_bank_accounts (author_id) where status = 'verified';
create unique index if not exists author_bank_one_pending on public.author_bank_accounts (author_id) where status = 'pending';
create index if not exists author_bank_author_idx on public.author_bank_accounts (author_id, created_at desc);
alter table public.author_bank_accounts enable row level security;
drop policy if exists "authors read own" on public.author_bank_accounts;
create policy "authors read own" on public.author_bank_accounts for select using (auth.uid() = author_id);
-- writes: only the finance Edge Function (it validates the IBAN checksum)

-- ── 3) the immutable ledger ────────────────────────────────────────────────
create table if not exists public.finance_operations (
  key text primary key,                -- idempotency: an operation is applied at most once
  kind text not null,
  author_id uuid,
  actor_id uuid,
  created_at timestamptz not null default now()
);
alter table public.finance_operations enable row level security;

create table if not exists public.ledger_entries (
  id bigint generated always as identity primary key,
  operation_key text not null references public.finance_operations (key),
  type text not null check (type in (
    'PAYMENT_RECEIVED','AUTHOR_EARNING','SENSORIA_COMMISSION','AUTHOR_PAYOUT','REFUND','PARTIAL_REFUND',
    'AUTHOR_DEBT_CREATED','AUTHOR_DEBT_REPAID','REFUND_RESERVE_CREATED','REFUND_RESERVE_RELEASED',
    'CHARGEBACK','MANUAL_ADJUSTMENT','HOLD_RELEASED','BANK_FEE_COLLECTED','BANK_FEE_PAID')),
  account text not null check (account in (
    'cash_in','cash_out','sensoria_revenue','author_pending','author_available','author_reserved',
    'author_debt','payout_in_flight','bank_fee','author_paid_out','author_earned','author_refunded')),
  delta_kop bigint not null,
  currency text not null default 'UAH',
  author_id uuid,
  payment_id uuid,
  refund_id uuid,
  payout_id uuid,
  order_id uuid,
  buyer_id uuid,
  author_share_kop bigint,
  sensoria_share_kop bigint,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists ledger_author_idx on public.ledger_entries (author_id, id desc);
create index if not exists ledger_order_idx on public.ledger_entries (order_id);
create index if not exists ledger_op_idx on public.ledger_entries (operation_key);
alter table public.ledger_entries enable row level security;

create or replace function public.ledger_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Фінансовий журнал не редагується: зробіть компенсуючу операцію.' using errcode = 'P0001';
end;
$$;
drop trigger if exists ledger_no_change on public.ledger_entries;
create trigger ledger_no_change before update or delete on public.ledger_entries
  for each row execute function public.ledger_immutable();
drop trigger if exists ledger_no_truncate on public.ledger_entries;
create trigger ledger_no_truncate before truncate on public.ledger_entries
  for each statement execute function public.ledger_immutable();

-- ── 4) notifications, activity, status history, audit ──────────────────────
create table if not exists public.financial_notifications (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  event_type text not null,
  dedupe_key text not null,
  message text not null,
  amount_kop bigint,
  related_operation text,
  delivery_status text not null default 'pending' check (delivery_status in ('pending','sent','skipped','failed')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (author_id, dedupe_key)       -- the same event is never sent twice
);
create index if not exists financial_notifications_author_idx on public.financial_notifications (author_id, created_at desc);
create index if not exists financial_notifications_pending_idx on public.financial_notifications (delivery_status) where delivery_status = 'pending';

create table if not exists public.author_activity (
  id bigint generated always as identity primary key,
  author_id uuid not null,
  activity_type text not null,
  is_meaningful boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists author_activity_author_idx on public.author_activity (author_id, created_at desc);

create table if not exists public.author_status_log (
  id bigint generated always as identity primary key,
  author_id uuid not null,
  from_status text not null,
  to_status text not null,
  reason text,
  operation_key text,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_audit_log (
  id bigint generated always as identity primary key,
  administrator_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  reason text,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create or replace function public.audit_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Журнал аудиту не редагується.' using errcode = 'P0001';
end;
$$;
drop trigger if exists finance_audit_no_change on public.finance_audit_log;
create trigger finance_audit_no_change before update or delete on public.finance_audit_log
  for each row execute function public.audit_immutable();

alter table public.author_financial_accounts enable row level security;
alter table public.finance_payments enable row level security;
alter table public.finance_refunds enable row level security;
alter table public.author_debts enable row level security;
alter table public.refund_reserves enable row level security;
alter table public.payouts enable row level security;
alter table public.financial_notifications enable row level security;
alter table public.author_activity enable row level security;
alter table public.author_status_log enable row level security;
alter table public.finance_audit_log enable row level security;

-- An author reads ONLY their own rows; nobody writes from the browser.
do $$
declare t text;
begin
  foreach t in array array['author_financial_accounts','finance_payments','finance_refunds','author_debts','refund_reserves','payouts','author_status_log'] loop
    execute format('drop policy if exists "authors read own" on public.%I', t);
    execute format('create policy "authors read own" on public.%I for select using (auth.uid() = author_id)', t);
  end loop;
end $$;
drop policy if exists "authors read own" on public.ledger_entries;
create policy "authors read own" on public.ledger_entries for select using (auth.uid() = author_id);
drop policy if exists "authors read own" on public.financial_notifications;
create policy "authors read own" on public.financial_notifications for select using (auth.uid() = author_id);
drop policy if exists "authors mark own notifications read" on public.financial_notifications;
-- (marking as read goes through the Edge Function; no update policy)

-- ── 5) a new sale status: sales paused because of an unpaid debt ───────────
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.content'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%sale_status%' loop
    execute format('alter table public.content drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.content add constraint content_sale_status_check
  check (sale_status in ('published', 'complaint_pending', 'unlisted', 'restored', 'suspended_debt'));

-- No NEW purchase of material that is not on sale (existing buyers keep access).
create or replace function public.purchase_sale_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_sale text;
begin
  if auth.uid() is null then return new; end if;     -- service role
  select sale_status into v_sale from public.content where id = new.content_id;
  if v_sale is not null and v_sale not in ('published', 'restored') then
    raise exception 'Продаж цього матеріалу тимчасово призупинено.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists purchase_sale_gate_trg on public.purchases;
create trigger purchase_sale_gate_trg before insert on public.purchases
  for each row execute function public.purchase_sale_gate();

-- Authors managing their material count as «meaningful activity».
create or replace function public.finance_touch_on_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = new.author_id then
    update public.author_financial_accounts
       set last_meaningful_activity_at = now(),
           account_status = case when account_status in ('WARNING','INACTIVE_WITH_DEBT')
                                 then case when debt_kop > 0 then 'DEBT' else 'ACTIVE' end
                                 else account_status end,
           warning_at = case when account_status in ('WARNING','INACTIVE_WITH_DEBT') then null else warning_at end,
           version = version + 1,
           updated_at = now()
     where author_id = new.author_id;
  end if;
  return new;
end;
$$;
drop trigger if exists finance_touch_on_content_trg on public.content;
create trigger finance_touch_on_content_trg after insert or update on public.content
  for each row execute function public.finance_touch_on_content();

-- ── 6) finance_apply: ONE transaction per operation ────────────────────────
-- p = a Plan made by the engine (see src/utils/financeEngine.ts).
create or replace function public.finance_apply(p jsonb, p_actor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := p->>'key';
  v_author uuid := nullif(p->>'authorId', '')::uuid;
  v_acc public.author_financial_accounts;
  v_acct jsonb := coalesce(p->'account', '{}'::jsonb);
  v_op jsonb;
  v_row jsonb;
  v_sums record;
  v_susp text;
begin
  if auth.role() is distinct from 'service_role' and auth.uid() is not null then
    raise exception 'Лише сервер фінансового модуля може змінювати баланси.' using errcode = 'P0001';
  end if;

  -- idempotency: the same operation is applied at most once
  begin
    insert into finance_operations (key, kind, author_id, actor_id)
    values (v_key, p->>'kind', v_author, p_actor);
  exception when unique_violation then
    raise exception 'finance_duplicate' using errcode = 'P0001';
  end;

  if v_author is not null then
    insert into author_financial_accounts (author_id) values (v_author) on conflict do nothing;
    select * into v_acc from author_financial_accounts where author_id = v_author for update;
    if p->>'expectedVersion' is not null and (p->>'expectedVersion')::int <> v_acc.version then
      raise exception 'finance_version_conflict' using errcode = 'P0001';
    end if;
  end if;

  -- payments → reserves → refunds → debts → payouts (FK order)
  for v_op in select * from jsonb_array_elements(coalesce(p->'payments', '[]')) loop
    v_row := v_op->'row';
    if v_op->>'op' = 'insert' then
      insert into finance_payments (id, purchase_id, author_id, buyer_id, amount_kop, fee_kop, gross_kop, content_id,
        content_title, currency, payment_status,
        external_reference, mode, author_bps, commission_bps, sale_source, author_kop, sensoria_kop, pending_kop, hold_until,
        split_author_kop, split_sensoria_kop, confirmed_at, received_at)
      values ((v_row->>'id')::uuid, (v_row->>'purchase_id')::uuid, (v_row->>'author_id')::uuid,
        nullif(v_row->>'buyer_id','')::uuid, (v_row->>'amount_kop')::bigint, coalesce((v_row->>'fee_kop')::bigint, 0),
        nullif(v_row->>'gross_kop','')::bigint, nullif(v_row->>'content_id','')::uuid, v_row->>'content_title',
        coalesce(v_row->>'currency','UAH'),
        v_row->>'payment_status', v_row->>'external_reference', v_row->>'mode', (v_row->>'author_bps')::int,
        (v_row->>'commission_bps')::int, coalesce(v_row->>'sale_source','catalog'), (v_row->>'author_kop')::bigint, (v_row->>'sensoria_kop')::bigint,
        (v_row->>'pending_kop')::bigint, (v_row->>'hold_until')::timestamptz,
        nullif(v_row->>'split_author_kop','')::bigint, nullif(v_row->>'split_sensoria_kop','')::bigint,
        (v_row->>'confirmed_at')::timestamptz, (v_row->>'received_at')::timestamptz);
    else
      update finance_payments set
        pending_kop = case when v_row ? 'pending_kop' then (v_row->>'pending_kop')::bigint else pending_kop end,
        refunded_kop = case when v_row ? 'refunded_kop' then (v_row->>'refunded_kop')::bigint else refunded_kop end,
        author_refunded_kop = case when v_row ? 'author_refunded_kop' then (v_row->>'author_refunded_kop')::bigint else author_refunded_kop end,
        sensoria_refunded_kop = case when v_row ? 'sensoria_refunded_kop' then (v_row->>'sensoria_refunded_kop')::bigint else sensoria_refunded_kop end,
        fee_refunded_kop = case when v_row ? 'fee_refunded_kop' then (v_row->>'fee_refunded_kop')::bigint else fee_refunded_kop end,
        disputed = case when v_row ? 'disputed' then (v_row->>'disputed')::boolean else disputed end
      where id = (v_row->>'id')::uuid;
    end if;
  end loop;

  for v_op in select * from jsonb_array_elements(coalesce(p->'reserves', '[]')) loop
    v_row := v_op->'row';
    if v_op->>'op' = 'insert' then
      insert into refund_reserves (id, author_id, payment_id, reserved_kop, released_kop, used_kop, status, release_at)
      values ((v_row->>'id')::uuid, (v_row->>'author_id')::uuid, (v_row->>'payment_id')::uuid,
        (v_row->>'reserved_kop')::bigint, 0, 0, 'held', (v_row->>'release_at')::timestamptz);
    else
      update refund_reserves set
        released_kop = case when v_row ? 'released_kop' then (v_row->>'released_kop')::bigint else released_kop end,
        used_kop = case when v_row ? 'used_kop' then (v_row->>'used_kop')::bigint else used_kop end,
        status = coalesce(v_row->>'status', status)
      where id = (v_row->>'id')::uuid;
    end if;
  end loop;

  for v_op in select * from jsonb_array_elements(coalesce(p->'refunds', '[]')) loop
    v_row := v_op->'row';
    insert into finance_refunds (id, payment_id, order_id, buyer_id, author_id, total_refund_kop, fee_refund_kop,
      buyer_refund_kop, author_share_kop,
      sensoria_share_kop, refund_type, idempotency_key, status, reason, completed_at)
    values ((v_row->>'id')::uuid, (v_row->>'payment_id')::uuid, (v_row->>'order_id')::uuid, nullif(v_row->>'buyer_id','')::uuid,
      (v_row->>'author_id')::uuid, (v_row->>'total_refund_kop')::bigint, coalesce((v_row->>'fee_refund_kop')::bigint, 0),
      nullif(v_row->>'buyer_refund_kop','')::bigint, (v_row->>'author_share_kop')::bigint,
      (v_row->>'sensoria_share_kop')::bigint, v_row->>'refund_type', v_row->>'idempotency_key', v_row->>'status',
      v_row->>'reason', null);
  end loop;

  for v_op in select * from jsonb_array_elements(coalesce(p->'debts', '[]')) loop
    v_row := v_op->'row';
    if v_op->>'op' = 'insert' then
      insert into author_debts (id, author_id, source_refund_id, original_kop, outstanding_kop, reason, status)
      values ((v_row->>'id')::uuid, (v_row->>'author_id')::uuid, nullif(v_row->>'source_refund_id','')::uuid,
        (v_row->>'original_kop')::bigint, (v_row->>'outstanding_kop')::bigint, v_row->>'reason', 'open');
    else
      update author_debts set
        outstanding_kop = (v_row->>'outstanding_kop')::bigint,
        status = v_row->>'status',
        resolved_at = nullif(v_row->>'resolved_at','')::timestamptz
      where id = (v_row->>'id')::uuid;
    end if;
  end loop;

  for v_op in select * from jsonb_array_elements(coalesce(p->'payouts', '[]')) loop
    v_row := v_op->'row';
    if v_op->>'op' = 'insert' then
      insert into payouts (id, author_id, amount_kop, currency, payout_status, destination, bank_account_id,
        destination_iban, destination_holder, destination_tax_id, is_auto, requested_at)
      values ((v_row->>'id')::uuid, (v_row->>'author_id')::uuid, (v_row->>'amount_kop')::bigint,
        coalesce(v_row->>'currency','UAH'), 'requested', v_row->>'destination', nullif(v_row->>'bank_account_id','')::uuid,
        v_row->>'destination_iban', v_row->>'destination_holder', v_row->>'destination_tax_id',
        coalesce((v_row->>'is_auto')::boolean, false), (v_row->>'requested_at')::timestamptz);
    else
      update payouts set
        payout_status = coalesce(v_row->>'payout_status', payout_status),
        processed_at = case when v_row ? 'processed_at' then (v_row->>'processed_at')::timestamptz else processed_at end,
        confirmation_reference = coalesce(v_row->>'confirmation_reference', confirmation_reference),
        failure_reason = coalesce(v_row->>'failure_reason', failure_reason)
      where id = (v_row->>'id')::uuid;
    end if;
  end loop;

  -- the ledger lines
  insert into ledger_entries (operation_key, type, account, delta_kop, author_id, payment_id, refund_id, payout_id,
    order_id, buyer_id, author_share_kop, sensoria_share_kop, reason)
  select v_key, l->>'type', l->>'account', (l->>'delta')::bigint, nullif(l->>'authorId','')::uuid,
    nullif(l->>'paymentId','')::uuid, nullif(l->>'refundId','')::uuid, nullif(l->>'payoutId','')::uuid,
    nullif(l->>'orderId','')::uuid, nullif(l->>'buyerId','')::uuid,
    nullif(l->>'authorShare','')::bigint, nullif(l->>'sensoriaShare','')::bigint, l->>'reason'
  from jsonb_array_elements(coalesce(p->'lines', '[]')) l;

  -- the projection: exactly the sums of this operation's author lines
  if v_author is not null then
    select
      coalesce(sum((l->>'delta')::bigint) filter (where l->>'account' = 'author_pending'), 0) as pending,
      coalesce(sum((l->>'delta')::bigint) filter (where l->>'account' = 'author_available'), 0) as available,
      coalesce(sum((l->>'delta')::bigint) filter (where l->>'account' = 'author_reserved'), 0) as reserved,
      coalesce(sum((l->>'delta')::bigint) filter (where l->>'account' = 'author_debt'), 0) as debt,
      coalesce(sum((l->>'delta')::bigint) filter (where l->>'account' = 'payout_in_flight'), 0) as in_flight,
      coalesce(sum((l->>'delta')::bigint) filter (where l->>'account' = 'author_earned'), 0) as earned,
      coalesce(sum((l->>'delta')::bigint) filter (where l->>'account' = 'author_paid_out'), 0) as paid_out,
      coalesce(sum((l->>'delta')::bigint) filter (where l->>'account' = 'author_refunded'), 0) as refunded
    into v_sums
    from jsonb_array_elements(coalesce(p->'lines', '[]')) l
    where nullif(l->>'authorId','')::uuid = v_author;

    update author_financial_accounts set
      pending_kop = pending_kop + v_sums.pending,
      available_kop = available_kop + v_sums.available,
      reserved_kop = reserved_kop + v_sums.reserved,
      debt_kop = debt_kop + v_sums.debt,
      in_flight_kop = in_flight_kop + v_sums.in_flight,
      lifetime_earnings_kop = lifetime_earnings_kop + v_sums.earned,
      total_paid_out_kop = total_paid_out_kop + v_sums.paid_out,
      total_refunded_kop = total_refunded_kop + v_sums.refunded,
      account_status = coalesce(v_acct->>'status', account_status),
      admin_hold = case when v_acct ? 'adminHold' then (v_acct->>'adminHold')::boolean else admin_hold end,
      sales_suspended = case when v_acct ? 'salesSuspended' then (v_acct->>'salesSuspended')::boolean else sales_suspended end,
      last_meaningful_activity_at = case when v_acct ? 'lastMeaningfulActivityAt' then (v_acct->>'lastMeaningfulActivityAt')::timestamptz else last_meaningful_activity_at end,
      warning_at = case when v_acct ? 'warningAt' then nullif(v_acct->>'warningAt','')::timestamptz else warning_at end,
      reminder_sent_at = case when v_acct ? 'reminderSentAt' then nullif(v_acct->>'reminderSentAt','')::timestamptz else reminder_sent_at end,
      version = version + 1,
      updated_at = now()
    where author_id = v_author;

    -- pause / resume NEW sales of this author's published materials
    if v_acct ? 'salesSuspended' then
      perform set_config('sensoria.sale_system', '1', true);
      if (v_acct->>'salesSuspended')::boolean then
        update content set sale_status = 'suspended_debt'
         where author_id = v_author and sale_status in ('published', 'restored');
      else
        update content set sale_status = 'published'
         where author_id = v_author and sale_status = 'suspended_debt';
      end if;
    end if;

    for v_op in select * from jsonb_array_elements(coalesce(p->'statusLog', '[]')) loop
      insert into author_status_log (author_id, from_status, to_status, reason, operation_key)
      values (v_author, v_op->>'from', v_op->>'to', v_op->>'reason', v_key);
    end loop;

    insert into financial_notifications (author_id, event_type, dedupe_key, message, amount_kop, related_operation)
    select v_author, n->>'eventType', n->>'dedupeKey', n->>'message', nullif(n->>'amountKop','')::bigint, n->>'relatedOperation'
    from jsonb_array_elements(coalesce(p->'notifications', '[]')) n
    on conflict (author_id, dedupe_key) do nothing;
  end if;

  if p ? 'audit' and p->'audit' is not null and jsonb_typeof(p->'audit') = 'object' then
    insert into finance_audit_log (administrator_id, action, entity_type, entity_id, reason, previous_value, new_value)
    values (p_actor, p->'audit'->>'action', 'author', v_author::text, p->'audit'->>'reason',
      p->'audit'->'previous', p->'audit'->'next');
  end if;

  return jsonb_build_object('ok', true, 'key', v_key);
end;
$$;
revoke all on function public.finance_apply(jsonb, uuid) from public, anon, authenticated;

-- ── 7) checks and reports (service role only) ──────────────────────────────
-- Projection vs ledger, per author. Empty result = consistent.
create or replace function public.finance_verify()
returns table (author_id uuid, field text, projection bigint, ledger bigint)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select e.author_id,
      coalesce(sum(delta_kop) filter (where account = 'author_pending'), 0)::bigint as pending,
      coalesce(sum(delta_kop) filter (where account = 'author_available'), 0)::bigint as available,
      coalesce(sum(delta_kop) filter (where account = 'author_reserved'), 0)::bigint as reserved,
      coalesce(sum(delta_kop) filter (where account = 'author_debt'), 0)::bigint as debt,
      coalesce(sum(delta_kop) filter (where account = 'payout_in_flight'), 0)::bigint as in_flight
    from ledger_entries e where e.author_id is not null group by e.author_id
  )
  select a.author_id, f.field, f.proj, f.led
  from author_financial_accounts a
  left join s on s.author_id = a.author_id
  cross join lateral (values
    ('pending', a.pending_kop, coalesce(s.pending, 0)::bigint),
    ('available', a.available_kop, coalesce(s.available, 0)),
    ('reserved', a.reserved_kop, coalesce(s.reserved, 0)),
    ('debt', a.debt_kop, coalesce(s.debt, 0)),
    ('in_flight', a.in_flight_kop, coalesce(s.in_flight, 0))
  ) as f(field, proj, led)
  where f.proj <> f.led;
$$;
revoke all on function public.finance_verify() from public, anon, authenticated;

-- Whole-platform conservation: confirmed cash in − cash out = everything owed.
create or replace function public.finance_totals()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'turnover_kop', coalesce(sum(delta_kop) filter (where account = 'cash_in'), 0),
    'cash_out_kop', coalesce(sum(delta_kop) filter (where account = 'cash_out'), 0),
    'sensoria_revenue_kop', coalesce(sum(delta_kop) filter (where account = 'sensoria_revenue'), 0),
    'author_pending_kop', coalesce(sum(delta_kop) filter (where account = 'author_pending'), 0),
    'author_available_kop', coalesce(sum(delta_kop) filter (where account = 'author_available'), 0),
    'author_reserved_kop', coalesce(sum(delta_kop) filter (where account = 'author_reserved'), 0),
    'author_debt_kop', coalesce(sum(delta_kop) filter (where account = 'author_debt'), 0),
    'in_flight_kop', coalesce(sum(delta_kop) filter (where account = 'payout_in_flight'), 0),
    'bank_fee_owed_kop', coalesce(sum(delta_kop) filter (where account = 'bank_fee'), 0),
    'paid_out_kop', coalesce(sum(delta_kop) filter (where account = 'author_paid_out'), 0),
    'earned_kop', coalesce(sum(delta_kop) filter (where account = 'author_earned'), 0),
    'refunded_kop', coalesce(sum(delta_kop) filter (where type in ('REFUND','PARTIAL_REFUND','CHARGEBACK') and account = 'cash_out'), 0),
    'gap_kop',
      coalesce(sum(delta_kop) filter (where account = 'cash_in'), 0)
      - coalesce(sum(delta_kop) filter (where account = 'cash_out'), 0)
      - ( coalesce(sum(delta_kop) filter (where account in ('sensoria_revenue','author_pending','author_available','author_reserved','payout_in_flight','bank_fee')), 0)
          - coalesce(sum(delta_kop) filter (where account = 'author_debt'), 0) )
  ) from ledger_entries;
$$;
revoke all on function public.finance_totals() from public, anon, authenticated;

-- ── 8) journal of the buyer's actions (chargeback evidence) ────────────────
-- Exact time, IP and user id at the moment a buyer opens or downloads paid
-- content. Written ONLY by the `log-content-access` Edge Function, which
-- reads the IP from the request itself — a client cannot choose or skip it.
create table if not exists public.content_access_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  content_id uuid not null,
  purchase_id uuid,
  action text not null check (action in ('open', 'download')),
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists content_access_log_user_idx on public.content_access_log (user_id, created_at desc);
create index if not exists content_access_log_content_idx on public.content_access_log (content_id, created_at desc);
create index if not exists content_access_log_purchase_idx on public.content_access_log (purchase_id);
alter table public.content_access_log enable row level security;
-- no policies: neither authors nor buyers can read or edit it; the service
-- role (admin function, evidence export for Tranzzo) bypasses RLS.
-- Deliberately no foreign keys: the journal must survive account/content deletion.

-- ── 9) the terms authors may SEE (the settings table itself stays private) ──
create or replace function public.finance_public_terms()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'commission_bps', commission_bps,
    'author_bps', author_bps,
    'referral_commission_bps', referral_commission_bps,
    'hold_days', hold_days,
    'reserve_bps', reserve_bps,
    'reserve_days', reserve_days,
    'inactivity_days', inactivity_days,
    'warning_grace_days', warning_grace_days,
    'min_payout_kop', min_payout_kop,
    'bank_fee_bps', bank_fee_bps,
    'bank_fee_fixed_kop', bank_fee_fixed_kop,
    'auto_payout', auto_payout,
    'split_at_source', split_at_source,
    'mode', mode
  ) from finance_settings where id = 1;
$$;
grant execute on function public.finance_public_terms() to authenticated;


-- ── Referral attribution ────────────────────────────────────────────────────
-- A buyer who came through an author's referral link gets a lower platform
-- commission on that author's materials for 30 days. The browser only remembers
-- the author id; THIS table is the proof, and only the server writes it.
-- The finance function reads it when a payment is confirmed (never the client).
create table if not exists public.referral_attributions (
  buyer_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (buyer_id, author_id)
);
alter table public.referral_attributions enable row level security;
-- no policies: no direct reads or writes from the app

create or replace function public.claim_referral(p_author uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  -- an author cannot refer themselves; the target must be a real author
  if p_author = auth.uid() then
    return;
  end if;
  if not exists (select 1 from public.profiles where id = p_author and role = 'author') then
    return;
  end if;
  -- last click wins: a fresh click refreshes the 30-day window
  insert into public.referral_attributions (buyer_id, author_id, created_at)
  values (auth.uid(), p_author, now())
  on conflict (buyer_id, author_id) do update set created_at = excluded.created_at;
end;
$$;
revoke all on function public.claim_referral(uuid) from public;
grant execute on function public.claim_referral(uuid) to authenticated;
