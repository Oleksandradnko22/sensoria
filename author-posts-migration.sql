-- Author publications ("Публікації") — the creator layer of the public
-- author profile. Run once in the Supabase SQL editor. Safe to re-run.
--
--   author_details       + positioning, approach, topics   (profile copy)
--   author_posts         short educational posts, one optional pinned
--   author_post_likes    one like per (post, user)
--   author_post_comments participant comments + author replies
--   author_post_comment_reports
--   author_post_stats    view: like/comment counts per post (no user ids)
--   pin_author_post()    atomic pin / unpin (one pinned post per author)
--
-- Deliberately separate from messages (private) and author_reviews
-- (feedback about an author's material): three different surfaces.
--
-- content_id is TEXT, same convention as messages.content_id: guides and
-- meditations are catalog slugs, programs are content.id uuids as text.
-- A post only ever references content by that stable id; titles are
-- resolved at read time, so an unpublished/deleted item just becomes an
-- "unavailable" attachment and the post survives.

-- ── Profile copy ────────────────────────────────────────────────────
alter table public.author_details
  add column if not exists positioning text,
  add column if not exists approach text,
  add column if not exists topics text[] not null default '{}';

-- ── Posts ───────────────────────────────────────────────────────────
create table if not exists public.author_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  content_id text,
  content_kind text check (content_kind in ('program', 'guide', 'meditation')),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  check ((content_id is null) = (content_kind is null))
);

-- If the table already existed from an earlier version, bring it up to date
-- (create table if not exists skips existing tables).
alter table public.author_posts
  add column if not exists content_id text,
  add column if not exists content_kind text,
  add column if not exists is_pinned boolean not null default false,
  add column if not exists updated_at timestamptz;
update public.author_posts set is_pinned = false where is_pinned is null;

create index if not exists author_posts_author_idx
  on public.author_posts (author_id, created_at desc);
-- At most one pinned post per author.
create unique index if not exists author_posts_one_pinned
  on public.author_posts (author_id) where is_pinned;

alter table public.author_posts enable row level security;

drop policy if exists "author posts are publicly readable" on public.author_posts;
create policy "author posts are publicly readable"
  on public.author_posts for select using (true);

drop policy if exists "authors create their own posts" on public.author_posts;
create policy "authors create their own posts"
  on public.author_posts for insert
  with check (
    auth.uid() = author_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'author')
  );

drop policy if exists "authors edit their own posts" on public.author_posts;
create policy "authors edit their own posts"
  on public.author_posts for update
  using (auth.uid() = author_id) with check (auth.uid() = author_id);

drop policy if exists "authors delete their own posts" on public.author_posts;
create policy "authors delete their own posts"
  on public.author_posts for delete using (auth.uid() = author_id);

-- RLS gates rows, not columns: only the editable columns can be updated.
revoke update on public.author_posts from authenticated;
grant update (body, content_id, content_kind, is_pinned, updated_at)
  on public.author_posts to authenticated;

