-- Промокоди автора (оферта Б33, ТЗ 11.1). Ідемпотентно; запускає власниця в SQL Editor.
-- Модель: знижка за рахунок автора, тариф Sensoria — 15 % від ціни без знижки, знижка не більше 50 %.
-- Запускати після legal-gate-migration.sql. Потім задеплоїти finance.

create table if not exists public.author_promo_codes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{3,20}$'),
  discount_percent int not null check (discount_percent between 1 and 50),
  content_id uuid references public.content (id) on delete cascade,  -- null = усі матеріали автора
  max_uses int not null check (max_uses between 1 and 10000),
  uses int not null default 0 check (uses >= 0),
  active boolean not null default true,
  expires_at timestamptz,
  reason text not null default 'Інше' check (char_length(reason) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (author_id, code)
);
alter table public.author_promo_codes enable row level security;

-- Автор бачить і створює лише свої коди; не видаляє (лише вимикає), лічильник використань не змінює.
drop policy if exists "author reads own promo codes" on public.author_promo_codes;
create policy "author reads own promo codes" on public.author_promo_codes for select to authenticated using (author_id = auth.uid());
drop policy if exists "author creates own promo codes" on public.author_promo_codes;
create policy "author creates own promo codes" on public.author_promo_codes for insert to authenticated
  with check (
    author_id = auth.uid()
    and uses = 0
    and (select role from public.profiles where id = auth.uid()) = 'author'
    and (content_id is null or exists (select 1 from public.content c where c.id = content_id and c.author_id = auth.uid()))
  );
drop policy if exists "author updates own promo codes" on public.author_promo_codes;
create policy "author updates own promo codes" on public.author_promo_codes for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
revoke update on public.author_promo_codes from authenticated;
grant update (active, expires_at, max_uses) on public.author_promo_codes to authenticated;
revoke delete on public.author_promo_codes from authenticated;

-- Не більше 5 активних кодів в одного автора.
create or replace function public.promo_codes_active_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.active and (select count(*) from author_promo_codes where author_id = new.author_id and active and id <> new.id) >= 5 then
    raise exception 'promo_limit: не більше 5 активних промокодів' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists promo_codes_active_limit on public.author_promo_codes;
create trigger promo_codes_active_limit before insert or update of active on public.author_promo_codes
  for each row execute function public.promo_codes_active_limit();

-- Використання рахує лише сервер (після підтвердженої оплати).
create or replace function public.increment_promo_use(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update author_promo_codes set uses = uses + 1 where id = p_id;
$$;
revoke execute on function public.increment_promo_use(uuid) from public, anon, authenticated;

-- Ціна без знижки, знижка й код — у рахунку банку та в платежі.
alter table public.mono_invoices
  add column if not exists list_kop bigint,
  add column if not exists discount_kop bigint,
  add column if not exists promo_code_id uuid references public.author_promo_codes (id) on delete set null;
alter table public.finance_payments
  add column if not exists list_kop bigint,
  add column if not exists discount_kop bigint,
  add column if not exists promo_code_id uuid references public.author_promo_codes (id) on delete set null;
