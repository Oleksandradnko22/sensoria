-- «Публікації» as three feeds (like Threads). Run ONCE in the Supabase SQL editor; safe to re-run.
-- Run it BEFORE deploying the site that uses it.
--
--   «Для всіх»       audience 'all'          authors write;               every signed-in person reads (no guests)
--   «Для учасників»  audience 'participants' participants write (authors only like and comment); every signed-in person reads
--   «Для авторів»    audience 'authors'      authors write and read
--
-- Participants write text, up to 4 photos (checked in the browser) and a video link; no attached material, no pinning.
-- Existing posts become «Для всіх».

alter table public.author_posts add column if not exists audience text not null default 'all';
-- set when a post is hidden (3 reports or the server photo check), see below
alter table public.author_posts add column if not exists hidden_at timestamptz;
alter table public.author_posts add column if not exists hidden_reason text;
alter table public.author_posts drop constraint if exists author_posts_audience_chk;
alter table public.author_posts add constraint author_posts_audience_chk check (audience in ('all', 'participants', 'authors'));
create index if not exists author_posts_feed_idx on public.author_posts (audience, created_at desc);
grant update (audience) on public.author_posts to authenticated;
-- a poll ({question, options[2–4]}), «Питання до автора» until a date, a delicate topic (shown blurred until tapped)
alter table public.author_posts add column if not exists poll jsonb;
alter table public.author_posts add column if not exists ama_until timestamptz;
alter table public.author_posts add column if not exists sensitive_topic text;
alter table public.author_posts drop constraint if exists author_posts_poll_chk;
alter table public.author_posts add constraint author_posts_poll_chk check (
  poll is null or (jsonb_typeof(poll -> 'options') = 'array' and jsonb_array_length(poll -> 'options') between 2 and 4 and char_length(coalesce(poll ->> 'question', '')) <= 200)
);
grant update (poll, ama_until, sensitive_topic) on public.author_posts to authenticated;
-- posts authors wrote into «Для учасників» before it became the participants' own space move to «Для всіх»
-- (before the check below, which also applies to updated rows)
update public.author_posts p set audience = 'all'
 where p.audience = 'participants' and exists (select 1 from public.profiles pr where pr.id = p.author_id and pr.role in ('author', 'admin'));
-- one kind of attachment per post (photos OR a video OR a material OR a poll): checked in feed_post_guard below
-- when a post is written or its attachments change, so older posts and moderation updates are never blocked
alter table public.author_posts drop constraint if exists author_posts_one_attachment;

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

-- banned / admin, read with the function's own rights: people may read only some columns of profiles
-- (privacy-profiles-reflections.sql), so a rule that reads the whole row would fail for everyone
create or replace function public.feed_is_banned(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (to_jsonb(p) ->> 'is_banned')::boolean from public.profiles p where p.id = p_user), false);
$$;
create or replace function public.feed_is_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = p_user and (p.role = 'admin' or coalesce((to_jsonb(p) ->> 'is_admin')::boolean, false)));
$$;
revoke all on function public.feed_is_banned(uuid) from public, anon;
revoke all on function public.feed_is_admin(uuid) from public, anon;
grant execute on function public.feed_is_banned(uuid) to authenticated;
grant execute on function public.feed_is_admin(uuid) to authenticated;

-- «Фахівець»: an author whose education documents Sensoria checked (author_details.education_verified)
create or replace function public.feed_is_specialist(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (to_jsonb(d) ->> 'education_verified')::boolean from public.author_details d where d.profile_id = p_user), false);
$$;
revoke all on function public.feed_is_specialist(uuid) from public, anon;
grant execute on function public.feed_is_specialist(uuid) to authenticated;

-- themes only a «Фахівець» may write about (the same list as for materials and lesson warnings), in any text
create or replace function public.feed_text_specialist(t text)
returns boolean
language sql
immutable
as $$
  select coalesce(t, '') ~* ('(птср|посттравм|травм|суїцид|самогуб|самоушкодж|розлад[иуіав]* харчов|булімі|анорекс|залежн|наркот|алкогол'
    || '|діагноз|лікуванн|медикамент|антидепрес|психотерапі|насильств|згвалтув|втрат[аиуі] (близьк|рідн|дитин)|горе\y|смерт|помер|війн|бойов)');
