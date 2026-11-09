-- TEMPORARY, for testing: lets the FREE demo programs (the ones that live in the app code, not in the
-- database) be added to the cabinet from the cart. A real program still needs a published row in
-- public.content with price 0. Paid demo programs stay blocked (there are no payments yet).
-- Run ONCE in the Supabase SQL editor (after acquired-content-free-only-migration.sql).
-- When the demo programs are removed from the app, run this again without the 'program' lines.

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
      (kind = 'program' and (
        exists (
          select 1 from public.content c
          where c.id::text = acquired_content.content_id and c.status = 'published' and c.price = 0
        )
        or public.is_free_static_material(kind, content_id)
      ))
      or (kind in ('guide', 'meditation') and public.is_free_static_material(kind, content_id))
    )
  );

notify pgrst, 'reload schema';
