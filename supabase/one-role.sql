-- One role per account: an author account stays an author, a participant account stays a participant. Changing the
-- role is possible only right after sign-up (a new Google account picks the form it came through), or by the admin /
-- server. Otherwise: a new account with another e-mail. Run ONCE in the Supabase SQL editor; safe to re-run.
create or replace function public.profiles_role_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is null then return new; end if;                -- server functions, SQL editor
    if public.feed_is_admin(auth.uid()) then return new; end if;  -- the admin
    if auth.uid() = new.id and old.role = 'participant'
       and exists (select 1 from auth.users u where u.id = new.id and u.created_at > now() - interval '15 minutes') then
      return new;                                                 -- a brand-new account choosing its role
    end if;
    raise exception 'Роль акаунта змінити не можна: автор і учасник — різні акаунти з різною поштою.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard before update of role on public.profiles for each row execute function public.profiles_role_guard();
