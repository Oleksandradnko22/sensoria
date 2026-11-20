-- «Тариф до повернення авторам» (відповіді monobank 20.11.2026, М6): при поверненні оплати ПІЗНІШЕ дня оплати банк
-- списує всю суму з рахунку Автора, а Тариф лишається на рахунку Sensoria — Sensoria перераховує його Автору протягом
-- 5 робочих днів. Той самий реєстр, що й для програного чарджбеку (Б39), тепер із причиною й нагадуванням.
-- Ідемпотентно; після acts-and-disputes.sql.
alter table public.tariff_refund_tasks add column if not exists reason text not null default 'chargeback';
alter table public.tariff_refund_tasks drop constraint if exists tariff_refund_tasks_reason_check;
alter table public.tariff_refund_tasks add constraint tariff_refund_tasks_reason_check check (reason in ('refund', 'chargeback'));
-- нагадування власниці за 2 робочі дні до строку — один раз
alter table public.tariff_refund_tasks add column if not exists reminded_at timestamptz;

-- Хеші текстів після М1–М8 (оферта, Умови, Правила повернення). Редакція 1.0 — повторної згоди не потрібно.
update public.legal_documents set text_hash = '147e741b9a2eef66de8b74ce7f86744b442160e57368fa4c1a2fc8381d01bd98' where document = 'author_agreement' and is_current;
update public.legal_documents set text_hash = '18b6ba6046055d3f9bc6d25ab642ad84837e513563bba5dc427053e5f5c6cac9' where document = 'terms' and is_current;
update public.legal_documents set text_hash = 'dde3983d5fea131482d16cc8c63123d8e767e992eabc12d625166b187cbe995e' where document = 'refunds' and is_current;

-- Межа «день у день» для повернень (відповідь monobank, питання 2 листа від 21.11.2026): до цього часу за Києвом
-- повернення в день оплати — скасування (нічого не зараховано); пізніше — списання з Автора й повернення тарифу.
-- '24:00' = уся календарна доба. Щойно банк відповість — змінити одним рядком, наприклад:
--   update public.finance_settings set refund_same_day_cutoff = '23:00' where id = 1;
alter table public.finance_settings add column if not exists refund_same_day_cutoff text not null default '24:00'
  check (refund_same_day_cutoff ~ '^([01][0-9]|2[0-4]):[0-5][0-9]$');
