-- «Публікації» as three feeds (like Threads). Run ONCE in the Supabase SQL editor; safe to re-run.
-- Run it BEFORE deploying the site that uses it.
--
--   «Для всіх»       audience 'all'          authors write;               every signed-in person reads (no guests)
--   «Для учасників»  audience 'participants' participants write (authors only like and comment); every signed-in person reads
--   «Для авторів»    audience 'authors'      authors write and read
--
-- Participants write text only (no photos, video or attached material). Existing posts become «Для всіх».

alter table public.author_posts add column if not exists audience text not null default 'all';
alter table public.author_posts drop constraint if exists author_posts_audience_chk;
alter table public.author_posts add constraint author_posts_audience_chk check (audience in ('all', 'participants', 'authors'));
create index if not exists author_posts_feed_idx on public.author_posts (audience, created_at desc);
grant update (audience) on public.author_posts to authenticated;

-- who is an author (admins see everything as authors do)
create or replace function public.feed_is_author(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = p_user and p.role in ('author', 'admin'));
$$;
revoke all on function public.feed_is_author(uuid) from public, anon;
grant execute on function public.feed_is_author(uuid) to authenticated;

-- reading: only signed-in people; «Для авторів» only for authors; your own posts always
drop policy if exists "author posts are publicly readable" on public.author_posts;
drop policy if exists "feed posts readable by audience" on public.author_posts;
create policy "feed posts readable by audience" on public.author_posts for select using (
  auth.uid() is not null
  and (audience in ('all', 'participants') or author_id = auth.uid() or public.feed_is_author(auth.uid()))
);

-- writing: authors into «Для всіх» / «Для авторів»; a participant only into «Для учасників», only text; never a banned account
drop policy if exists "authors create their own posts" on public.author_posts;
drop policy if exists "feed posts written by audience" on public.author_posts;
create policy "feed posts written by audience" on public.author_posts for insert with check (
  auth.uid() = author_id
  and not exists (select 1 from public.profiles b where b.id = auth.uid() and coalesce((to_jsonb(b) ->> 'is_banned')::boolean, false))
  and (
    (public.feed_is_author(auth.uid()) and audience in ('all', 'authors'))
    or (not public.feed_is_author(auth.uid()) and audience = 'participants' and coalesce(array_length(images, 1), 0) = 0 and video_url is null and content_id is null and not is_pinned)
  )
);
-- a participant cannot move a post into another feed or add media later
drop policy if exists "authors edit their own posts" on public.author_posts;
create policy "authors edit their own posts" on public.author_posts for update
  using (auth.uid() = author_id)
  with check (
    auth.uid() = author_id
    and (
      (public.feed_is_author(auth.uid()) and audience in ('all', 'authors'))
      or (not public.feed_is_author(auth.uid()) and audience = 'participants' and coalesce(array_length(images, 1), 0) = 0 and video_url is null and content_id is null and not is_pinned)
    )
  );

