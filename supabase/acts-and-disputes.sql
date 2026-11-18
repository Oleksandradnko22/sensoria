-- Акти, система оподаткування автора, повернення тарифу після програного чарджбеку (оферта Б38, Б39, Б41;
-- accountant-dps-review-2026-11-18.md, В6, В7). Ідемпотентно. Запускати після finance-migration.sql і mono-migration.sql.

-- Б41: система оподаткування й ПДВ — вказує автор, потрібні для документів Платформи
alter table public.author_details add column if not exists tax_system text
  check (tax_system in ('fop2', 'fop3', 'fop_general', 'tov3', 'tov_general'));
alter table public.author_details add column if not exists vat_payer boolean not null default false;
alter table public.author_details add column if not exists tax_profile_updated_at timestamptz;

-- Б39: банк списав усю суму чарджбеку з автора → Sensoria повертає автору тариф окремим платежем за 5 робочих днів
create table if not exists public.tariff_refund_tasks (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.finance_payments (id) on delete restrict,
  purchase_id uuid not null,
  author_id uuid not null,
  amount_kop bigint not null check (amount_kop > 0),
  debited_at date not null,
  due_date date not null,
  status text not null default 'open' check (status in ('open', 'paid')),
  bank_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (payment_id)
);
alter table public.tariff_refund_tasks enable row level security;
drop policy if exists "author reads own tariff refunds" on public.tariff_refund_tasks;
create policy "author reads own tariff refunds" on public.tariff_refund_tasks for select to authenticated using (author_id = auth.uid());

-- який результат мав спір (для акта й звірки)
alter table public.finance_payments add column if not exists dispute_outcome text check (dispute_outcome in ('won', 'lost'));
alter table public.finance_payments add column if not exists dispute_debited_from text check (dispute_debited_from in ('author_full', 'proportional'));
alter table public.finance_payments add column if not exists dispute_closed_at timestamptz;

-- Б38: щомісячний акт про надання послуг
create table if not exists public.service_acts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  number text not null,
  data jsonb not null,               -- рядки акта, довідкові суми, реєстр замовлень (Додаток 1)
  issued_at timestamptz not null default now(),
  accept_until date not null,        -- 5 робочих днів з дня розміщення
  status text not null default 'issued' check (status in ('issued', 'accepted', 'accepted_silent', 'objected', 'signed')),
  decided_at timestamptz,
  objection text,
  unique (author_id, period)
);
alter table public.service_acts enable row level security;
drop policy if exists "author reads own acts" on public.service_acts;
create policy "author reads own acts" on public.service_acts for select to authenticated using (author_id = auth.uid());
-- рішення автора (прийняти / заперечити) — лише через edge-функцію finance

-- ── Додано 18.11.2026 (відповідь юриста й бухгалтера) ──

-- Святкові дні для «робочих днів». Під час воєнного стану свята робочі — таблиця порожня.
-- Після його скасування внесіть дати (ст. 73 КЗпП): insert into public.business_holidays (day, name) values ('2027-01-01', 'Новий рік');
create table if not exists public.business_holidays (
  day date primary key,
  name text not null
);
alter table public.business_holidays enable row level security; -- лише сервер (service role)

-- КЕП: акт спершу «draft» — Sensoria підписує його на id.gov.ua і завантажує; лише тоді акт розміщено автору
-- й біжать 5 робочих днів. ТОВ і ФОП на загальній системі завантажують свій підписаний примірник.
alter table public.service_acts drop constraint if exists service_acts_status_check;
alter table public.service_acts add constraint service_acts_status_check
  check (status in ('draft', 'issued', 'accepted', 'accepted_silent', 'objected', 'signed'));
alter table public.service_acts alter column status set default 'draft';
alter table public.service_acts add column if not exists operator_signed_path text;
alter table public.service_acts add column if not exists operator_signed_at timestamptz;
alter table public.service_acts add column if not exists author_signed_path text;
alter table public.service_acts add column if not exists author_signed_at timestamptz;

-- приватне сховище підписаних актів; доступ лише через edge-функцію finance (підписані посилання)
insert into storage.buckets (id, name, public, file_size_limit)
values ('service-acts', 'service-acts', false, 10485760)
on conflict (id) do nothing;
