-- Author replies to reviews about the author (public «Відгуки» tab).
-- Run once in the Supabase SQL editor. Safe to re-run.
--
--   author_reply       the author's public answer (one per review, ≤ 600 chars)
--   author_replied_at  when it was last written
--
-- Rules, enforced in the database (not only in the app):
--   • the AUTHOR the review is about may change ONLY author_reply;
--   • the PARTICIPANT who wrote the review can change rating / text, never the reply;
--   • no e-mail addresses or links in a reply.

alter table public.author_reviews
  add column if not exists author_reply text,
  add column if not exists author_replied_at timestamptz;

alter table public.author_reviews drop constraint if exists author_reviews_reply_len;
alter table public.author_reviews
  add constraint author_reviews_reply_len check (author_reply is null or char_length(btrim(author_reply)) between 1 and 600);
alter table public.author_reviews drop constraint if exists author_reviews_reply_no_contacts;
alter table public.author_reviews
  add constraint author_reviews_reply_no_contacts check (author_reply is null or author_reply !~* '(@|https?://|www\.)') not valid;

-- the author can update rows about themselves (the trigger below limits WHAT)
drop policy if exists "authors reply to reviews about them" on public.author_reviews;
create policy "authors reply to reviews about them"
  on public.author_reviews for update
  using (auth.uid() = author_id) with check (auth.uid() = author_id);

create or replace function public.author_reviews_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null then
    -- service role / SQL editor (moderation, demo data): no restrictions
    return new;
  elsif auth.uid() = old.author_id and auth.uid() <> old.participant_id then
    -- the author: only the reply may change
    if new.rating is distinct from old.rating
       or new.text is distinct from old.text
       or new.participant_id is distinct from old.participant_id
       or new.author_id is distinct from old.author_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Автор може змінювати лише свою відповідь на відгук';
    end if;
    if new.author_reply is distinct from old.author_reply then
      new.author_replied_at := case when new.author_reply is null then null else now() end;
    else
      new.author_replied_at := old.author_replied_at;
    end if;
  else
    -- the participant (or anyone else): the reply is not theirs to change, and a review
    -- cannot be moved to another author / participant
    new.participant_id := old.participant_id;
    new.author_id := old.author_id;
    new.created_at := old.created_at;
    new.author_reply := old.author_reply;
    new.author_replied_at := old.author_replied_at;
  end if;
  return new;
end;
$$;

drop trigger if exists author_reviews_guard on public.author_reviews;
create trigger author_reviews_guard before update on public.author_reviews
  for each row execute function public.author_reviews_guard();

notify pgrst, 'reload schema';
