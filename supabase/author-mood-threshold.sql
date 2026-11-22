-- Настрій «до/після» для автора (юрист, 22.11.2026, Ю-3.3): лише середні значення по матеріалу, якщо відмітки
-- лишили щонайменше 10 учасників, і лише ті, хто має чинну згоду на дані про стан. Ідемпотентно; після
-- author-participants-functions.sql і health-consent.sql.
create or replace function public.author_mood_by_content(p_ids uuid[])
returns table (content_id uuid, avg_before numeric, avg_after numeric, people int)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select c.id, c.slug from public.content c
     where c.id = any (p_ids) and c.author_id = auth.uid()
  ),
  marks as (
    -- lessons of a program: 1–10, higher = calmer
    select m.id as content_id, k.user_id, k.before_value::numeric as b, k.after_value::numeric as a
      from mine m join public.content_item_mood_checkins k on k.program_id = m.id::text
     where k.before_value is not null and k.after_value is not null
    union all
    -- meditation sessions: 1–5 (1 напружено … 5 спокійно), brought to the same 10-point scale
    select m.id, k.user_id, k.before_value * 2, k.after_value * 2
      from mine m join public.meditation_mood_checkins k on k.meditation_id in (m.id::text, m.slug)
     where k.before_value is not null and k.after_value is not null
  ),
  consented as (
    select * from marks where public.has_current_consent(user_id, 'health_data')
  )
  select content_id, round(avg(b), 1), round(avg(a), 1), count(distinct user_id)::int
    from consented
   group by content_id
  having count(distinct user_id) >= 10;
$$;

revoke all on function public.author_mood_by_content(uuid[]) from public, anon;
grant execute on function public.author_mood_by_content(uuid[]) to authenticated;