$$;
-- delicate topics only a «Фахівець» may mark (src/utils/contentWarning.ts SPECIALIST_WARNING_TOPICS)
create or replace function public.feed_topic_specialist(t text)
returns boolean
language sql
immutable
as $$
  select coalesce(t, '') in ('втрата та горе', 'травматичний досвід', 'дитячі травми', 'насильство', 'сексуальне насильство', 'розлади харчової поведінки', 'війна та військові події');
$$;

-- a participant may tag only a material they bought, got or study (so nobody advertises what they never used)
create or replace function public.feed_can_tag(p_user uuid, p_content text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- a material is known by its id and its slug; activity tables may store either
  with c as (select x.id, x.slug from public.content x where x.id::text = p_content or x.slug = p_content limit 1),
  keys as (select p_content as k union select c.id::text from c union select c.slug from c where c.slug is not null)
  select exists (select 1 from public.purchases pu where pu.participant_id = p_user and pu.status = 'completed' and pu.content_id::text in (select k from keys))
      or exists (select 1 from public.acquired_content a where a.user_id = p_user and a.content_id in (select k from keys))
      or exists (select 1 from public.content_progress cp where cp.user_id = p_user and cp.content_id in (select k from keys))
      or exists (select 1 from public.meditation_sessions s where s.user_id = p_user and s.meditation_id in (select k from keys))
      or exists (select 1 from public.guide_section_views g where g.user_id = p_user and g.guide_id in (select k from keys));
$$;
revoke all on function public.feed_can_tag(uuid, text) from public, anon;
grant execute on function public.feed_can_tag(uuid, text) to authenticated;

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
  and not public.feed_is_banned(auth.uid())
  and (
    (public.feed_is_author(auth.uid()) and audience in ('all', 'authors'))
    or (not public.feed_is_author(auth.uid()) and audience = 'participants' and not is_pinned and (content_id is null or public.feed_can_tag(auth.uid(), content_id)))
  )
);
-- deleting: one's own post (the author of the post), always
drop policy if exists "authors delete their own posts" on public.author_posts;
create policy "authors delete their own posts" on public.author_posts for delete using (auth.uid() = author_id);
grant delete on public.author_posts to authenticated;

-- a participant cannot move a post into another feed, attach a material or pin
drop policy if exists "authors edit their own posts" on public.author_posts;
create policy "authors edit their own posts" on public.author_posts for update
  using (auth.uid() = author_id)
  with check (
    auth.uid() = author_id
    and (
      (public.feed_is_author(auth.uid()) and audience in ('all', 'authors'))
      or (not public.feed_is_author(auth.uid()) and audience = 'participants' and not is_pinned and (content_id is null or public.feed_can_tag(auth.uid(), content_id)))
    )
  );

-- ── social parts of a post ─────────────────────────────────────────────────────────────────────────────────────
-- reactions instead of one heart: «Підтримую», «Відгукується», «Дякую», «Надихає» (one per person, can be changed)
alter table public.author_post_likes add column if not exists kind text not null default 'support';
alter table public.author_post_likes drop constraint if exists author_post_likes_kind_chk;
alter table public.author_post_likes add constraint author_post_likes_kind_chk check (kind in ('support', 'resonates', 'thanks', 'inspires'));
drop policy if exists "users change their reaction" on public.author_post_likes;
create policy "users change their reaction" on public.author_post_likes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant update (kind) on public.author_post_likes to authenticated;

