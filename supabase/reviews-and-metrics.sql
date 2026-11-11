-- Reviews protection + one source of numbers for «Огляд» / «Контент». Run ONCE in the Supabase SQL editor; safe to
-- re-run. Run it BEFORE deploying the site version that uses author_content_metrics (the site falls back if it's absent).
--
-- 1) A review of a material belongs to the participant: the author may write ONLY the public reply (≤ 600 characters,
--    no e-mails or links), the participant may change rating / text but never the reply. Before this file the author
--    could change any column of a review on their material through the API.
-- 2) author_content_metrics(): participants, income and rating per material, counted by the SAME rules as «Учасники»
--    (author_participants), «Аналітика» (author_analytics) and «Фінанси» (the author's share after Sensoria's
--    commission and refunds). So every tab shows the same numbers.

-- ── 1. reviews: who may change what ────────────────────────────────────────────────────────────────────────────
create or replace function public.reviews_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if; -- server code / admin tools
  if exists (select 1 from public.profiles where id = auth.uid() and is_admin) then return new; end if;
  if auth.uid() = old.participant_id then
    -- the participant: their own words and rating, never the author's reply
    new.author_reply := old.author_reply;
    return new;
  end if;
  -- the author of the material: only the reply
  new.participant_id := old.participant_id;
  new.content_id := old.content_id;
  new.rating := old.rating;
  new.text := old.text;
  new.created_at := old.created_at;
  if new.author_reply is not null then
    new.author_reply := btrim(new.author_reply);
    if char_length(new.author_reply) = 0 then new.author_reply := null;
    elsif char_length(new.author_reply) > 600 then
      raise exception 'Відповідь на відгук — не більше 600 символів.' using errcode = 'P0001';
    elsif new.author_reply ~* '(@|https?://|www\.)' then
      raise exception 'У відповіді не можна залишати контакти чи посилання.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_guard on public.reviews;
create trigger reviews_guard before update on public.reviews
  for each row execute function public.reviews_guard();

-- ── 2. numbers per material (the author's own) ─────────────────────────────────────────────────────────────────
create or replace function public.author_content_metrics()
returns table (content_id uuid, participants int, revenue numeric, rating numeric, reviews int)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select c.id, c.slug from public.content c where c.author_id = auth.uid()
  ),
  people as (
    select p.participant_id as user_id, p.content_id from public.purchases p where p.status = 'completed' and p.content_id in (select id from mine)
    union select a.user_id, mine.id from public.acquired_content a join mine on a.content_id in (mine.id::text, mine.slug)
    union select cp.user_id, mine.id from public.content_progress cp join mine on cp.content_id = mine.id::text
    union select s.user_id, mine.id from public.meditation_sessions s join mine on s.meditation_id in (mine.id::text, mine.slug)
    union select g.user_id, mine.id from public.guide_section_views g join mine on g.guide_id in (mine.id::text, mine.slug)
  ),
  money as (
    -- the author's share after commission and refunds (finance record); before the finance migration: 70 % of the price
    select p.content_id,
           coalesce(((to_jsonb(fp) ->> 'author_kop')::numeric - coalesce((to_jsonb(fp) ->> 'author_refunded_kop')::numeric, 0)) / 100.0, p.amount * 0.7) as uah
      from public.purchases p
      left join public.finance_payments fp on (to_jsonb(fp) ->> 'purchase_id') = p.id::text
     where p.status = 'completed' and p.content_id in (select id from mine)
  )
  select m.id,
         (select count(distinct user_id)::int from people where people.content_id = m.id and people.user_id <> auth.uid()),
         coalesce((select round(sum(uah)) from money where money.content_id = m.id), 0),
         (select round(avg(r.rating)::numeric, 1) from public.reviews r where r.content_id::text in (m.id::text, m.slug)),
         (select count(*)::int from public.reviews r where r.content_id::text in (m.id::text, m.slug))
    from mine m;
$$;

revoke all on function public.author_content_metrics() from public, anon;
grant execute on function public.author_content_metrics() to authenticated;

notify pgrst, 'reload schema';
