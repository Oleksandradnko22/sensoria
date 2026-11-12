-- «Повідомлення» that stay light however many messages there are. Run ONCE in the Supabase SQL editor; safe to re-run.
-- Run it BEFORE deploying the site and the send-message function that use it (the site falls back while it's absent).
--
-- Messages are never deleted by age: they are short texts, and the history matters for safety and disputes. What
-- changes is how much is LOADED: the list comes 20 conversations at a time (built in the database), a conversation
-- opens with its last 50 messages and older ones load on request, and conversations quiet for 6 months move to
-- «Архів» (they come back by themselves when someone writes). Plus a real broadcast (send-message function).

-- ── indexes for the two ways messages are read ─────────────────────────────────────────────────────────────────
create index if not exists messages_sender_created_idx on public.messages (sender_id, created_at desc);
create index if not exists messages_recipient_created_idx on public.messages (recipient_id, created_at desc);
create index if not exists messages_recipient_unread_idx on public.messages (recipient_id) where not read;

-- ── one page of my conversations ───────────────────────────────────────────────────────────────────────────────
-- p_filter: 'all' (active), 'unread', 'archive' (last message older than 180 days, nothing unread), 'everything'.
-- Columns added by later migrations (deleted_at, hidden_by_*) are read through to_jsonb, so this works either way.
create or replace function public.my_conversations(p_limit int default 20, p_offset int default 0, p_search text default null, p_filter text default 'all')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select m.*,
           case when m.sender_id = auth.uid() then m.recipient_id else m.sender_id end as other_id,
           coalesce(to_jsonb(m) ->> 'deleted_at', '') <> '' as is_deleted
      from public.messages m
     where (m.sender_id = auth.uid() and coalesce((to_jsonb(m) ->> 'hidden_by_sender')::boolean, false) = false)
        or (m.recipient_id = auth.uid() and coalesce((to_jsonb(m) ->> 'hidden_by_recipient')::boolean, false) = false)
  ),
  last_msg as (
    select distinct on (other_id, coalesce(content_id, '')) *
      from mine
     order by other_id, coalesce(content_id, ''), created_at desc
  ),
  unread_keys as (
    select distinct other_id, coalesce(content_id, '') as ck from mine
     where recipient_id = auth.uid() and not read and not is_deleted
  ),
  conv as (
    select l.other_id, l.content_id, l.created_at as last_at, l.sender_id = auth.uid() as from_me,
           case when l.is_deleted then 'Повідомлення видалено' else left(l.body, 160) end as preview,
           exists (select 1 from unread_keys k where k.other_id = l.other_id and k.ck = coalesce(l.content_id, '')) as unread,
           coalesce(p.name, 'Учасник Sensoria') as other_name, p.avatar_url as other_avatar,
           (select c.title from public.content c where c.id::text = l.content_id or c.slug = l.content_id limit 1) as content_title
      from last_msg l left join public.profiles p on p.id = l.other_id
  ),
  scoped as (
    select *, (last_at < now() - interval '180 days' and not unread) as archived from conv
  ),
  term as (
    -- the search text taken literally: % and _ typed by the author are not wildcards
    select '%' || replace(replace(replace(coalesce(p_search, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  ),
  filtered as (
    select s.* from scoped s, term
     where (case p_filter when 'unread' then unread when 'archive' then archived when 'everything' then true else not archived end)
       and (p_search is null or p_search = '' or other_name ilike term.pat or coalesce(content_title, '') ilike term.pat or preview ilike term.pat)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'unread', (select count(*) from scoped where unread),
    'archived', (select count(*) from scoped where archived),
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.last_at desc)
        from (select other_id, content_id, last_at, from_me, preview, unread, other_name, other_avatar, content_title
                from filtered order by last_at desc
               limit greatest(1, least(p_limit, 50)) offset greatest(0, p_offset)) x
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.my_conversations(int, int, text, text) from public, anon;
grant execute on function public.my_conversations(int, int, text, text) to authenticated;

-- ── one conversation, newest 50 first page, then older pages ───────────────────────────────────────────────────
create or replace function public.my_thread(p_other uuid, p_content text default null, p_before timestamptz default null, p_limit int default 50)
returns table (id uuid, sender_id uuid, body text, created_at timestamptz, deleted boolean)
language sql
stable
security definer
set search_path = public
as $$
  select x.id, x.sender_id, case when x.deleted then '' else x.body end, x.created_at, x.deleted
    from (
      select m.id, m.sender_id, m.body, m.created_at, coalesce(to_jsonb(m) ->> 'deleted_at', '') <> '' as deleted
        from public.messages m
       where ((m.sender_id = auth.uid() and m.recipient_id = p_other and coalesce((to_jsonb(m) ->> 'hidden_by_sender')::boolean, false) = false)
           or (m.sender_id = p_other and m.recipient_id = auth.uid() and coalesce((to_jsonb(m) ->> 'hidden_by_recipient')::boolean, false) = false))
         and coalesce(m.content_id, '') = coalesce(p_content, '')
         and (p_before is null or m.created_at < p_before)
       order by m.created_at desc
       limit greatest(1, least(p_limit, 100))
    ) x
   order by x.created_at asc;
$$;
revoke all on function public.my_thread(uuid, text, timestamptz, int) from public, anon;
grant execute on function public.my_thread(uuid, text, timestamptz, int) to authenticated;

-- ── broadcasts ─────────────────────────────────────────────────────────────────────────────────────────────────
-- One message from the author to every participant (or every participant of one material), delivered as ordinary
-- messages through the send-message function: moderated, max 1 per 24 hours, max 1500 characters.
create table if not exists public.author_broadcasts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  content_id uuid references public.content (id) on delete set null,
  body text not null,
  recipients int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists author_broadcasts_author_idx on public.author_broadcasts (author_id, created_at desc);
alter table public.author_broadcasts enable row level security;
drop policy if exists "authors see their own broadcasts" on public.author_broadcasts;
create policy "authors see their own broadcasts" on public.author_broadcasts for select using (auth.uid() = author_id);
-- written only by the send-message function (service role)

-- who receives a broadcast: the same people as «Учасники» (buyers, free adds, started), never the author;
-- only for the server function (service role)
create or replace function public.author_broadcast_recipients(p_author uuid, p_content uuid default null)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select c.id, c.slug from public.content c
     where c.author_id = p_author and (p_content is null or c.id = p_content) and (c.status <> 'draft' or c.ever_published)
  )
  select distinct u.user_id from (
    select p.participant_id as user_id from public.purchases p where p.status = 'completed' and p.content_id in (select id from mine)
    union select a.user_id from public.acquired_content a join mine on a.content_id in (mine.id::text, mine.slug)
    union select cp.user_id from public.content_progress cp join mine on cp.content_id = mine.id::text
    union select s.user_id from public.meditation_sessions s join mine on s.meditation_id in (mine.id::text, mine.slug)
    union select g.user_id from public.guide_section_views g join mine on g.guide_id in (mine.id::text, mine.slug)
  ) u
  join public.profiles pr on pr.id = u.user_id
  where u.user_id <> p_author and not pr.is_banned;
$$;
revoke all on function public.author_broadcast_recipients(uuid, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