-- one page of a feed: 15 posts with the author, counters and «liked by me», newest first
-- p_feed: 'all' | 'participants' | 'authors' | 'mine'
create or replace function public.feed_page(p_feed text, p_before timestamptz default null, p_limit int default 15)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (select auth.uid() as id, public.feed_is_author(auth.uid()) as is_author),
  page as (
    select p.*
      from public.author_posts p, viewer v
     where v.id is not null
       and (case p_feed
              when 'mine' then p.author_id = v.id
              when 'authors' then p.audience = 'authors' and v.is_author
              when 'participants' then p.audience = 'participants'
              else p.audience = 'all'
            end)
       and (p_before is null or p.created_at < p_before)
     order by p.created_at desc
     limit greatest(1, least(coalesce(p_limit, 15), 30)) + 1
  )
  select jsonb_build_object(
    'has_more', (select count(*) from page) > greatest(1, least(coalesce(p_limit, 15), 30)),
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
        from (
          select pg.id, pg.author_id, pg.body, pg.content_id, pg.content_kind, pg.is_pinned, pg.images, pg.video_url, pg.is_share,
                 to_jsonb(pg) ->> 'image_alt' as image_alt, pg.audience, pg.created_at, pg.updated_at,
                 coalesce(pr.name, 'Учасник Sensoria') as author_name, pr.avatar_url as author_avatar, pr.role as author_role,
                 (select count(*) from public.author_post_likes l where l.post_id = pg.id)::int as like_count,
                 (select count(*) from public.author_post_comments c where c.post_id = pg.id)::int as comment_count,
                 exists (select 1 from public.author_post_likes l, viewer v where l.post_id = pg.id and l.user_id = v.id) as liked
            from (select * from page order by created_at desc limit greatest(1, least(coalesce(p_limit, 15), 30))) pg
            left join public.profiles pr on pr.id = pg.author_id
           where not coalesce((to_jsonb(pr) ->> 'is_banned')::boolean, false)
        ) x
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.feed_page(text, timestamptz, int) from public, anon;
grant execute on function public.feed_page(text, timestamptz, int) to authenticated;

-- ── «Рекомендовані»: the same feed ranked for the person looking at it ─────────────────────────────────────────
-- weight = (likes + 3 × comments + 2 if the post's author answers in the discussion + a start bonus for a fresh
--           post nobody reacted to yet) / (hours since posting + 2) ^ 1.3
--        × 2 if I follow the author, × 1.5 if I bought / study their material, × 1.3 if I reacted to them recently
--        × ½ for each further post of the same author higher up (no feed of one person)
-- Only the last 21 days; my own posts are not recommended to me (except in the first hour, so I see mine went out).
create or replace function public.feed_top(p_feed text, p_offset int default 0, p_limit int default 15)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (select auth.uid() as id, public.feed_is_author(auth.uid()) as is_author),
  cand as (
    select p.*
      from public.author_posts p, viewer v
     where v.id is not null
       and (p.author_id <> v.id or p.created_at > now() - interval '1 hour') -- my own: only just written, so I see it went out
       and p.created_at > now() - interval '21 days'
       and (case p_feed when 'authors' then p.audience = 'authors' and v.is_author when 'participants' then p.audience = 'participants' else p.audience = 'all' end)
  ),
  eng as (
    select c.id, c.author_id, c.created_at,
           (select count(*) from public.author_post_likes l where l.post_id = c.id) as likes,
           (select count(*) from public.author_post_comments m where m.post_id = c.id) as comments,
           exists (select 1 from public.author_post_comments m where m.post_id = c.id and m.user_id = c.author_id) as author_answers
      from cand c
  ),
  mine as (
    select
      (select array_agg(f.author_id) from public.author_follows f, viewer v where f.follower_id = v.id) as follows,
      (select array_agg(distinct ct.author_id) from public.content ct, viewer v
        where exists (select 1 from public.purchases pu where pu.participant_id = v.id and pu.content_id = ct.id and pu.status = 'completed')
           or exists (select 1 from public.content_progress cp where cp.user_id = v.id and cp.content_id = ct.id::text)) as studies,
      (select array_agg(distinct ap.author_id) from public.author_posts ap, viewer v
        where ap.created_at > now() - interval '60 days'
          and (exists (select 1 from public.author_post_likes l where l.post_id = ap.id and l.user_id = v.id)
               or exists (select 1 from public.author_post_comments m where m.post_id = ap.id and m.user_id = v.id))) as reacted
  ),
  scored as (
    select e.id, e.author_id, e.created_at,
           (e.likes + 3 * e.comments + case when e.author_answers then 2 else 0 end
              + case when e.likes + e.comments = 0 and e.created_at > now() - interval '24 hours' then 2 else 0 end + 1)
           / power(extract(epoch from now() - e.created_at) / 3600 + 2, 1.3)
           * case when e.author_id = any(coalesce(m.follows, '{}')) then 2 else 1 end
           * case when e.author_id = any(coalesce(m.studies, '{}')) then 1.5 else 1 end
           * case when e.author_id = any(coalesce(m.reacted, '{}')) then 1.3 else 1 end as w
      from eng e, mine m
  ),
  spread as (
    select s.*, s.w * power(0.5, row_number() over (partition by s.author_id order by s.w desc) - 1) as rank_w from scored s
  ),
  page as (
    select sp.id, sp.rank_w from spread sp order by sp.rank_w desc, sp.created_at desc
     offset greatest(0, coalesce(p_offset, 0)) limit greatest(1, least(coalesce(p_limit, 15), 30))
  )
  select jsonb_build_object(
    'has_more', (select count(*) from spread) > greatest(0, coalesce(p_offset, 0)) + greatest(1, least(coalesce(p_limit, 15), 30)),
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.rank_w desc)
        from (
          select pg.rank_w, ap.id, ap.author_id, ap.body, ap.content_id, ap.content_kind, ap.is_pinned, ap.images, ap.video_url, ap.is_share,
                 to_jsonb(ap) ->> 'image_alt' as image_alt, ap.audience, ap.created_at, ap.updated_at,
                 coalesce(pr.name, 'Учасник Sensoria') as author_name, pr.avatar_url as author_avatar, pr.role as author_role,
                 (select count(*) from public.author_post_likes l where l.post_id = ap.id)::int as like_count,
                 (select count(*) from public.author_post_comments c where c.post_id = ap.id)::int as comment_count,
                 exists (select 1 from public.author_post_likes l, viewer v where l.post_id = ap.id and l.user_id = v.id) as liked
            from page pg
            join public.author_posts ap on ap.id = pg.id
            left join public.profiles pr on pr.id = ap.author_id
           where not coalesce((to_jsonb(pr) ->> 'is_banned')::boolean, false)
        ) x
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.feed_top(text, int, int) from public, anon;
grant execute on function public.feed_top(text, int, int) to authenticated;
create index if not exists author_post_comments_user_idx on public.author_post_comments (user_id);
create index if not exists author_post_likes_user_idx on public.author_post_likes (user_id);

-- ── comments and likes follow the post: what you cannot see, you cannot read, comment or like ─────────────────
-- (the subquery runs with the reader's rights, so the author_posts reading rule above applies to it)
drop policy if exists "post comments readable by signed-in users" on public.author_post_comments;
drop policy if exists "post comments readable with the post" on public.author_post_comments;
create policy "post comments readable with the post" on public.author_post_comments for select using (
  auth.uid() is not null and exists (select 1 from public.author_posts p where p.id = post_id)
);
drop policy if exists "users write their own post comments" on public.author_post_comments;
create policy "users write their own post comments" on public.author_post_comments for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.author_posts p where p.id = post_id)
  and not exists (select 1 from public.profiles b where b.id = auth.uid() and coalesce((to_jsonb(b) ->> 'is_banned')::boolean, false))
  and (
    parent_id is null
    or exists (
      select 1 from public.author_posts p join public.author_post_comments parent on parent.id = parent_id
       where p.id = post_id and parent.post_id = post_id and parent.parent_id is null and p.author_id = auth.uid()
    )
  )
);
drop policy if exists "users like posts" on public.author_post_likes;
create policy "users like posts" on public.author_post_likes for insert with check (
  auth.uid() = user_id and exists (select 1 from public.author_posts p where p.id = post_id)
);

