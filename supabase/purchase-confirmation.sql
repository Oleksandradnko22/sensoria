-- Лист-підтвердження замовлення покупцю (ЗУ «Про захист прав споживачів», ст. 13 — підтвердження на тривкому носії).
-- Позначка, що лист уже надіслано: finance надсилає його один раз одразу після оплати, а нічні задачі повторюють невдалі.
-- Ідемпотентно; після purchase-consents.sql.
alter table public.purchase_consents add column if not exists confirmation_sent_at timestamptz;
-- замовлення, зроблені до цього оновлення, листа не отримують (інакше нічні задачі розіслали б їх заднім числом)
update public.purchase_consents set confirmation_sent_at = accepted_at where confirmation_sent_at is null;
