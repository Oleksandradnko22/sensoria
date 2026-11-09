-- Closes a gap in «people add free content to their own cabinet»: before, only PROGRAMS were checked
-- (published + price 0); a guide or a meditation could be added to the cabinet by any id, free or not.
-- Now every kind is checked:
--   program    → a published row in public.content with price 0 (as before);
--   guide / meditation → the id must be in the free list below. These two live in the app code for now
--   (not in the database), so the list is kept here. When a new FREE guide or meditation is added
--   to the code, add its id here too (a test in the project fails until the two lists match).
-- Run ONCE in the Supabase SQL editor.

create or replace function public.is_free_static_material(p_kind text, p_id text)
returns boolean language sql immutable as $$
  select (p_kind, p_id) in (
    ('guide', 'what-to-do-when-anxiety-hits'),
    ('meditation', 'quick-grounding')
  );
$$;

drop policy if exists "people add free content to their own cabinet" on public.acquired_content;
create policy "people add free content to their own cabinet" on public.acquired_content
  for insert with check (
    auth.uid() = user_id
    and (
      (kind = 'program' and exists (
        select 1 from public.content c
        where c.id::text = acquired_content.content_id and c.status = 'published' and c.price = 0
      ))
      or (kind in ('guide', 'meditation') and public.is_free_static_material(kind, content_id))
    )
  );

notify pgrst, 'reload schema';
