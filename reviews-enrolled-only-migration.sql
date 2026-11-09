-- Reviews only from people who joined the program.
-- Course review: needs a content_progress row for that program.
-- Author review: needs a content_progress row for any published program of that author.
-- Editing/deleting one's own existing review stays allowed. Run once in the Supabase SQL editor.

drop policy if exists "participants manage their own reviews" on public.reviews;
-- (the public "reviews are publicly readable" select policy stays as is)

drop policy if exists "participants update own reviews" on public.reviews;
create policy "participants update own reviews" on public.reviews
  for update using (auth.uid() = participant_id) with check (auth.uid() = participant_id);
drop policy if exists "participants delete own reviews" on public.reviews;
create policy "participants delete own reviews" on public.reviews
  for delete using (auth.uid() = participant_id);
drop policy if exists "enrolled participants add reviews" on public.reviews;
create policy "enrolled participants add reviews" on public.reviews
  for insert with check (
    auth.uid() = participant_id
    and (
      -- only programs have an enrollment signal (content_progress); other kinds are gated by the app
      not exists (select 1 from public.content c where c.id = reviews.content_id and c.kind = 'program')
      or exists (
        select 1 from public.content_progress cp
        where cp.user_id = auth.uid() and cp.content_id = reviews.content_id::text
      )
    )
  );

drop policy if exists "participants manage their own author reviews" on public.author_reviews;
drop policy if exists "participants update own author reviews" on public.author_reviews;
create policy "participants update own author reviews" on public.author_reviews
  for update using (auth.uid() = participant_id) with check (auth.uid() = participant_id);
drop policy if exists "participants delete own author reviews" on public.author_reviews;
create policy "participants delete own author reviews" on public.author_reviews
  for delete using (auth.uid() = participant_id);
drop policy if exists "enrolled participants add author reviews" on public.author_reviews;
create policy "enrolled participants add author reviews" on public.author_reviews
  for insert with check (
    auth.uid() = participant_id
    and exists (
      select 1
      from public.content_progress cp
      join public.content c on c.id::text = cp.content_id
      where cp.user_id = auth.uid() and c.author_id = author_reviews.author_id
    )
  );

notify pgrst, 'reload schema';
