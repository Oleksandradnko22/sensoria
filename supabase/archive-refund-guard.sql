-- Archive rule, full version (docs/content-lifecycle.md §3). Run ONCE in the Supabase SQL editor; safe to re-run.
--
-- A material leaves sale (archive, or "unpublish" back to a draft) only when BOTH hold:
--   1) 14 days have passed since its last completed purchase (the buyer's refund window), and
--   2) no refund request on a purchase of it is still open (filed in the window, not yet reviewed by the team).
-- Buyers keep access either way; only new purchases stop.
--
-- Before this file:
--   * a refund request was not linked to its purchase (purchase_id stayed empty), so nothing could know it was open;
--   * only "→ archived" was checked: "published → draft" through the API removed a material from sale with no check.

-- 1. A refund request is tied to the person's own completed purchase, filed within 14 days of it.
drop policy if exists "participants create their own refund requests" on public.refund_requests;
create policy "participants create their own refund requests"
  on public.refund_requests for insert
  with check (
    auth.uid() = participant_id
    and (
      purchase_id is null -- older app versions; the team links these by hand
      or exists (
        select 1 from public.purchases p
        where p.id = refund_requests.purchase_id
          and p.participant_id = auth.uid()
          and p.status = 'completed'
          and p.purchased_at > now() - interval '14 days'
      )
    )
  );

create index if not exists refund_requests_purchase_open_idx on public.refund_requests (purchase_id) where status = 'open';

-- 2. Leaving sale is checked on archive AND on unpublish.
create or replace function public.enforce_archive_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_purchase timestamptz;
  open_refunds int;
begin
  if old.status = 'published' and new.status in ('archived', 'draft')
     or new.status = 'archived' and old.status is distinct from 'archived' then
    if auth.uid() is null then
      return new; -- server-side code (service role), e.g. closing an author account
    end if;
    if exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
      return new; -- complaint handling
    end if;
    select count(*) into open_refunds
      from public.refund_requests r
      join public.purchases p on p.id = r.purchase_id
     where p.content_id = new.id and r.status = 'open';
    if open_refunds > 0 then
      raise exception 'Зняти матеріал з продажу поки не можна: є відкритий запит на повернення коштів. Дочекайтеся, поки команда Sensoria його розгляне.'
        using errcode = 'P0001';
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

-- 3. What the cabinet needs to explain the rule in advance: for the author's OWN materials only, the date of the last
--    completed purchase and how many refund requests are still open (no buyer data is returned).
create or replace function public.my_archive_blockers(p_ids uuid[])
returns table (content_id uuid, last_purchase timestamptz, open_refunds int)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         (select max(p.purchased_at) from public.purchases p where p.content_id = c.id and p.status = 'completed'),
         (select count(*)::int from public.refund_requests r join public.purchases p on p.id = r.purchase_id
           where p.content_id = c.id and r.status = 'open')
    from public.content c
   where c.id = any (p_ids) and c.author_id = auth.uid();
$$;

revoke all on function public.my_archive_blockers(uuid[]) from public, anon;
grant execute on function public.my_archive_blockers(uuid[]) to authenticated;
