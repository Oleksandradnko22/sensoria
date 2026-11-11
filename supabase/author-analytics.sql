-- «Аналітика» in the author cabinet. Run ONCE in the Supabase SQL editor; safe to re-run.
-- Run it BEFORE deploying the site version that uses it.
--
-- 1) content_view_daily + log_content_view(): how many times a material's page was opened, per day and per source
--    (through Sensoria / through the author's own link). One counter row per material, day and source: no person,
--    no IP, nothing personal is stored. The site counts a material once per browser session.
-- 2) author_analytics(p_days): everything the tab shows, counted in the database for the author's own materials and
--    returned as numbers only (no names, no texts).

-- ── 1. page views ───────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.content_view_daily (
  content_id uuid not null references public.content (id) on delete cascade,
  day date not null,
  source text not null check (source in ('catalog', 'referral')),
  views int not null default 0,
  primary key (content_id, day, source)
);
alter table public.content_view_daily enable row level security;
-- no policies: read and written only through the functions below

create or replace function public.log_content_view(p_key text, p_ref boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_author uuid;
  v_source text := 'catalog';
  v_ref boolean := false;
begin
  select c.id, c.author_id into v_id, v_author
    from public.content c
   where (c.id::text = p_key or c.slug = p_key) and c.status = 'published'
   limit 1;
  if v_id is null then return; end if;
  if auth.uid() is not null and auth.uid() = v_author then return; end if; -- the author's own visits don't count
  if p_ref then
    v_source := 'referral';
  elsif auth.uid() is not null and to_regclass('public.referral_attributions') is not null then
    -- the referral table comes with the finance migration; until then only the browser's hint counts
    execute 'select exists (select 1 from public.referral_attributions where buyer_id = $1 and author_id = $2 and created_at > now() - interval ''30 days'')'
      into v_ref using auth.uid(), v_author;
    if v_ref then v_source := 'referral'; end if;
  end if;
  insert into public.content_view_daily (content_id, day, source, views)
  values (v_id, (now() at time zone 'Europe/Kyiv')::date, v_source, 1)
  on conflict (content_id, day, source) do update set views = public.content_view_daily.views + 1;
end;
$$;

revoke all on function public.log_content_view(text, boolean) from public;
grant execute on function public.log_content_view(text, boolean) to anon, authenticated;

-- ── 2. analytics for the signed-in author ───────────────────────────────────────────────────────────────────────
create or replace function public.author_analytics(p_days int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select greatest(7, least(p_days, 365)) as days,
           (now() at time zone 'Europe/Kyiv')::date as today
  ),
  bounds as (
    select days, today, today - days + 1 as since, today - 2 * days + 1 as prev_since from params
  ),
  mine as (
    select c.id, c.slug, c.kind, c.title from public.content c
     where c.author_id = auth.uid() and (c.status <> 'draft' or c.ever_published)
  ),
  -- views
  v as (
    select d.content_id, d.day, d.source, d.views from public.content_view_daily d where d.content_id in (select id from mine)
  ),
  -- paid sales (source and the author's share come from the finance record when there is one)
  sale as (
    select p.content_id, (p.purchased_at at time zone 'Europe/Kyiv')::date as day,
           -- read through to_jsonb: works whether or not the finance migration (sale_source, author_kop…) has been run
           coalesce(to_jsonb(fp) ->> 'sale_source', 'catalog') as source,
           coalesce(((to_jsonb(fp) ->> 'author_kop')::numeric - coalesce((to_jsonb(fp) ->> 'author_refunded_kop')::numeric, 0)) / 100.0, p.amount * 0.7) as author_uah
      from public.purchases p
      left join public.finance_payments fp on (to_jsonb(fp) ->> 'purchase_id') = p.id::text
     where p.status = 'completed' and p.content_id in (select id from mine)
  ),
  free_add as (
    select mine.id as content_id, (a.acquired_at at time zone 'Europe/Kyiv')::date as day
      from public.acquired_content a join mine on a.content_id in (mine.id::text, mine.slug)
  ),
  -- everyone who has anything to do with a material (all time)
  people as (
    select p.participant_id as user_id, p.content_id, p.purchased_at as at from public.purchases p where p.status = 'completed' and p.content_id in (select id from mine)
    union all select a.user_id, mine.id, a.acquired_at from public.acquired_content a join mine on a.content_id in (mine.id::text, mine.slug)
    union all select cp.user_id, mine.id, cp.updated_at from public.content_progress cp join mine on cp.content_id = mine.id::text
    union all select s.user_id, mine.id, coalesce(s.completed_at, s.started_at) from public.meditation_sessions s join mine on s.meditation_id in (mine.id::text, mine.slug)
    union all select g.user_id, mine.id, g.created_at from public.guide_section_views g join mine on g.guide_id in (mine.id::text, mine.slug)
  ),
  required as (
    select m.content_id, m.order_index, ci.id::text as item_id
      from public.content_modules m join public.content_items ci on ci.module_id = m.id
     where ci.is_required and m.content_id in (select id from mine where kind = 'program')
  ),
  prog as (
    select cp.content_id::uuid as content_id, cp.user_id, cp.progress
      from public.content_progress cp join mine on cp.content_id = mine.id::text and mine.kind = 'program'
  ),
  prog_done as (
    select pr.content_id, pr.user_id,
           not exists (select 1 from required r where r.content_id = pr.content_id
                        and coalesce(pr.progress ->> r.item_id, '') not in ('completed', 'skipped'))
           and exists (select 1 from required r where r.content_id = pr.content_id) as done
      from prog pr
  ),
  per_material as (
    select m.id, m.kind, m.title,
      coalesce((select sum(views) from v, bounds b where v.content_id = m.id and v.day >= b.since), 0) as views,
      (select count(*) from sale, bounds b where sale.content_id = m.id and sale.day >= b.since) as sales,
      coalesce((select sum(author_uah) from sale, bounds b where sale.content_id = m.id and sale.day >= b.since), 0) as income,
      (select count(*) from free_add, bounds b where free_add.content_id = m.id and free_add.day >= b.since) as free_adds,
      (select count(distinct user_id) from people where people.content_id = m.id and people.user_id <> auth.uid()) as participants,
      (select round(100.0 * count(*) filter (where done) / nullif(count(*), 0)) from prog_done where prog_done.content_id = m.id) as completion,
      (select count(*) from public.meditation_sessions s, bounds b where s.meditation_id in (m.id::text, m.slug) and (s.started_at at time zone 'Europe/Kyiv')::date >= b.since) as listens,
      (select round(100.0 * count(*) filter (where s.completed_at is not null) / nullif(count(*), 0)) from public.meditation_sessions s where s.meditation_id in (m.id::text, m.slug)) as listened_to_end,
      (select count(distinct g.user_id) from public.guide_section_views g, bounds b where g.guide_id in (m.id::text, m.slug) and (g.created_at at time zone 'Europe/Kyiv')::date >= b.since) as readers,
      (select round(avg(r.rating)::numeric, 1) from public.reviews r where r.content_id::text in (m.id::text, m.slug)) as rating,
      (select count(*) from public.reviews r where r.content_id::text in (m.id::text, m.slug)) as reviews,
      (select round(100.0 * count(*) filter (where f.is_helpful) / nullif(count(*), 0))
         from public.content_item_feedback f
        where f.content_item_id in (select ci.id::text from public.content_modules cm join public.content_items ci on ci.module_id = cm.id where cm.content_id = m.id)) as helpful,
      (select count(*) from public.program_saved_for_later s where s.program_id in (m.id::text, m.slug))
        + (select count(*) from public.guide_saved_for_later s where s.guide_id in (m.id::text, m.slug)) as saves,
      (select count(*) from public.cart_items ci where ci.content_id in (m.id::text, m.slug)) as in_carts
    from mine m
  ),
  funnels as (
    select m.id, m.title,
      (select jsonb_agg(jsonb_build_object('title', md.title, 'reached',
          (select round(100.0 * count(*) / nullif((select count(*) from prog where prog.content_id = m.id), 0))
             from prog pr
            where pr.content_id = m.id
              and exists (select 1 from public.content_modules m2 join public.content_items i2 on i2.module_id = m2.id
                           where m2.content_id = m.id and m2.order_index >= md.order_index and pr.progress ? i2.id::text)))
        order by md.order_index)
         from public.content_modules md where md.content_id = m.id) as modules,
      (select count(*) from prog where prog.content_id = m.id) as started
    from mine m where m.kind = 'program'
  ),
  series as (
    select d::date as day,
      coalesce((select sum(views) from v where v.day = d::date), 0) as views,
      (select count(*) from sale where sale.day = d::date) as sales
    from bounds b, generate_series(b.since, b.today, interval '1 day') d
  )
  select jsonb_build_object(
    'days', (select days from bounds),
    'views', coalesce((select sum(views) from v, bounds b where v.day >= b.since), 0),
    'views_prev', coalesce((select sum(views) from v, bounds b where v.day >= b.prev_since and v.day < b.since), 0),
    'views_referral', coalesce((select sum(views) from v, bounds b where v.day >= b.since and v.source = 'referral'), 0),
    'sales', (select count(*) from sale, bounds b where sale.day >= b.since),
    'sales_prev', (select count(*) from sale, bounds b where sale.day >= b.prev_since and sale.day < b.since),
    'sales_referral', (select count(*) from sale, bounds b where sale.day >= b.since and sale.source = 'referral'),
    'income', coalesce((select round(sum(author_uah)) from sale, bounds b where sale.day >= b.since), 0),
    'income_prev', coalesce((select round(sum(author_uah)) from sale, bounds b where sale.day >= b.prev_since and sale.day < b.since), 0),
    'free_adds', (select count(*) from free_add, bounds b where free_add.day >= b.since),
    'new_people', (select count(*) from (select user_id, min(at) as first_at from people where user_id <> auth.uid() group by user_id) x, bounds b where (x.first_at at time zone 'Europe/Kyiv')::date >= b.since),
    'active7', (select count(distinct user_id) from people where at > now() - interval '7 days' and user_id <> auth.uid()),
    'active30', (select count(distinct user_id) from people where at > now() - interval '30 days' and user_id <> auth.uid()),
    'series', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'views', views, 'sales', sales) order by day) from series), '[]'::jsonb),
    'materials', coalesce((select jsonb_agg(to_jsonb(pm) order by pm.income desc, pm.views desc) from per_material pm), '[]'::jsonb),
    'funnels', coalesce((select jsonb_agg(jsonb_build_object('content_id', f.id, 'title', f.title, 'started', f.started, 'modules', coalesce(f.modules, '[]'::jsonb))) from funnels f where f.started > 0), '[]'::jsonb)
  );
$$;

revoke all on function public.author_analytics(int) from public, anon;
grant execute on function public.author_analytics(int) to authenticated;

notify pgrst, 'reload schema';
