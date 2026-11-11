-- Privacy fixes. Run ONCE in the Supabase SQL editor; safe to re-run.
-- Deploy the site (commit + push) together with this file: the new site reads private fields through the functions below.
--
-- 1) Profiles: before, the whole row (email, ban flags, notification settings…) of EVERY person was readable by anyone,
--    even without signing in. Now everyone sees only the public card (name, photo, role, since when), and a person's own
--    private fields are read through my_private_profile(). Server code (Edge Functions, service role) is not affected.
-- 2) Reflections and practice answers are a person's private journal. Before, an author could read their full text
--    through the API (the cabinet only showed counts). Now an author gets the counts only, through a function.

-- ── 1. profiles: public columns only ─────────────────────────────────────────────────────────────────────────────
revoke select on public.profiles from anon, authenticated;
grant select (id, role, name, avatar_initials, avatar_url, member_since, created_at, is_admin, left_platform_at)
  on public.profiles to anon, authenticated;

create or replace function public.my_private_profile()
returns table (
  email text,
  is_banned boolean,
  deletion_requested_at timestamptz,
  notification_prefs jsonb,
  chat_banned_until timestamptz,
  chat_ban_permanent boolean,
  admin_role text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.email, p.is_banned, p.deletion_requested_at, p.notification_prefs,
         p.chat_banned_until, p.chat_ban_permanent, p.admin_role
    from public.profiles p
   where p.id = auth.uid();
$$;

revoke all on function public.my_private_profile() from public, anon;
grant execute on function public.my_private_profile() to authenticated;

-- ── 2. reflections / practice answers: counts only for the author ────────────────────────────────────────────────
drop policy if exists "authors view practice responses on their own programs" on public.content_item_practice_responses;
drop policy if exists "authors view reflections on their own programs" on public.content_item_reflections;

create or replace function public.author_engagement_counts(p_program text, p_user uuid)
returns table (practice_count int, reflection_count int)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.content_item_practice_responses r where r.program_id = p_program and r.user_id = p_user),
    (select count(*)::int from public.content_item_reflections r where r.program_id = p_program and r.user_id = p_user)
  where exists (select 1 from public.content c where c.id::text = p_program and c.author_id = auth.uid());
$$;

revoke all on function public.author_engagement_counts(text, uuid) from public, anon;
grant execute on function public.author_engagement_counts(text, uuid) to authenticated;

notify pgrst, 'reload schema';
