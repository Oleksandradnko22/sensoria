-- Журнал видач захищених PDF + секретний ключ для невидимої мітки
-- (2026-10-06). Виконати в Supabase → SQL Editor одним запитом.
-- (Якщо раніше виконували guide-pdf-exports-migration.sql — той файл
-- замінено цим; стару таблицю можна прибрати: drop table if exists
-- public.guide_pdf_exports;)
--
-- Навіщо. Кожне завантаження PDF 
-- отримує випадковий token. Невидимий візерунок у пікселях будується не з
-- самого token, а з seed = HMAC(секрет, token). Секрет живе ТІЛЬКИ тут, у
-- базі, ніколи не потрапляє в код сайту: підробити чужу мітку (виставити
-- чужий token) чи передрахувати seed без секрету неможливо. Клієнт
-- отримує лише seed своєї власної видачі.
--
-- Як дізнатися, чий файл, коли детектор знайшов seed на скріншоті:
--   select e.created_at, e.kind, e.content_id, p.name, p.email
--   from public.pdf_exports e join public.profiles p on p.id = e.user_id
--   where e.seed = <seed>;
-- Усі seed для перебору детектором (за контентом):
--   select seed from public.pdf_exports where content_id = '<id>';

create extension if not exists pgcrypto;

-- Секрет: один рядок, RLS увімкнено і жодної політики — читає лише
-- security definer функція нижче та service role.
create table public.pdf_mark_secret (
  id integer primary key default 1 check (id = 1),
  secret text not null
);
insert into public.pdf_mark_secret (secret)
values (encode(gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;
alter table public.pdf_mark_secret enable row level security;

create table public.pdf_exports (
  id uuid primary key default gen_random_uuid(),
  -- 'guide_pdf' (PDF-версія гайда), 'uploaded_pdf' (завантажений автором),
  -- 'program_material' (матеріал програми)
  kind text not null check (kind in ('guide_pdf', 'uploaded_pdf', 'program_material')),
  content_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  token bigint not null unique check (token > 0 and token < 4294967296),
  seed bigint not null unique check (seed >= 0 and seed < 4294967296),
  created_at timestamptz not null default now()
);

create index pdf_exports_content_idx on public.pdf_exports (content_id, created_at desc);
create index pdf_exports_user_idx on public.pdf_exports (user_id, created_at desc);

alter table public.pdf_exports enable row level security;

-- Людина бачить лише свої рядки; додавати рядки напряму не може — лише
-- через функцію (щоб не підібрати собі token/seed).
create policy "users read their own pdf exports"
  on public.pdf_exports for select
  using (auth.uid() = user_id);

create or replace function public.issue_pdf_mark(p_kind text, p_content_id text)
returns table (token bigint, seed bigint)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_secret text;
  v_token bigint;
  v_seed bigint;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  select secret into v_secret from public.pdf_mark_secret where id = 1;
  -- Випадковий ненульовий 32-бітний token.
  loop
    v_token := (get_byte(gen_random_bytes(1), 0)::bigint << 24)
             | (get_byte(gen_random_bytes(1), 0)::bigint << 16)
             | (get_byte(gen_random_bytes(1), 0)::bigint << 8)
             |  get_byte(gen_random_bytes(1), 0)::bigint;
    exit when v_token > 0 and not exists (select 1 from public.pdf_exports where pdf_exports.token = v_token);
  end loop;
  -- seed = перші 32 біти HMAC-SHA256(секрет, token).
  v_seed := (get_byte(hmac(v_token::text, v_secret, 'sha256'), 0)::bigint << 24)
          | (get_byte(hmac(v_token::text, v_secret, 'sha256'), 1)::bigint << 16)
          | (get_byte(hmac(v_token::text, v_secret, 'sha256'), 2)::bigint << 8)
          |  get_byte(hmac(v_token::text, v_secret, 'sha256'), 3)::bigint;
  insert into public.pdf_exports (kind, content_id, user_id, token, seed)
  values (p_kind, p_content_id, v_user, v_token, v_seed);
  return query select v_token, v_seed;
end;
$$;

revoke all on function public.issue_pdf_mark(text, text) from public;
grant execute on function public.issue_pdf_mark(text, text) to authenticated;
