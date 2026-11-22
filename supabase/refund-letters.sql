-- Листи покупцю про повернення (юрист, 22.11.2026, Ю-5.1а): «Запит отримано» надсилається один раз.
-- Ідемпотентно.
alter table public.refund_requests add column if not exists ack_sent_at timestamptz;
notify pgrst, 'reload schema';
