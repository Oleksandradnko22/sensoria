-- Chat bans with an escalating ladder.
--
-- After 3 BLOCK decisions the send-message Edge Function bans the person's
-- CHAT (not the account): 1st ban 3 days -> 2nd 7 days -> 3rd 14 days ->
-- 4th 30 days -> 5th forever. An admin can lift a ban in the panel
-- (Модерація / Користувачі -> "Зняти блокування чату").
--
-- Run once in Supabase -> SQL Editor, BEFORE deploying the updated
-- send-message and admin-data Edge Functions. Safe to run again.

alter table public.profiles
  add column if not exists chat_banned_until timestamptz,
  add column if not exists chat_ban_permanent boolean not null default false,
  add column if not exists chat_ban_count int not null default 0,
  add column if not exists chat_ban_since timestamptz;

-- (An earlier draft added a plain boolean chat_banned. It is not used any
-- more; drop it if it exists.)
alter table public.profiles drop column if exists chat_banned;

-- A person must be able to READ their own ban state (the Messages page
-- shows a countdown) — profiles is already readable by its owner — but
-- must never be able to change it from the browser: pin the columns in the
-- existing privileged-columns trigger.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    new.is_admin := old.is_admin;
    new.is_banned := old.is_banned;
    new.chat_banned_until := old.chat_banned_until;
    new.chat_ban_permanent := old.chat_ban_permanent;
    new.chat_ban_count := old.chat_ban_count;
    new.chat_ban_since := old.chat_ban_since;
    new.member_since := old.member_since;
    new.email := old.email;
  end if;
  return new;
end;
$$;
