-- Admin panel: roles, reasons in the audit log, restricting buyers' access.
-- Run in the Supabase SQL Editor (safe to re-run).
-- Run AFTER author-exit-migration.sql and complaints-migration.sql.

-- 1) Roles. is_admin stays the master switch; admin_role says what the person
--    may do: 'owner' (everything) or 'support' (view + handle requests, pause
--    a sale). An admin with no role set is treated as 'owner' (back-compat).
alter table public.profiles
  add column if not exists admin_role text
  check (admin_role in ('owner', 'support'));

update public.profiles set admin_role = 'owner' where is_admin and admin_role is null;

-- Nobody can give themselves a role from the browser (service role only).
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    new.is_admin := old.is_admin;
    new.admin_role := old.admin_role;
    new.is_banned := old.is_banned;
    new.chat_banned_until := old.chat_banned_until;
    new.chat_ban_permanent := old.chat_ban_permanent;
    new.chat_ban_count := old.chat_ban_count;
    new.chat_ban_since := old.chat_ban_since;
    new.left_platform_at := old.left_platform_at;
    new.member_since := old.member_since;
    new.email := old.email;
  end if;
  return new;
end;
$$;

-- 2) Why an admin did something (shown in «Журнал дій»).
alter table public.admin_actions add column if not exists reason text;

-- 3) Restricting access for ALL buyers of a material (serious risk / law /
--    third-party rights). Only the admin (service role) sets these; the
--    protect trigger below stops authors from touching them.
alter table public.content
  add column if not exists access_restricted_at timestamptz,
  add column if not exists access_restricted_reason text;

create or replace function public.guard_sale_status()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('sensoria.sale_system', true), '') = '1' then
    return new;
  end if;
  if auth.uid() is null then          -- service role (admin Edge Function)
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.sale_status := 'published';
    new.access_restricted_at := null;
    new.access_restricted_reason := null;
  else
    new.sale_status := old.sale_status;
    new.access_restricted_at := old.access_restricted_at;
    new.access_restricted_reason := old.access_restricted_reason;
  end if;
  return new;
end;
$$;

-- A purchase gives access only while the material is not restricted.
create or replace function public.has_active_purchase(p_content uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.purchases p
    join public.content c on c.id = p.content_id
    where p.content_id = p_content
      and p.participant_id = auth.uid()
      and p.status = 'completed'
      and c.access_restricted_at is null
  );
$$;
grant execute on function public.has_active_purchase(uuid) to authenticated;
