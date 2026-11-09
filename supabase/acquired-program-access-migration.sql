-- People who took a program for free keep access to it even if the author later archives it or puts it back to a
-- draft (buyers already do, through has_active_purchase). Run ONCE in the Supabase SQL editor; safe to re-run.
-- Run AFTER program-materials-migration.sql and complaints-migration.sql (the rules below use its sale_status).
--
-- Not applied while access is restricted after a complaint (same rule as for purchases).
-- Only affects reading the program's row, modules and lessons; the "add free content" rule is unchanged.

create or replace function public.has_acquired_program(p_content uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.acquired_content a
    join public.content c on c.id = p_content
    where a.user_id = auth.uid()
      and a.kind = 'program'
      and a.content_id = p_content::text
      and c.kind = 'program'
      and c.access_restricted_at is null
  );
$$;
grant execute on function public.has_acquired_program(uuid) to authenticated;

drop policy if exists "published content is publicly readable" on public.content;
create policy "published content is publicly readable"
  on public.content for select
  using (
    (status = 'published' and sale_status in ('published', 'restored'))
    or auth.uid() = author_id
    or public.has_active_purchase(id)
    or public.has_acquired_program(id)
  );

drop policy if exists "modules follow their content's visibility" on public.content_modules;
create policy "modules follow their content's visibility"
  on public.content_modules for select
  using (
    exists (
      select 1 from public.content c
      where c.id = content_id
        and (
          (c.status = 'published' and c.sale_status in ('published', 'restored'))
          or c.author_id = auth.uid()
          or public.has_active_purchase(c.id)
          or public.has_acquired_program(c.id)
        )
    )
  );

drop policy if exists "items follow their content's visibility" on public.content_items;
create policy "items follow their content's visibility"
  on public.content_items for select
  using (
    exists (
      select 1 from public.content_modules m
      join public.content c on c.id = m.content_id
      where m.id = module_id
        and (
          (c.status = 'published' and c.sale_status in ('published', 'restored'))
          or c.author_id = auth.uid()
          or public.has_active_purchase(c.id)
          or public.has_acquired_program(c.id)
        )
    )
  );
