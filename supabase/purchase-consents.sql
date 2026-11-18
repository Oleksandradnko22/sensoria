-- Згода на негайний доступ при кожній покупці (ТЗ 3.2; Угода учасника, «Галочка на сторінці оплати»). Ідемпотентно.
-- Запис робить лише сервер оплати (finance) — до створення рахунку в банку, разом з номером замовлення.
-- Записи не видаляються при закритті акаунта: це доказ для спорів і чарджбеків.

create table if not exists public.purchase_consents (
  invoice_id uuid primary key references public.mono_invoices (id) on delete restrict,
  buyer_id uuid references auth.users (id) on delete set null,
  content_id uuid not null,
  seller_legal_name text not null,
  seller_code_masked text not null,
  consent_text text not null,
  ip inet,
  user_agent text,
  accepted_at timestamptz not null default now()
);
alter table public.purchase_consents enable row level security;
drop policy if exists "buyer reads own purchase consents" on public.purchase_consents;
create policy "buyer reads own purchase consents" on public.purchase_consents for select to authenticated using (auth.uid() = buyer_id);
-- клієнт не пише й не змінює ці записи: лише service role (edge-функція finance)
