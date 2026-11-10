-- monobank acquiring with split payments: invoices and split receivers.
-- Run in the Supabase SQL Editor (safe to re-run). Run AFTER finance-migration.sql.
--
--  * mono_invoices      one row per payment attempt; its id is our `reference` in monobank and also
--                       the id of the purchase created once the money arrived;
--  * author_mono_receivers  the author's split receiver id (given by monobank for the author's FOP);
--  * finance_settings.mono_sensoria_receiver_id  the same for Sensoria's own FOP.
--
-- Nothing here is readable from the browser: no policies, only the finance Edge Function (service role).

alter table public.finance_settings
  add column if not exists mono_sensoria_receiver_id text;

create table if not exists public.author_mono_receivers (
  author_id uuid primary key,
  receiver_id text not null check (length(btrim(receiver_id)) > 0),
  created_at timestamptz not null default now()
);
alter table public.author_mono_receivers enable row level security;

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
create index if not exists mono_invoices_buyer_idx on public.mono_invoices (buyer_id, content_id, created_at desc);
alter table public.mono_invoices enable row level security;
