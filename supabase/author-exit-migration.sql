-- Sensoria — author exit: stop sales, keep buyers' access, close the chat.
-- Run ONCE in the Supabase SQL Editor (safe to re-run), then redeploy the
-- Edge Functions: delete-account, purge-deleted-accounts, send-message.
--
-- Rules implemented here (see Умови використання and Договір з автором):
--  1. An author cannot delete a course that has been sold. They can stop
--     selling it (status 'archived'); buyers keep their access.
--  2. Content stays in Sensoria's database/storage. It does not disappear
--     because the author's account is closed.
--  4. Closing the account does not cancel obligations: purchases, refunds
--     and payout settings are kept.
--  (Rule 3 — delayed payouts / reserve — needs the payment provider; there
--   is nothing to enforce in the database until payments are connected.)

-- 1) When an author left the platform (null = still here).
alter table public.profiles add column if not exists left_platform_at timestamptz;

-- 2) Buyers can read what they paid for, whatever its status.
--    SECURITY DEFINER avoids an RLS recursion (purchases' own policy reads content).
create or replace function public.has_active_purchase(p_content uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.purchases p
    where p.content_id = p_content
      and p.participant_id = auth.uid()
      and p.status = 'completed'
  );
$$;
grant execute on function public.has_active_purchase(uuid) to authenticated;

drop policy if exists "published content is publicly readable" on public.content;
create policy "published content is publicly readable"
  on public.content for select
  using (status = 'published' or auth.uid() = author_id or public.has_active_purchase(id));

drop policy if exists "modules follow their content's visibility" on public.content_modules;
create policy "modules follow their content's visibility"
  on public.content_modules for select
  using (
    exists (
      select 1 from public.content c
      where c.id = content_id
        and (c.status = 'published' or c.author_id = auth.uid() or public.has_active_purchase(c.id))
    )
  );

drop policy if exists "items follow their content's visibility" on public.content_items;
create policy "items follow their content's visibility"
  on public.content_items for select
  using (
    exists (
      select 1 from public.content_modules m
      join public.content c on c.id = m.content_id
      where m.id = module_id
        and (c.status = 'published' or c.author_id = auth.uid() or public.has_active_purchase(c.id))
    )
  );

-- 3) A sold course cannot be deleted (friendly message instead of a raw FK error).
create or replace function public.protect_sold_content()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.purchases where content_id = old.id) then
    raise exception 'Цей матеріал уже придбано, тому його не можна видалити. Зніміть його з продажу (архів): покупці збережуть доступ.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists protect_sold_content_trg on public.content;
create trigger protect_sold_content_trg
  before delete on public.content
  for each row execute function public.protect_sold_content();

create table if not exists public.closed_authors (
  profile_id uuid primary key references public.profiles (id) on delete restrict,
  former_name text not null,
  closed_at timestamptz not null default now()
);
alter table public.closed_authors enable row level security;
revoke all on public.closed_authors from anon, authenticated;

-- 4) Close an author's account WITHOUT deleting what buyers paid for.
--    Called only by the purge-deleted-accounts Edge Function (service role).
create or replace function public.close_author_account(p_author uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = p_author and role = 'author') then
    raise exception 'Not an author account';
  end if;

  -- stop sales of everything that has buyers; buyers keep access (archived)
  update public.content c
     set status = 'archived', updated_at = now()
   where c.author_id = p_author
     and c.status <> 'archived'
     and exists (select 1 from public.purchases p where p.content_id = c.id);

  -- unsold material (drafts, items nobody bought) is removed
  delete from public.content c
   where c.author_id = p_author
     and not exists (select 1 from public.purchases p where p.content_id = c.id);

  -- public contact/bio details go; payout_settings stay until settlements are done
  delete from public.author_details where profile_id = p_author;

  -- keep the real name privately for settlements (no RLS policies = service role only)
  insert into public.closed_authors (profile_id, former_name)
  select id, name from public.profiles where id = p_author
  on conflict (profile_id) do nothing;

  update public.profiles
     set left_platform_at = coalesce(left_platform_at, now()),
         avatar_url = null,
         name = 'Sensoria',
         avatar_initials = 'S',
         email = 'closed-' || p_author::text || '@deleted.invalid',
         notification_prefs = '{}'::jsonb
   where id = p_author;
end;
$$;

revoke all on function public.close_author_account(uuid) from public, anon, authenticated;
