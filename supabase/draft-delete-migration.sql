-- Deleting a draft that was NEVER published and never bought (see docs/content-lifecycle.md). Run ONCE in the
-- Supabase SQL editor; safe to re-run. Run AFTER content-archive-rules-migration.sql.
--
-- DELETE on public.content stays revoked for everyone. The only way to remove a row is delete_my_draft(), which
-- checks every condition itself. Deleting is permanent: modules, lessons and the material's text/files rows go with it.

-- 1) Remember that something was published at least once (a draft restored from the archive is NOT "never published").
alter table public.content add column if not exists ever_published boolean not null default false;

-- rows that are, or were, live today
update public.content set ever_published = true where status in ('published', 'archived') and ever_published = false;
update public.content c set ever_published = true
 where ever_published = false and exists (select 1 from public.purchases p where p.content_id = c.id);

create or replace function public.mark_ever_published()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('published', 'archived') then
    new.ever_published := true;
  end if;
  return new;
end;
$$;
drop trigger if exists mark_ever_published_trg on public.content;
create trigger mark_ever_published_trg
  before insert or update of status on public.content
  for each row execute function public.mark_ever_published();

-- 2) The deletion itself.
create or replace function public.delete_my_draft(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.content;
begin
  if auth.uid() is null then raise exception 'Потрібно увійти.'; end if;
  select * into c from public.content where id = p_id;
  if c.id is null or c.author_id <> auth.uid() then raise exception 'Матеріал не знайдено.'; end if;
  if c.status <> 'draft' then raise exception 'Видалити можна лише чернетку.'; end if;
  if c.ever_published then raise exception 'Цей матеріал уже публікувався, тому його не можна видалити. Його можна заархівувати.'; end if;
  if exists (select 1 from public.purchases where content_id = p_id) then
    raise exception 'Цей матеріал хтось купував, тому його не можна видалити.';
  end if;
  if exists (select 1 from public.content_items where material_id = p_id) then
    raise exception 'Цей матеріал додано подарунком у програму. Спершу приберіть його з програми.';
  end if;
  delete from public.content where id = p_id;
end;
$$;
revoke all on function public.delete_my_draft(uuid) from public, anon;
grant execute on function public.delete_my_draft(uuid) to authenticated;