-- ── last line of defence on the server (the app checks first and explains) ────────────────────────────────────
-- contacts that slip past the app (phone numbers, messengers), a participant's post length, and daily limits:
-- participants 10 posts, authors 20 posts, everyone 60 comments a day.
create or replace function public.feed_text_has_contacts(t text)
returns boolean
language sql
immutable
as $$
  select coalesce(t, '') ~* '(\+?\d[\d\s().-]{8,}\d|t\.me|telegram|телеграм|instagram|інстаграм|инстаграм|viber|вайбер|whatsapp|ватсап|вотсап|signal\.)';
$$;

create or replace function public.feed_post_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_author boolean := public.feed_is_author(new.author_id);
  today int;
begin
  if public.feed_text_has_contacts(new.body) then
    raise exception 'Публікація містить контакти або месенджери.' using errcode = 'check_violation';
  end if;
  if not is_author and char_length(btrim(new.body)) > 1000 then
    raise exception 'Публікація учасника: не більше 1000 символів.' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    select count(*) into today from public.author_posts where author_id = new.author_id and created_at > now() - interval '24 hours';
    if today >= (case when is_author then 20 else 10 end) then
      raise exception 'Забагато публікацій за добу. Спробуйте завтра.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists feed_post_guard on public.author_posts;
create trigger feed_post_guard before insert or update of body on public.author_posts for each row execute function public.feed_post_guard();

create or replace function public.feed_comment_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  today int;
begin
  if public.feed_text_has_contacts(new.body) then
    raise exception 'Коментар містить контакти або месенджери.' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    select count(*) into today from public.author_post_comments where user_id = new.user_id and created_at > now() - interval '24 hours';
    if today >= 60 then
      raise exception 'Забагато коментарів за добу. Спробуйте завтра.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists feed_comment_guard on public.author_post_comments;
create trigger feed_comment_guard before insert or update of body on public.author_post_comments for each row execute function public.feed_comment_guard();

create index if not exists author_posts_author_day_idx on public.author_posts (author_id, created_at desc);
create index if not exists author_post_comments_user_day_idx on public.author_post_comments (user_id, created_at desc);

create index if not exists author_post_likes_post_idx on public.author_post_likes (post_id);

notify pgrst, 'reload schema';
