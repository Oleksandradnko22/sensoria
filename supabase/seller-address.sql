-- Місцезнаходження продавця (юрист, 22.11.2026, Ю-2.1): автор вказує його при підключенні оплат, покупець бачить
-- у кошику до оплати й у листі-підтвердженні. Ідемпотентно. Запустити ДО деплою finance.
alter table public.author_mono_receivers add column if not exists legal_address text;
alter table public.purchase_consents add column if not exists seller_address text;
notify pgrst, 'reload schema';
