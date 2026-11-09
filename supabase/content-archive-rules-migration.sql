-- Content lifecycle rules (see docs/content-lifecycle.md). Run ONCE in the Supabase SQL editor; safe to re-run.
--
-- 1) An author cannot delete a material at all: only edit it, archive it and restore it.
--    (There is already no DELETE policy on public.content; this revokes the privilege as well, so a policy added
--    by mistake later would still not open it. Cascades and the service role are not affected.)
-- 2) A material can be ARCHIVED no earlier than 14 days after its last completed purchase: the buyer's refund
--    window. Enforced here so the rule holds even if someone calls the API directly, not only through the cabinet.
--    Not applied to: Sensoria's own server code (service role: auth.uid() is null, e.g. closing an author account),
--    and admins (complaint handling).

revoke delete on public.content from anon, authenticated;

create or replace function public.enforce_archive_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_purchase timestamptz;
begin
  if new.status = 'archived' and old.status is distinct from 'archived' then
    if auth.uid() is null then
      return new; -- server-side code (service role)
    end if;
    if exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
      return new;
    end if;
    select max(purchased_at) into last_purchase
      from public.purchases
     where content_id = new.id and status = 'completed';
    if last_purchase is not null and last_purchase > now() - interval '14 days' then
      raise exception 'Архівувати матеріал можна не раніше ніж через 14 днів після останньої покупки (з %).',
        to_char((last_purchase + interval '14 days') at time zone 'Europe/Kyiv', 'DD.MM.YYYY')
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_archive_cooldown_trg on public.content;
create trigger enforce_archive_cooldown_trg
  before update of status on public.content
  for each row execute function public.enforce_archive_cooldown();
