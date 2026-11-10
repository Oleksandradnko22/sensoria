-- SECURITY: stop buyers from creating "paid" purchases themselves.
--
-- Today the policy below lets any signed-in participant insert a completed purchase for themselves
-- (any content, any amount): that is free access. With real payments, purchases must be created
-- only by the server (finance Edge Function, service role) after monobank confirmed the money.
--
-- Run this when you connect payments (the site does not insert purchases from the browser,
-- so running it earlier changes nothing for users). Safe to re-run.

drop policy if exists "participants create their own purchases" on public.purchases;