-- ── Media (photos, video link, shared material) ────────────────────
-- images:    up to 4 public URLs in the existing `content-files` bucket,
--            uploaded under {author_id}/posts/… (bucket RLS already
--            restricts writes to the owner's own folder).
-- video_url: a YouTube / Vimeo link only (no file storage); the app
--            re-validates the host before embedding.
-- is_share:  the attached Sensoria material is someone else's / the
--            catalog's ("Поділився матеріалом"), not the author's own.
alter table public.author_posts
  add column if not exists images text[] not null default '{}',
  add column if not exists video_url text,
  add column if not exists is_share boolean not null default false;

alter table public.author_posts drop constraint if exists author_posts_images_max;
alter table public.author_posts
  add constraint author_posts_images_max check (coalesce(array_length(images, 1), 0) <= 4);
alter table public.author_posts drop constraint if exists author_posts_video_url_len;
alter table public.author_posts
  add constraint author_posts_video_url_len check (video_url is null or char_length(video_url) <= 300);

grant update (images, video_url, is_share) on public.author_posts to authenticated;

-- ── Likes ───────────────────────────────────────────────────────────
create table if not exists public.author_post_likes (
  post_id uuid not null references public.author_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.author_post_likes enable row level security;

-- Nobody can list who liked what: you only ever read your own rows;
-- public counts come from author_post_stats below.
drop policy if exists "users read their own post likes" on public.author_post_likes;
create policy "users read their own post likes"
  on public.author_post_likes for select using (auth.uid() = user_id);
drop policy if exists "users like posts" on public.author_post_likes;
create policy "users like posts"
  on public.author_post_likes for insert with check (auth.uid() = user_id);
drop policy if exists "users unlike posts" on public.author_post_likes;
create policy "users unlike posts"
  on public.author_post_likes for delete using (auth.uid() = user_id);

-- ── Comments ────────────────────────────────────────────────────────
-- "Author reply" is NOT a stored flag: it is derived at read time
-- (comment.user_id = post.author_id), so it cannot be forged. Replies
-- (parent_id set) can only be written by the post's own author —
-- participants comment at the top level, keeping the thread a calm
-- discussion around the post rather than a forum.
create table if not exists public.author_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.author_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.author_post_comments (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1500),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists author_post_comments_post_idx
  on public.author_post_comments (post_id, created_at);

alter table public.author_post_comments enable row level security;

drop policy if exists "post comments readable by signed-in users" on public.author_post_comments;
create policy "post comments readable by signed-in users"
  on public.author_post_comments for select using (auth.uid() is not null);

drop policy if exists "users write their own post comments" on public.author_post_comments;
create policy "users write their own post comments"
  on public.author_post_comments for insert
  with check (
    auth.uid() = user_id
    and (
      parent_id is null
      or exists (
        select 1
        from public.author_posts p
        join public.author_post_comments parent on parent.id = parent_id
        where p.id = post_id
          and parent.post_id = post_id
          and parent.parent_id is null
          and p.author_id = auth.uid()
      )
    )
  );

drop policy if exists "users edit their own post comments" on public.author_post_comments;
create policy "users edit their own post comments"
  on public.author_post_comments for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users delete their own post comments" on public.author_post_comments;
create policy "users delete their own post comments"
  on public.author_post_comments for delete using (auth.uid() = user_id);

revoke update on public.author_post_comments from authenticated;
grant update (body, updated_at) on public.author_post_comments to authenticated;

-- ── Comment reports ─────────────────────────────────────────────────
create table if not exists public.author_post_comment_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  comment_id uuid not null references public.author_post_comments (id) on delete cascade,
  reason text not null check (
    reason in (
      'Спам',
      'Образи / агресія',
      'Неприйнятний контент',
      'Реклама',
      'Порушення правил платформи',
      'Інше'
    )
  ),
  status text not null default 'open' check (status in ('open', 'reviewed')),
  created_at timestamptz not null default now()
);

alter table public.author_post_comment_reports enable row level security;

drop policy if exists "users file their own post comment reports" on public.author_post_comment_reports;
create policy "users file their own post comment reports"
  on public.author_post_comment_reports for insert with check (auth.uid() = reporter_id);
drop policy if exists "reporters view their own post comment reports" on public.author_post_comment_reports;
create policy "reporters view their own post comment reports"
  on public.author_post_comment_reports for select using (auth.uid() = reporter_id);

-- ── Counts (no user ids exposed) ────────────────────────────────────
create or replace view public.author_post_stats as
select
  p.id as post_id,
  (select count(*) from public.author_post_likes l where l.post_id = p.id)::int as like_count,
  (select count(*) from public.author_post_comments c where c.post_id = p.id)::int as comment_count
from public.author_posts p;

grant select on public.author_post_stats to anon, authenticated;

-- ── Atomic pin / unpin ──────────────────────────────────────────────
-- SECURITY INVOKER: the caller's own RLS applies, so only their own
-- posts can be touched. Unpins the previous pinned post first so the
-- one-pinned-per-author index is never violated.
create or replace function public.pin_author_post(p_post_id uuid, p_pinned boolean)
returns void
language plpgsql
security invoker
as $$
begin
  if p_pinned then
    update public.author_posts set is_pinned = false
    where author_id = auth.uid() and is_pinned and id <> p_post_id;
  end if;
  update public.author_posts set is_pinned = p_pinned
  where id = p_post_id and author_id = auth.uid();
end;
$$;

-- ── Follow ("Підписатися") ──────────────────────────────────────────
-- A participant follows an author to keep up with new publications.
-- Private: you only ever read your own rows; there is no public follower
-- list or follower count.
create table if not exists public.author_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, author_id),
  check (follower_id <> author_id)
);

