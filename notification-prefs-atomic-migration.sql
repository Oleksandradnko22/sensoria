-- Atomic update of ONE notification preference.
-- Before: the client read the whole `notification_prefs` JSON, changed a key and wrote the whole
-- object back, so two open tabs (or devices) overwrote each other's changes.
-- Now: one key is merged inside the database in a single statement.
-- Run once in the Supabase SQL editor. The app falls back to a read-merge-write
-- if this function does not exist yet.

create or replace function public.set_notification_pref(p_notif_id text, p_email boolean)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.profiles
     set notification_prefs = jsonb_set(
           coalesce(notification_prefs, '{}'::jsonb),
           array[p_notif_id],
           jsonb_build_object('email', p_email),
           true
         )
   where id = auth.uid()
     and p_notif_id ~ '^[A-Za-z0-9_]{1,40}$';
$$;

revoke all on function public.set_notification_pref(text, boolean) from public;
grant execute on function public.set_notification_pref(text, boolean) to authenticated;
