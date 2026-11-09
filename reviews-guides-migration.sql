-- Reviews for catalog guides / meditations (their ids are text slugs like "quick-grounding").
-- reviews.content_id was a uuid tied to public.content, so only author programs could be reviewed.
-- This makes it text (existing program reviews keep working: the uuid becomes the same text).
-- Run ONCE in the Supabase SQL editor, AFTER reviews-enrolled-only-migration.sql.

begin;

-- policies that mention content_id must go before the type change
drop policy if exists "authors reply to reviews on their own content" on public.reviews;
drop policy if exists "enrolled participants add reviews" on public.reviews;

alter table public.reviews drop constraint if exists reviews_content_id_fkey;
alter table public.reviews alter column content_id type text using content_id::text;

-- the author of a program, guide or meditation can reply to reviews about it
create policy "authors reply to reviews on their own content"
  on public.reviews for update
  using (
    exists (select 1 from public.content c where c.id::text = reviews.content_id and c.author_id = auth.uid())
    or exists (select 1 from public.guide_authors g where g.guide_id = reviews.content_id and g.author_id = auth.uid())
    or exists (select 1 from public.meditation_authors m where m.meditation_id = reviews.content_id and m.author_id = auth.uid())
  );

-- programs need an enrollment (content_progress row); guides and meditations are gated by the app
create policy "enrolled participants add reviews" on public.reviews
  for insert with check (
    auth.uid() = participant_id
    and (
      not exists (select 1 from public.content c where c.id::text = reviews.content_id and c.kind = 'program')
      or exists (
        select 1 from public.content_progress cp
        where cp.user_id = auth.uid() and cp.content_id = reviews.content_id
      )
    )
  );

-- a review has no foreign key any more, so remove reviews of a deleted program ourselves
create or replace function public.delete_reviews_of_content() returns trigger language plpgsql security definer as $$
begin
  delete from public.reviews where content_id = old.id::text;
  return old;
end $$;
drop trigger if exists content_delete_reviews on public.content;
create trigger content_delete_reviews after delete on public.content
  for each row execute function public.delete_reviews_of_content();

commit;

notify pgrst, 'reload schema';