create index if not exists author_follows_author_idx on public.author_follows (author_id);

alter table public.author_follows enable row level security;

drop policy if exists "users read their own follows" on public.author_follows;
create policy "users read their own follows"
  on public.author_follows for select using (auth.uid() = follower_id);
drop policy if exists "users follow authors" on public.author_follows;
create policy "users follow authors"
  on public.author_follows for insert
  with check (
    auth.uid() = follower_id
    and exists (select 1 from public.profiles a where a.id = author_id and a.role = 'author')
  );
drop policy if exists "users unfollow authors" on public.author_follows;
create policy "users unfollow authors"
  on public.author_follows for delete using (auth.uid() = follower_id);

-- ── Author Cover System ─────────────────────────────────────────────
-- Cover = one of Sensoria's art-directed compositions, not a free colour.
--   cover_type    abstract | atmospheric | editorial | personal
--   cover_variant "{family}-0{1..4}", family ∈ calm|grounded|focus|warm|energy
--   cover_image_url only for type 'personal' (author's own photo,
--                   `content-files` bucket, {author_id}/cover.*)
-- All NULL = automatic cover derived from the author's topics.
alter table public.author_details
  add column if not exists cover_type text,
  add column if not exists cover_variant text,
  add column if not exists cover_image_url text;

alter table public.author_details drop constraint if exists author_details_cover_type_chk;
alter table public.author_details
  add constraint author_details_cover_type_chk
  check (cover_type is null or cover_type in ('abstract', 'atmospheric', 'editorial', 'personal'));
alter table public.author_details drop constraint if exists author_details_cover_variant_chk;
alter table public.author_details
  add constraint author_details_cover_variant_chk
  check (cover_variant is null or cover_variant ~ '^(calm|grounded|focus|warm|energy)-0[1-4]$');

-- ── Author audience (profile header: "підписників · учасників") ─────
-- Counts only — no user ids are exposed (the view runs with the owner's
-- rights so it can count rows the visitor may not read).
--   follower_count    people following the author (author_follows)
--   participant_count distinct people who actually got into the author's
--                     programs: made progress on any of their `content`
--                     (same definition as the author's own "Учасники"
--                     page) or hold a completed purchase of it. Visitors,
--                     post views, saves and followers are NOT counted.
-- When real purchases / entitlements go live, extend this view only.
create or replace view public.author_audience_stats as
select
  p.id as author_id,
  (select count(*) from public.author_follows f where f.author_id = p.id)::int as follower_count,
  (
    select count(distinct x.uid)
    from (
      select cp.user_id as uid
      from public.content_progress cp
      join public.content c on c.id::text = cp.content_id
      where c.author_id = p.id
      union
      select pu.participant_id
      from public.purchases pu
      join public.content c on c.id = pu.content_id
      where c.author_id = p.id and pu.status = 'completed'
    ) x
    where x.uid <> p.id
  )::int as participant_count
from public.profiles p
where p.role = 'author';

grant select on public.author_audience_stats to anon, authenticated;

-- Make PostgREST pick up the new tables, columns and views immediately.
notify pgrst, 'reload schema';
