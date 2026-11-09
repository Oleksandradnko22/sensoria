-- Gift lessons: an author can put their own meditation / PDF guide (even a paid one) into a program as a separate
-- lesson. Everyone who bought the program gets it free. Run ONCE in the Supabase SQL editor, AFTER
-- paid-files-migration.sql and materials-db-model-migration.sql.
--
-- Nothing existing is dropped. has_active_purchase() is NOT changed; a new function is added and only a few read
-- rules (meditation body, guide body, paid files, the material's own row) accept it.

-- 1) A lesson may point at one of the author's own materials.
alter table public.content_items add column if not exists material_id uuid references public.content (id) on delete restrict;
create index if not exists content_items_material_idx on public.content_items (material_id) where material_id is not null;

-- Only the author's OWN meditation / guide, inside the author's OWN program.
create or replace function public.check_item_material()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prog public.content;
  m public.content;
begin
  if new.material_id is null then return new; end if;
  select c.* into prog from public.content_modules md join public.content c on c.id = md.content_id where md.id = new.module_id;
  select * into m from public.content where id = new.material_id;
  if prog.id is null or m.id is null then raise exception 'program or material not found'; end if;
  if prog.kind <> 'program' then raise exception 'only a program lesson can carry a material'; end if;
  if m.kind not in ('meditation', 'guide') then raise exception 'only a meditation or a guide can be attached'; end if;
  if prog.author_id <> m.author_id then raise exception 'you can only attach your own materials'; end if;
  return new;
end;
$$;
drop trigger if exists content_items_material_check on public.content_items;
create trigger content_items_material_check before insert or update on public.content_items
  for each row execute function public.check_item_material();

-- 2) Access: a purchase of the material itself, OR of a program that has a lesson with it. A restricted (complaint)
--    program gives no access, same as for a direct purchase.
create or replace function public.has_material_access(p_material uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.has_active_purchase(p_material)
    or exists (
      select 1
      from public.content_items it
      join public.content_modules md on md.id = it.module_id
      join public.purchases pu on pu.content_id = md.content_id
      join public.content prog on prog.id = md.content_id
      where it.material_id = p_material
        and pu.participant_id = auth.uid()
        and pu.status = 'completed'
        and prog.access_restricted_at is null
    );
$$;
grant execute on function public.has_material_access(uuid) to authenticated;

-- 3) The material's row itself must stay readable by program buyers even if it is later unpublished / archived.
drop policy if exists "bundled materials readable by program buyers" on public.content;
create policy "bundled materials readable by program buyers" on public.content
  for select using (public.has_material_access(id));

-- 4) Re-create the three read rules with has_material_access instead of has_active_purchase.
drop policy if exists "meditation body readable with access" on public.content_meditation_body;
create policy "meditation body readable with access" on public.content_meditation_body
  for select using (
    exists (
      select 1 from public.content c
      where c.id = content_meditation_body.content_id
        and ((c.status = 'published' and c.price = 0) or public.has_material_access(c.id))
    )
    or exists (
      select 1 from public.acquired_content a
      join public.content c on c.id = content_meditation_body.content_id
      where a.user_id = auth.uid() and a.kind = 'meditation' and a.content_id = c.id::text
    )
    or exists (
      select 1 from public.acquired_content a
      join public.content c on c.id = content_meditation_body.content_id
      where a.user_id = auth.uid() and a.kind = 'meditation' and a.content_id = c.slug
    )
  );

drop policy if exists "guide body readable with access" on public.content_guide_body;
create policy "guide body readable with access" on public.content_guide_body
  for select using (
    exists (
      select 1 from public.content c
      where c.id = content_guide_body.content_id
        and ((c.status = 'published' and c.price = 0) or public.has_material_access(c.id))
    )
    or exists (
      select 1 from public.acquired_content a
      join public.content c on c.id = content_guide_body.content_id
      where a.user_id = auth.uid() and a.kind = 'guide' and a.content_id = c.id::text
    )
    or exists (
      select 1 from public.acquired_content a
      join public.content c on c.id = content_guide_body.content_id
      where a.user_id = auth.uid() and a.kind = 'guide' and a.content_id = c.slug
    )
  );

drop policy if exists "authors and buyers read paid files" on storage.objects;
create policy "authors and buyers read paid files" on storage.objects
  for select using (
    bucket_id = 'paid-files'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
        and public.has_material_access(((storage.foldername(name))[2])::uuid)
      )
    )
  );
