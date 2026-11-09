-- Makes "add free material to my cabinet" depend on the DATABASE, not on a hand-kept list.
-- A program, guide or meditation can be added when its own row in public.content is published and costs 0
-- (the same rule that already applied to programs). Anything an author publishes later works by itself,
-- nobody has to allow it by hand.
-- The short static list stays ONLY for the few materials that still live in the app code (not in the
-- database yet): one guide, one meditation and the free demo programs. It shrinks to nothing as those move
-- into the database.
-- Run ONCE in the Supabase SQL editor (after the two earlier acquired-content migrations).

create or replace function public.is_free_static_material(p_kind text, p_id text)
returns boolean language sql immutable as $$
  select (p_kind, p_id) in (
    ('guide', 'what-to-do-when-anxiety-hits'),
    ('meditation', 'quick-grounding'),
    ('program', 'healthy-balance'),
    ('program', 'self-esteem-course')
  );
$$;

drop policy if exists "people add free content to their own cabinet" on public.acquired_content;
create policy "people add free content to their own cabinet" on public.acquired_content
  for insert with check (
    auth.uid() = user_id
    and (
      exists (
        select 1 from public.content c
        where c.id::text = acquired_content.content_id
          and c.kind = acquired_content.kind
          and c.status = 'published'
          and c.price = 0
      )
      or public.is_free_static_material(kind, content_id)
    )
  );

notify pgrst, 'reload schema';
