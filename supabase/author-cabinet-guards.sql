-- Author cabinet: two guards found in the audit. Run ONCE in the Supabase SQL editor; safe to re-run.
-- Run AFTER draft-delete-migration.sql.

-- 1) «Was published» can never be switched back off from the app: otherwise an author could turn a live material
--    back into a «never published» draft and delete it.
create or replace function public.keep_ever_published()
returns trigger
language plpgsql
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.ever_published := old.ever_published or new.ever_published;
  end if;
  return new;
end;
$$;
drop trigger if exists keep_ever_published_trg on public.content;
create trigger keep_ever_published_trg
  before update on public.content
  for each row execute function public.keep_ever_published();

-- 2) A material someone added to their cabinet (also a free one) is never deleted.
create or replace function public.content_keep_if_acquired()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.acquired_content') is not null
     and exists (select 1 from public.acquired_content where content_id = old.id::text) then
    raise exception 'Цей матеріал уже є в кабінетах учасників, тому його не можна видалити.';
  end if;
  return old;
end;
$$;
drop trigger if exists content_keep_if_acquired_trg on public.content;
create trigger content_keep_if_acquired_trg
  before delete on public.content
  for each row execute function public.content_keep_if_acquired();

-- 3) The author's public page row is never deleted from the app (nothing is deleted at Sensoria).
revoke delete on public.author_details from anon, authenticated;
