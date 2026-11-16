-- monobank acquiring with split payments: invoices and split receivers.
-- Run in the Supabase SQL Editor (safe to re-run). Run AFTER finance-migration.sql.
--
--  * mono_invoices      one row per payment attempt; its id is our `reference` in monobank and also
--                       the id of the purchase created once the money arrived;
--  * author_mono_receivers  the author's split receiver id (given by monobank for the author's FOP).
--    Sensoria is not a receiver: its commission (30 % / 15 %) comes as monobank's agentFeePercent.
--
-- Nothing here is readable from the browser: no policies, only the finance Edge Function (service role).

create table if not exists public.author_mono_receivers (
  author_id uuid primary key,
  receiver_id text,
  created_at timestamptz not null default now()
);
-- repair: an older copy of this table may already exist; bring its columns and value checks up to date
alter table public.author_mono_receivers add column if not exists receiver_id text;
alter table public.author_mono_receivers add column if not exists created_at timestamptz not null default now();
alter table public.author_mono_receivers enable row level security;
-- the author's connection to the split: the request in «Фінанси», then monobank's receiver id (matched by IPN)
alter table public.author_mono_receivers
  add column if not exists ipn text check (ipn is null or ipn ~ '^([0-9]{8}|[0-9]{10})$'),
  add column if not exists legal_name text,
  add column if not exists status text not null default 'active' check (status in ('requested', 'active', 'disabled')),
  add column if not exists updated_at timestamptz not null default now();
alter table public.author_mono_receivers alter column receiver_id drop not null;
alter table public.author_mono_receivers drop constraint if exists author_mono_receivers_receiver_id_check;
alter table public.author_mono_receivers drop constraint if exists author_mono_receivers_active_has_id;
alter table public.author_mono_receivers add constraint author_mono_receivers_active_has_id
  check (status <> 'active' or length(btrim(coalesce(receiver_id, ''))) > 0);

create table if not exists public.mono_invoices (
  id uuid primary key,                         -- our reference; later the purchase id
  buyer_id uuid not null,
  content_id uuid not null,
  author_id uuid not null,
  amount_kop bigint not null check (amount_kop > 0),
  author_kop bigint not null check (author_kop >= 0),
  sensoria_kop bigint not null check (sensoria_kop >= 0),
  sale_source text not null default 'catalog' check (sale_source in ('catalog', 'referral')),
  mono_invoice_id text unique,
  page_url text,
  status text not null default 'created'
    check (status in ('created', 'processing', 'hold', 'success', 'failure', 'reversed', 'expired', 'needs_review')),
  mono_modified text,                          -- modifiedDate of the newest webhook applied (ordering)
  review_reason text,
  mode text not null default 'test' check (mode in ('test', 'live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (author_kop + sensoria_kop = amount_kop)
);
-- repair: an older copy of this table may already exist; bring its columns and value checks up to date
alter table public.mono_invoices add column if not exists buyer_id uuid;
alter table public.mono_invoices add column if not exists content_id uuid;
alter table public.mono_invoices add column if not exists author_id uuid;
alter table public.mono_invoices add column if not exists amount_kop bigint;
alter table public.mono_invoices drop constraint if exists mono_invoices_amount_kop_check;
alter table public.mono_invoices add constraint mono_invoices_amount_kop_check check (amount_kop > 0);
alter table public.mono_invoices add column if not exists author_kop bigint;
alter table public.mono_invoices drop constraint if exists mono_invoices_author_kop_check;
alter table public.mono_invoices add constraint mono_invoices_author_kop_check check (author_kop >= 0);
alter table public.mono_invoices add column if not exists sensoria_kop bigint;
alter table public.mono_invoices drop constraint if exists mono_invoices_sensoria_kop_check;
alter table public.mono_invoices add constraint mono_invoices_sensoria_kop_check check (sensoria_kop >= 0);
alter table public.mono_invoices add column if not exists sale_source text not null default 'catalog';
alter table public.mono_invoices drop constraint if exists mono_invoices_sale_source_check;
alter table public.mono_invoices add constraint mono_invoices_sale_source_check check (sale_source in ('catalog', 'referral'));
alter table public.mono_invoices add column if not exists mono_invoice_id text;
alter table public.mono_invoices add column if not exists page_url text;
alter table public.mono_invoices add column if not exists status text not null default 'created';
alter table public.mono_invoices drop constraint if exists mono_invoices_status_check;
alter table public.mono_invoices add constraint mono_invoices_status_check check (status in ('created', 'processing', 'hold', 'success', 'failure', 'reversed', 'expired', 'needs_review'));
alter table public.mono_invoices add column if not exists mono_modified text;
alter table public.mono_invoices add column if not exists review_reason text;
alter table public.mono_invoices add column if not exists mode text not null default 'test';
alter table public.mono_invoices drop constraint if exists mono_invoices_mode_check;
alter table public.mono_invoices add constraint mono_invoices_mode_check check (mode in ('test', 'live'));
alter table public.mono_invoices add column if not exists created_at timestamptz not null default now();
alter table public.mono_invoices add column if not exists updated_at timestamptz not null default now();
-- what the bank reported on payment: card country (804 = Ukraine, fee 1.3 %; other — 2 %) and the real fee
alter table public.mono_invoices
  add column if not exists card_origin text check (card_origin in ('ua', 'foreign', 'unknown')),
  add column if not exists bank_fee_kop bigint check (bank_fee_kop >= 0);
-- the author sees which card paid (Ukrainian: bank fee 1.3 %, foreign: 2 %) on their own sale
alter table public.finance_payments
  add column if not exists card_origin text check (card_origin in ('ua', 'foreign', 'unknown'));
create index if not exists mono_invoices_buyer_idx on public.mono_invoices (buyer_id, content_id, created_at desc);
alter table public.mono_invoices enable row level security;
