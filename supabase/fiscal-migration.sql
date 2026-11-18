-- Fiscal receipts (ПРРО): the author's receipt for the full amount, Sensoria's own receipt for its tariff.
-- docs/legal/internal/accountant-dps-review-2026-11-18.md, В1 і В3. Run in the Supabase SQL Editor AFTER
-- mono-migration.sql and live-guard.sql. Safe to re-run. Only the finance Edge Function (service role) reads these.

-- the payment details the bank sent (card mask, approval code, RRN): a receipt for a card payment needs them
alter table public.mono_invoices add column if not exists payment_info jsonb;

-- the author's cash register (docs/consent-legal-spec.md, 3.4): a token reference, never the key itself
create table if not exists public.author_fiscal (
  author_id uuid primary key references public.profiles (id) on delete restrict,
  provider text not null,
  secret_ref text not null,
  cash_register_id text,
  status text not null default 'pending' check (status in ('pending', 'active', 'error', 'disabled')),
  last_error text,
  updated_at timestamptz not null default now()
);
alter table public.author_fiscal enable row level security;

-- Sensoria fiscalizes its tariff until a tax consultation (ІПК) says it is not needed.
-- sensoria_prro_active: the owner sets it once Sensoria's own PRRO (1-ПРРО, 5-ПРРО) is registered.
alter table public.finance_settings add column if not exists sensoria_fee_fiscal boolean not null default true;
alter table public.finance_settings add column if not exists sensoria_prro_active boolean not null default false;

create table if not exists public.fiscal_receipts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.mono_invoices (id) on delete restrict,
  author_id uuid not null,
  issuer text not null check (issuer in ('author', 'sensoria')),
  kind text not null check (kind in ('sale', 'return')),
  deliver_to text not null check (deliver_to in ('buyer', 'author')),
  item_code text not null,
  item_name text not null,
  price_kop bigint not null check (price_kop > 0),
  discount_kop bigint not null default 0 check (discount_kop >= 0),
  amount_kop bigint not null check (amount_kop > 0),
  card jsonb not null default '{}'::jsonb,
  mode text not null check (mode in ('test', 'live')),
  provider_receipt_id text,
  fiscal_code text,
  receipt_url text,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  unique (invoice_id, issuer, kind),
  check (price_kop - discount_kop = amount_kop)
);
alter table public.fiscal_receipts enable row level security;
create index if not exists fiscal_receipts_queue on public.fiscal_receipts (next_attempt_at) where status = 'pending';

-- live mode also needs the receipt queue, and Sensoria's PRRO while the tariff is fiscalized
create or replace function public.finance_settings_live_guard() returns trigger
language plpgsql as $$
begin
  if new.mode = 'live' and (tg_op = 'INSERT' or old.mode is distinct from 'live') then
    if not public.finance_live_ready() or to_regclass('public.fiscal_receipts') is null then
      raise exception 'live_not_ready: реальний режим оплати заборонено до релізів B і C (згоди, галочка негайного доступу, ПРРО)'
        using errcode = 'check_violation';
    end if;
    if new.sensoria_fee_fiscal and not new.sensoria_prro_active then
      raise exception 'live_not_ready: тариф Sensoria фіскалізується (до ІПК), а ПРРО Sensoria ще не підключено'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
