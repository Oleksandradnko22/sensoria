-- «Учасники» in the author cabinet: everything is counted in the database and only what the author may see is returned.
-- Run ONCE in the Supabase SQL editor; safe to re-run. Run it BEFORE deploying the site version that uses it.
--
-- 1) author_mood_by_content: the average state before → after per material, ONLY as an average and ONLY when at least
--    3 people marked it (fewer would point at a person). The author no longer reads anyone's individual marks.
-- 2) author_participants: one page of participants (unique people) with their materials, for ALL kinds of material:
--    buyers, people who added a free material, and people who started it (program progress, meditation sessions,
--    guide sections). Search, filters and paging are done here, so the cabinet never downloads everyone at once.

-- ── 1. state before → after, averages only ──────────────────────────────────────────────────────────────────────
drop policy if exists "authors view mood checkins on their own programs" on public.content_item_mood_checkins;

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
  )
  select content_id, round(avg(b), 1), round(avg(a), 1), count(distinct user_id)::int
    from marks
   group by content_id
  having count(distinct user_id) >= 3;
$$;

revoke all on function public.author_mood_by_content(uuid[]) from public, anon;
grant execute on function public.author_mood_by_content(uuid[]) to authenticated;

-- ── 2. participants, one page at a time ─────────────────────────────────────────────────────────────────────────
create or replace function public.author_participants(
  p_search text default null,
  p_content uuid default null,
  p_segment text default null,     -- 'new' | 'active' | 'inactive' | null
  p_sort text default 'recent',    -- 'recent' | 'name' | 'new' | 'inactive'
  p_limit int default 4,
  p_offset int default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select c.id, c.slug, c.kind from public.content c
     where c.author_id = auth.uid() and (c.status <> 'draft' or c.ever_published)
  ),
  required as (
    select m.content_id, ci.id::text as item_id
      from public.content_modules m join public.content_items ci on ci.module_id = m.id
     where ci.is_required and m.content_id in (select id from mine)
  ),
  touch as (
    select p.participant_id as user_id, p.content_id, p.purchased_at as at, null::jsonb as progress
      from public.purchases p join mine on mine.id = p.content_id where p.status = 'completed'
    union all
    select a.user_id, mine.id, a.acquired_at, null from public.acquired_content a join mine on a.content_id in (mine.id::text, mine.slug)
    union all
    select cp.user_id, mine.id, cp.updated_at, cp.progress from public.content_progress cp join mine on cp.content_id = mine.id::text
    union all
    select s.user_id, mine.id, coalesce(s.completed_at, s.started_at), null from public.meditation_sessions s join mine on s.meditation_id in (mine.id::text, mine.slug)
    union all
    select v.user_id, mine.id, v.created_at, null from public.guide_section_views v join mine on v.guide_id in (mine.id::text, mine.slug)
  ),
  entry as (
    select t.user_id, t.content_id, max(t.at) as last_active,
           (array_agg(t.progress) filter (where t.progress is not null))[1] as progress
      from touch t
     where t.user_id <> auth.uid()
     group by t.user_id, t.content_id
  ),
  entry_pct as (
    select e.*, mine.kind,
           (select count(*) from required r where r.content_id = e.content_id) as req,
           (select count(*) from required r where r.content_id = e.content_id
              and coalesce(e.progress ->> r.item_id, '') in ('completed', 'skipped')) as done
      from entry e join mine on mine.id = e.content_id
  ),
  entry_full as (
    select x.*,
           case when x.req > 0 and x.done >= x.req then 100
                when x.req > 0 and x.done > 0 then least(99, greatest(0, round(x.done * 100.0 / x.req)))::int
                else 0 end as percent,
           (x.kind = 'program' and x.req > 0 and x.done >= x.req) as completed
      from entry_pct x
  ),
  entry_seg as (
    select f.*,
           case when not f.completed and f.percent <= 15 and f.last_active > now() - interval '3 days' then 'new'
                when not f.completed and f.last_active < now() - interval '21 days' then 'inactive'
                else 'active' end as segment
      from entry_full f
  ),
  person as (
    select s.user_id,
           coalesce(pr.name, 'Учасник Sensoria') as name,
           max(s.last_active) as last_active,
           case when bool_or(s.segment = 'active') then 'active' when bool_or(s.segment = 'new') then 'new' else 'inactive' end as segment,
           bool_or(s.completed) as finished,
           jsonb_agg(jsonb_build_object('content_id', s.content_id, 'percent', s.percent, 'last_active', s.last_active, 'segment', s.segment)
                     order by s.last_active desc) as items,
           bool_or(s.content_id = p_content) as has_content
      from entry_seg s left join public.profiles pr on pr.id = s.user_id
     group by s.user_id, pr.name
  ),
  filtered as (
    select * from person
     where (p_search is null or p_search = '' or name ilike '%' || p_search || '%')
       and (p_content is null or has_content)
       and (p_segment is null or p_segment = '' or segment = p_segment)
  ),
  ranked as (
    select f.*, row_number() over (
             order by
               case when p_sort = 'name' then f.name end asc,
               case when p_sort = 'new' then (f.segment = 'new') end desc,
               case when p_sort = 'inactive' then f.last_active end asc,
               f.last_active desc
           ) as rn
      from filtered f
  ),
  page as (
    select * from ranked
     where rn > greatest(0, p_offset) and rn <= greatest(0, p_offset) + greatest(1, least(p_limit, 50))
  )
  select jsonb_build_object(
    'total', (select count(*) from person),
    'active7', (select count(*) from person where last_active > now() - interval '7 days'),
    'finished', (select count(*) from person where finished),
    'matching', (select count(*) from filtered),
    'people', coalesce((select jsonb_agg(jsonb_build_object('user_id', user_id, 'name', name, 'last_active', last_active, 'segment', segment, 'items', items) order by rn) from page), '[]'::jsonb)
  );
$$;

revoke all on function public.author_participants(text, uuid, text, text, int, int) from public, anon;
grant execute on function public.author_participants(text, uuid, text, text, int, int) to authenticated;

notify pgrst, 'reload schema';
