-- Author read access to real participant engagement data.
-- Run this once in Supabase: Project -> SQL Editor -> New query -> paste -> Run.
--
-- Additive select-only policies — every existing policy on these
-- tables stays exactly as it was (participants still only WRITE their
-- own rows), this only adds a second, read-only path for an author to
-- see rows tied to their own content/programs.

create policy "authors view progress on their own content"
  on public.content_progress for select
  using (
    exists (
      select 1 from public.content c
      where c.id::text = content_progress.content_id
        and c.author_id = auth.uid()
    )
  );

create policy "authors view practice responses on their own programs"
  on public.content_item_practice_responses for select
  using (
    exists (
      select 1 from public.content c
      where c.id::text = content_item_practice_responses.program_id
        and c.author_id = auth.uid()
    )
  );

create policy "authors view reflections on their own programs"
  on public.content_item_reflections for select
  using (
    exists (
      select 1 from public.content c
      where c.id::text = content_item_reflections.program_id
        and c.author_id = auth.uid()
    )
  );

create policy "authors view mood checkins on their own programs"
  on public.content_item_mood_checkins for select
  using (
    exists (
      select 1 from public.content c
      where c.id::text = content_item_mood_checkins.program_id
        and c.author_id = auth.uid()
    )
  );

create policy "authors view feedback on their own content items"
  on public.content_item_feedback for select
  using (
    exists (
      select 1 from public.content_items ci
      join public.content_modules m on m.id = ci.module_id
      join public.content c on c.id = m.content_id
      where ci.id::text = content_item_feedback.content_item_id
        and c.author_id = auth.uid()
    )
  );
