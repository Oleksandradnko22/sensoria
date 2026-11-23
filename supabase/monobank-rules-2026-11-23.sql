-- Правила monobank для Авторів і Sensoria (відповіді банку й юриста 23.11.2026, «Ю-Б»). Ідемпотентно.
-- Запустити ДО деплою finance.
--   1) робочі email і телефон продавця для покупців (Б-3) + підтвердження «одна платформа — партнер monobank» (Б-2);
--   2) ті самі контакти в записі згоди покупця (для листа-підтвердження);
--   3) нагадування про строк повернення (Б9: не пізніше наступного робочого дня);
--   4) щоденна звірка тарифу: сума agentFee з виписки = платіж банку «Прийняті платежі за (дата) згідно реєстру» (Б2).
alter table public.author_mono_receivers add column if not exists buyer_email text;
alter table public.author_mono_receivers add column if not exists buyer_phone text;
alter table public.author_mono_receivers add column if not exists single_partner_at timestamptz;

alter table public.purchase_consents add column if not exists seller_email text;
alter table public.purchase_consents add column if not exists seller_phone text;

alter table public.refund_requests add column if not exists deadline_reminded_at timestamptz;

create table if not exists public.tariff_daily_checks (
  day date primary key,                       -- день оплат (за Києвом)
  expected_kop bigint not null default 0,     -- сума agentFee з виписки еквайрингу за день
  credited_kop bigint,                        -- надійшло на рахунок Sensoria (з виписки рахунку або введено вручну)
  source text check (source in ('bank', 'manual')),
  status text not null default 'waiting' check (status in ('ok', 'waiting', 'missing', 'mismatch')),
  alerted_at timestamptz,
  updated_at timestamptz not null default now()
);
-- лише сервер (service role): жодних політик для користувачів
alter table public.tariff_daily_checks enable row level security;

notify pgrst, 'reload schema';