-- «Зберегти»
create table if not exists public.post_saves (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.author_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
alter table public.post_saves enable row level security;
drop policy if exists "own saves" on public.post_saves;
create policy "own saves" on public.post_saves for select using (auth.uid() = user_id);
drop policy if exists "save visible posts" on public.post_saves;
create policy "save visible posts" on public.post_saves for insert with check (auth.uid() = user_id and exists (select 1 from public.author_posts p where p.id = post_id));
drop policy if exists "unsave" on public.post_saves;
create policy "unsave" on public.post_saves for delete using (auth.uid() = user_id);

-- @автор: only authors can be mentioned (participants never — privacy), up to 5 per post
create table if not exists public.post_mentions (
  post_id uuid not null references public.author_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  primary key (post_id, author_id)
);
alter table public.post_mentions enable row level security;
drop policy if exists "mentions readable" on public.post_mentions;
create policy "mentions readable" on public.post_mentions for select using (auth.uid() is not null);
create or replace function public.feed_mentions_count(p_post uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.post_mentions where post_id = p_post;
$$;
revoke all on function public.feed_mentions_count(uuid) from public, anon;
grant execute on function public.feed_mentions_count(uuid) to authenticated;
drop policy if exists "post owner mentions authors" on public.post_mentions;
create policy "post owner mentions authors" on public.post_mentions for insert with check (
  exists (select 1 from public.author_posts p where p.id = post_id and p.author_id = auth.uid())
  and public.feed_is_author(author_id)
  and public.feed_mentions_count(post_id) < 5
);
drop policy if exists "post owner removes mentions" on public.post_mentions;
create policy "post owner removes mentions" on public.post_mentions for delete using (exists (select 1 from public.author_posts p where p.id = post_id and p.author_id = auth.uid()));

-- polls: one anonymous vote per person; everyone sees only percentages
create table if not exists public.post_poll_votes (
  post_id uuid not null references public.author_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  option smallint not null check (option between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_poll_votes enable row level security;
drop policy if exists "own votes" on public.post_poll_votes;
create policy "own votes" on public.post_poll_votes for select using (auth.uid() = user_id);
drop policy if exists "vote in visible polls" on public.post_poll_votes;
create policy "vote in visible polls" on public.post_poll_votes for insert with check (
  auth.uid() = user_id and exists (select 1 from public.author_posts p where p.id = post_id and p.poll is not null and option < jsonb_array_length(p.poll -> 'options'))
);

-- «Питання до автора»: the post's author pins the best answers on top
alter table public.author_post_comments add column if not exists is_pinned boolean not null default false;
create or replace function public.pin_post_comment(p_comment uuid, p_pinned boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.author_post_comments c set is_pinned = p_pinned
   where c.id = p_comment and exists (select 1 from public.author_posts p where p.id = c.post_id and p.author_id = auth.uid());
$$;
revoke all on function public.pin_post_comment(uuid, boolean) from public, anon;
grant execute on function public.pin_post_comment(uuid, boolean) to authenticated;

-- «Досвід учасника» on the material's page: the material's author asks, the participant agrees
create table if not exists public.post_features (
  post_id uuid primary key references public.author_posts (id) on delete cascade,
  content_id text not null,
  author_id uuid not null references public.profiles (id) on delete cascade,
  requested_at timestamptz not null default now(),
  consented_at timestamptz
);
alter table public.post_features enable row level security; -- only through the functions below
create or replace function public.request_story_feature(p_post uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cid text;
begin
  select p.content_id into cid from public.author_posts p
   where p.id = p_post and p.content_id is not null and not public.feed_is_author(p.author_id)
     and exists (select 1 from public.content c where (c.id::text = p.content_id or c.slug = p.content_id) and c.author_id = auth.uid());
  if cid is null then return false; end if;
  insert into public.post_features (post_id, content_id, author_id) values (p_post, cid, auth.uid()) on conflict (post_id) do nothing;
  return true;
end;
$$;
create or replace function public.answer_story_feature(p_post uuid, p_yes boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.author_posts p where p.id = p_post and p.author_id = auth.uid()) then return; end if;
  if p_yes then update public.post_features set consented_at = now() where post_id = p_post;
  else delete from public.post_features where post_id = p_post; end if;
end;
$$;
-- consented stories of one material (for its page): text, first name + initial, date
create or replace function public.material_stories(p_content text, p_slug text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'body', left(p.body, 600), 'created_at', p.created_at,
           'name', split_part(coalesce(pr.name, 'Учасник'), ' ', 1) || coalesce(' ' || left(nullif(split_part(pr.name, ' ', 2), ''), 1) || '.', ''),
           'avatar', pr.avatar_url
         ) order by f.consented_at desc), '[]'::jsonb)
    from public.post_features f
    join public.author_posts p on p.id = f.post_id and p.hidden_at is null
    left join public.profiles pr on pr.id = p.author_id
   where f.consented_at is not null and f.content_id in (p_content, coalesce(p_slug, p_content));
$$;
revoke all on function public.request_story_feature(uuid) from public, anon;
revoke all on function public.answer_story_feature(uuid, boolean) from public, anon;
revoke all on function public.material_stories(text, text) from public;
grant execute on function public.request_story_feature(uuid) to authenticated;
grant execute on function public.answer_story_feature(uuid, boolean) to authenticated;
grant execute on function public.material_stories(text, text) to anon, authenticated;

-- one post as the feed shows it, for the person looking (used only inside the feed functions)
create or replace function public.feed_item(p_id uuid, p_viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', ap.id, 'author_id', ap.author_id, 'body', ap.body, 'content_id', ap.content_id, 'content_kind', ap.content_kind,
    'is_pinned', ap.is_pinned, 'images', ap.images, 'video_url', ap.video_url, 'is_share', ap.is_share,
    'image_alt', to_jsonb(ap) ->> 'image_alt', 'hidden_at', ap.hidden_at, 'audience', ap.audience,
    'created_at', ap.created_at, 'updated_at', ap.updated_at,
    'poll', ap.poll, 'ama_until', ap.ama_until, 'sensitive_topic', ap.sensitive_topic,
    'author_name', coalesce(pr.name, 'Учасник Sensoria'), 'author_avatar', pr.avatar_url, 'author_role', pr.role,
    'like_count', (select count(*) from public.author_post_likes l where l.post_id = ap.id),
    'reactions', (select coalesce(jsonb_object_agg(r.kind, r.n), '{}'::jsonb) from (select l.kind, count(*) as n from public.author_post_likes l where l.post_id = ap.id group by l.kind) r),
    'my_reaction', (select l.kind from public.author_post_likes l where l.post_id = ap.id and l.user_id = p_viewer),
    'liked', exists (select 1 from public.author_post_likes l where l.post_id = ap.id and l.user_id = p_viewer),
    'comment_count', (select count(*) from public.author_post_comments c where c.post_id = ap.id),
    'saved', exists (select 1 from public.post_saves s where s.post_id = ap.id and s.user_id = p_viewer),
    'poll_counts', case when ap.poll is null then null else (
      select coalesce(jsonb_agg((select count(*) from public.post_poll_votes v where v.post_id = ap.id and v.option = o) order by o), '[]'::jsonb)
        from generate_series(0, jsonb_array_length(ap.poll -> 'options') - 1) o) end,
    'my_vote', (select v.option from public.post_poll_votes v where v.post_id = ap.id and v.user_id = p_viewer),
    'mentions', (select coalesce(jsonb_agg(jsonb_build_object('id', m.author_id, 'name', p2.name)), '[]'::jsonb)
                   from public.post_mentions m join public.profiles p2 on p2.id = m.author_id where m.post_id = ap.id),
    'feature', (select jsonb_build_object('requested', true, 'consented', f.consented_at is not null) from public.post_features f where f.post_id = ap.id)
  )
  from public.author_posts ap left join public.profiles pr on pr.id = ap.author_id
  where ap.id = p_id;
$$;
revoke all on function public.feed_item(uuid, uuid) from public, anon, authenticated;

-- one page of a feed, newest first. p_feed: 'all' | 'participants' | 'authors' | 'mine' | 'saved'
create or replace function public.feed_page(p_feed text, p_before timestamptz default null, p_limit int default 15)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (select auth.uid() as id, public.feed_is_author(auth.uid()) as is_author),
  lim as (select greatest(1, least(coalesce(p_limit, 15), 30)) as n),
  page as (
    select p.id, p.created_at
      from public.author_posts p, viewer v
     where v.id is not null
       and (case p_feed
              when 'mine' then p.author_id = v.id
              when 'saved' then exists (select 1 from public.post_saves s where s.post_id = p.id and s.user_id = v.id)
                                and (p.audience in ('all', 'participants') or v.is_author)
              when 'authors' then p.audience = 'authors' and v.is_author
              when 'participants' then p.audience = 'participants' and not public.feed_is_author(p.author_id)
              else p.audience = 'all'
            end)
       and (p_before is null or p.created_at < p_before)
       and (p.hidden_at is null or p.author_id = v.id)
       and not public.feed_is_banned(p.author_id)
     order by p.created_at desc
     limit (select n from lim) + 1
  )
  select jsonb_build_object(
    'has_more', (select count(*) from page) > (select n from lim),
    'items', coalesce((
      select jsonb_agg(public.feed_item(x.id, (select id from viewer)) order by x.created_at desc)
        from (select * from page order by created_at desc limit (select n from lim)) x
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.feed_page(text, timestamptz, int) from public, anon;
grant execute on function public.feed_page(text, timestamptz, int) to authenticated;

-- ── «Рекомендовані»: the same feed ranked for the person looking at it ─────────────────────────────────────────
-- weight = (reactions [«Відгукується», «Дякую» ×1.5] + 3 × comments + 4 × saves + 2 if the post's author answers in
--           the discussion + a start bonus for a fresh post nobody reacted to yet) / (hours since posting + 2) ^ 1.3
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
  lim as (select greatest(1, least(coalesce(p_limit, 15), 30)) as n),
  cand as (
    select p.*
      from public.author_posts p, viewer v
     where v.id is not null
       and (p.author_id <> v.id or p.created_at > now() - interval '1 hour')
       and p.created_at > now() - interval '21 days'
       and p.hidden_at is null
       and not public.feed_is_banned(p.author_id)
       and (case p_feed when 'authors' then p.audience = 'authors' and v.is_author when 'participants' then p.audience = 'participants' and not public.feed_is_author(p.author_id) else p.audience = 'all' end)
  ),
  eng as (
    select c.id, c.author_id, c.created_at,
           (select coalesce(sum(case l.kind when 'resonates' then 1.5 when 'thanks' then 1.5 else 1 end), 0) from public.author_post_likes l where l.post_id = c.id) as reacts,
           (select count(*) from public.author_post_comments m where m.post_id = c.id) as comments,
           (select count(*) from public.post_saves s where s.post_id = c.id) as saves,
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
           (e.reacts + 3 * e.comments + 4 * e.saves + case when e.author_answers then 2 else 0 end
              + case when e.reacts + e.comments = 0 and e.created_at > now() - interval '24 hours' then 2 else 0 end + 1)
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
     offset greatest(0, coalesce(p_offset, 0)) limit (select n from lim)
  )
  select jsonb_build_object(
    'has_more', (select count(*) from spread) > greatest(0, coalesce(p_offset, 0)) + (select n from lim),
    'items', coalesce((select jsonb_agg(public.feed_item(pg.id, (select id from viewer)) order by pg.rank_w desc) from page pg), '[]'::jsonb)
  );
$$;
revoke all on function public.feed_top(text, int, int) from public, anon;
grant execute on function public.feed_top(text, int, int) to authenticated;
create index if not exists author_post_comments_user_idx on public.author_post_comments (user_id);
create index if not exists author_post_likes_user_idx on public.author_post_likes (user_id);

-- ── notifications, computed from what already happened (nothing extra is stored but «seen up to») ──────────────
create table if not exists public.feed_seen (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.feed_seen enable row level security; -- only through the functions below
create or replace function public.feed_notifications()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with v as (select auth.uid() as id),
  seen as (select coalesce((select f.seen_at from public.feed_seen f, v where f.user_id = v.id), now() - interval '30 days') as t),
  items as (
    select 'comment' as kind, c.created_at as happened_at, c.post_id, c.user_id as actor, left(c.body, 120) as txt
      from public.author_post_comments c join public.author_posts p on p.id = c.post_id, v
     where p.author_id = v.id and c.user_id <> v.id and c.parent_id is null and c.created_at > now() - interval '30 days'
    union all
    select 'reply', c.created_at, c.post_id, c.user_id, left(c.body, 120)
      from public.author_post_comments c join public.author_post_comments parent on parent.id = c.parent_id, v
     where parent.user_id = v.id and c.user_id <> v.id and c.created_at > now() - interval '30 days'
    union all
    select 'reactions', max(l.created_at), l.post_id, null::uuid, count(*)::text
      from public.author_post_likes l join public.author_posts p on p.id = l.post_id, v
     where p.author_id = v.id and l.user_id <> v.id and l.created_at > now() - interval '30 days'
     group by l.post_id
    union all
    select 'mention', p.created_at, p.id, p.author_id, left(p.body, 120)
      from public.post_mentions m join public.author_posts p on p.id = m.post_id, v
     where m.author_id = v.id and p.hidden_at is null and p.created_at > now() - interval '30 days'
    union all
    select 'follow_post', p.created_at, p.id, p.author_id, left(p.body, 120)
      from public.author_posts p join public.author_follows f on f.author_id = p.author_id, v
     where f.follower_id = v.id and p.audience = 'all' and p.hidden_at is null and p.created_at > now() - interval '7 days'
    union all
    select 'feature', f.requested_at, f.post_id, f.author_id, null
      from public.post_features f join public.author_posts p on p.id = f.post_id, v
     where p.author_id = v.id and f.consented_at is null
  )
  select jsonb_build_object(
    'unread', (select count(*) from items, seen where items.happened_at > seen.t),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', i.kind, 'at', i.happened_at, 'post_id', i.post_id, 'text', i.txt,
               'actor_name', pr.name, 'actor_avatar', pr.avatar_url, 'unread', i.happened_at > (select t from seen)
             ) order by i.happened_at desc)
        from (select * from items order by happened_at desc limit 40) i
        left join public.profiles pr on pr.id = i.actor
    ), '[]'::jsonb)
  );
$$;
create or replace function public.feed_mark_seen()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.feed_seen (user_id, seen_at) values (auth.uid(), now())
  on conflict (user_id) do update set seen_at = excluded.seen_at;
$$;
-- one post by id (opening a notification)
create or replace function public.feed_post(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.feed_item(p.id, auth.uid())
    from public.author_posts p
   where p.id = p_id and auth.uid() is not null
     and (p.hidden_at is null or p.author_id = auth.uid())
     and (p.audience in ('all', 'participants') or p.author_id = auth.uid() or public.feed_is_author(auth.uid()));
$$;
-- «Тиждень у Sensoria»: the warmest posts of the week and new authors
create or replace function public.feed_week()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'top', coalesce((
      select jsonb_agg(public.feed_item(t.id, auth.uid()) order by t.score desc)
        from (select p.id,
                     (select count(*) from public.author_post_likes l where l.post_id = p.id)
                     + 3 * (select count(*) from public.author_post_comments c where c.post_id = p.id) as score
                from public.author_posts p
               where p.audience = 'all' and p.hidden_at is null and p.created_at > now() - interval '7 days'
               order by 2 desc, p.created_at desc limit 3) t
       where t.score > 0
    ), '[]'::jsonb),
    'new_authors', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'avatar', a.avatar_url))
        from (select pr.id, pr.name, pr.avatar_url from public.profiles pr
               where pr.role = 'author' and pr.created_at > now() - interval '30 days' and not public.feed_is_banned(pr.id)
               order by pr.created_at desc limit 4) a
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.feed_notifications() from public, anon;
revoke all on function public.feed_mark_seen() from public, anon;
revoke all on function public.feed_post(uuid) from public, anon;
revoke all on function public.feed_week() from public, anon;
grant execute on function public.feed_notifications() to authenticated;
grant execute on function public.feed_mark_seen() to authenticated;
grant execute on function public.feed_post(uuid) to authenticated;
grant execute on function public.feed_week() to authenticated;

-- ── comments and likes follow the post: what you cannot see, you cannot read, comment or like ─────────────────
-- (the subquery runs with the reader's rights, so the author_posts reading rule above applies to it)
drop policy if exists "post comments readable by signed-in users" on public.author_post_comments;
drop policy if exists "post comments readable with the post" on public.author_post_comments;
create policy "post comments readable with the post" on public.author_post_comments for select using (
  auth.uid() is not null and exists (select 1 from public.author_posts p where p.id = post_id)
);
-- a reply: only the post's author answers a top-level comment of that post (read with the function's own rights —
-- a rule that reads its own table again would loop forever)
create or replace function public.feed_reply_ok(p_parent uuid, p_post uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.author_post_comments parent join public.author_posts p on p.id = parent.post_id
     where parent.id = p_parent and parent.post_id = p_post and parent.parent_id is null and p.author_id = p_user
  );
$$;
revoke all on function public.feed_reply_ok(uuid, uuid, uuid) from public, anon;
grant execute on function public.feed_reply_ok(uuid, uuid, uuid) to authenticated;
drop policy if exists "users write their own post comments" on public.author_post_comments;
create policy "users write their own post comments" on public.author_post_comments for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.author_posts p where p.id = post_id)
  and not public.feed_is_banned(auth.uid())
  and (parent_id is null or public.feed_reply_ok(parent_id, post_id, auth.uid()))
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
  select coalesce(t, '') ~* ('(\+?\d[\d\s().-]{8,}\d|t\.me|telegram|телеграм|instagram|інстаграм|инстаграм|viber|вайбер|whatsapp|ватсап|вотсап|signal\.'
    -- links in any form: http(s), www, a@handle / e-mail (but not our «@[Ім'я]» mentions), a bare domain
    || '|https?:|www\.|@(?!\[)[a-z0-9_.]{2,}'
    || '|[a-z0-9-]{2,}\.(com|net|org|ua|ru|io|me|ly|link|site|online|shop|store|info|biz|pro|app|page|xyz|top|club|co|tv|by|kz|eu|de|pl|uk|bio|gg|cc|fm|to|ws|in|live|life|space|world|art|blog|tech|school|academy|courses|guru)\y)');
$$;

-- crisis words: the post goes to a moderator instead of the feed, the person sees where to get help right now
create or replace function public.feed_text_is_crisis(t text)
returns boolean
language sql
immutable
as $$
  select coalesce(t, '') ~* '(суїцид|суицид|самогуб|покінчити з собою|покончить с собой|не хочу жити|не хочу жить|хочу померти|хочу умереть|вбити себе|убить себя|самоушкодж|самоповрежд|порізати себе|різати себе|резать себя)';
$$;

-- the old checks blocked any «@» — mentions «@[Ім'я]» need it; the function above blocks real handles and e-mails
alter table public.author_posts drop constraint if exists author_posts_no_contacts;
alter table public.author_post_comments drop constraint if exists author_post_comments_no_contacts;

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
  if public.feed_text_has_contacts(new.body) or public.feed_text_has_contacts(new.poll::text) then
    raise exception 'Публікація містить контакти, посилання або месенджери.' using errcode = 'check_violation';
  end if;
  if (coalesce(array_length(new.images, 1), 0) > 0)::int + (new.video_url is not null)::int + (new.content_id is not null)::int
     + (new.poll is not null)::int + (new.ama_until is not null)::int > 1 then
    raise exception 'Публікація: одне на допис — фото, відео, матеріал, опитування або «Питання до мене».' using errcode = 'check_violation';
  end if;
  -- themes for a «Фахівець» only: a regular author can neither write about them nor mark them as a delicate topic
  if is_author and not public.feed_is_specialist(new.author_id) and not public.feed_is_admin(new.author_id) then
    if public.feed_text_specialist(new.body) or public.feed_text_specialist(new.poll::text) or public.feed_topic_specialist(new.sensitive_topic) then
      raise exception 'Публікація торкається теми, доступної лише авторам зі статусом «Фахівець».' using errcode = 'check_violation';
    end if;
  end if;
  -- a participant's post with crisis words waits for a moderator (the app shows where to get help)
  if not is_author and public.feed_text_is_crisis(new.body) then
    new.hidden_at := coalesce(new.hidden_at, now());
    new.hidden_reason := coalesce(new.hidden_reason, 'crisis');
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
create trigger feed_post_guard before insert or update of body, poll, sensitive_topic, images, video_url, content_id, ama_until on public.author_posts for each row execute function public.feed_post_guard();

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
    raise exception 'Коментар містить контакти, посилання або месенджери.' using errcode = 'check_violation';
  end if;
  if not public.feed_is_author(new.user_id) and public.feed_text_is_crisis(new.body) then
    raise exception 'Кризова тема: такий коментар не публікується.' using errcode = 'check_violation';
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

-- ── hidden posts: after 3 reports from different people, or when the server photo check (check-post-images,
-- Sightengine) finds explicit / violent images. The author still sees their post; moderation can bring it back.
create index if not exists author_posts_visible_idx on public.author_posts (audience, created_at desc) where hidden_at is null;

drop policy if exists "feed posts readable by audience" on public.author_posts;
create policy "feed posts readable by audience" on public.author_posts for select using (
  auth.uid() is not null
  and (hidden_at is null or author_id = auth.uid() or public.feed_is_admin(auth.uid()))
  and (audience in ('all', 'participants') or author_id = auth.uid() or public.feed_is_author(auth.uid()))
);

-- one server photo check per post (it costs money): the result is kept here
create table if not exists public.post_image_checks (
  post_id uuid primary key references public.author_posts (id) on delete cascade,
  unsafe boolean not null,
  images_checked int not null default 0, -- for the monthly cap in check-post-images
  result jsonb,
  checked_at timestamptz not null default now()
);
alter table public.post_image_checks add column if not exists images_checked int not null default 0;
create index if not exists post_image_checks_month_idx on public.post_image_checks (checked_at);
alter table public.post_image_checks enable row level security; -- only the server function and admins (service role)

-- 3 reports from different people hide the post until moderation looks at it
create or replace function public.feed_hide_on_reports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.target_type = 'post' and (
    select count(distinct r.reporter_id) from public.entity_reports r where r.target_type = 'post' and r.target_id = new.target_id
  ) >= 3 then
    update public.author_posts set hidden_at = coalesce(hidden_at, now()), hidden_reason = coalesce(hidden_reason, 'reports')
     where id::text = new.target_id;
  end if;
  return new;
end;
$$;
drop trigger if exists feed_hide_on_reports on public.entity_reports;
create trigger feed_hide_on_reports after insert on public.entity_reports for each row execute function public.feed_hide_on_reports();

create index if not exists author_post_likes_post_idx on public.author_post_likes (post_id);

notify pgrst, 'reload schema';

-- ── no links or contacts in any public text, not only posts ───────────────────────────────────────────────────
-- Every text value of the row is checked (also inside JSON like the author's story), except fields that are meant to
-- hold an address: photos, video, files, covers (names with url / image / video / media / file ...).
create or replace function public.jsonb_has_contacts(j jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  k text;
  v jsonb;
begin
  case jsonb_typeof(j)
    when 'string' then return public.feed_text_has_contacts(j #>> '{}');
    when 'array' then
      for v in select * from jsonb_array_elements(j) loop
        if public.jsonb_has_contacts(v) then return true; end if;
      end loop;
    when 'object' then
      for k, v in select * from jsonb_each(j) loop
        continue when k ~* '(url|image|avatar|video|media|cover|portrait|photo|file|icon|link|path|^id$|_id$|_at$)';
        if public.jsonb_has_contacts(v) then return true; end if;
      end loop;
    else return false;
  end case;
  return false;
end;
$$;

create or replace function public.forbid_links_row()
returns trigger
language plpgsql
as $$
begin
  if public.jsonb_has_contacts(to_jsonb(new)) then
    raise exception 'Посилання, контакти й месенджери тут не можна публікувати.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['author_details', 'reviews', 'author_cases', 'author_experience'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists forbid_links on public.%I', t);
      execute format('create trigger forbid_links before insert or update on public.%I for each row execute function public.forbid_links_row()', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

-- materials a participant may tag in a post (bought, got or studies)
create or replace function public.feed_my_materials()
returns table (id text, kind text, title text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id::text, c.kind, c.title
    from public.content c
   where c.status = 'published' and c.kind in ('program', 'guide', 'meditation')
     and (public.feed_can_tag(auth.uid(), c.id::text) or (c.slug is not null and public.feed_can_tag(auth.uid(), c.slug)))
   order by c.title
   limit 50;
$$;
revoke all on function public.feed_my_materials() from public, anon;
grant execute on function public.feed_my_materials() to authenticated;

notify pgrst, 'reload schema';
