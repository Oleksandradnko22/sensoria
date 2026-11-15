-- Who may upload files. Run ONCE in the Supabase SQL editor; safe to re-run. Run AFTER paid-files-migration.sql.
--
-- Public files (bucket content-files):
--   * an author (not banned) — anything in their own folder: covers, materials, «Про мене», documents, posts;
--   * a participant (not banned) — only their photo (avatar) and photos for their own posts, pictures only.
-- Paid files (bucket paid-files): only an author (not banned), in their own folder.
-- Nobody else, and nobody can write into someone else's folder.
-- The buckets also refuse files that are too big or of a wrong type (checked by Supabase itself).

create or replace function public.storage_can_write(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and (storage.foldername(p_name))[1] = auth.uid()::text
       and coalesce(p.is_banned, false) = false
       and (
         p.role = 'author'
         or (
           p_bucket = 'content-files'
           and lower(coalesce(storage.extension(p_name), '')) in ('jpg', 'jpeg', 'png', 'webp', 'gif')
           and (p_name like auth.uid()::text || '/avatar.%' or p_name like auth.uid()::text || '/posts/%')
         )
       )
  );
$$;
revoke all on function public.storage_can_write(text, text) from public, anon;
grant execute on function public.storage_can_write(text, text) to authenticated;

-- public files
drop policy if exists "authors upload their own content files" on storage.objects;
create policy "authors upload their own content files" on storage.objects
  for insert to authenticated with check (bucket_id = 'content-files' and public.storage_can_write(bucket_id, name));
drop policy if exists "authors update their own content files" on storage.objects;
create policy "authors update their own content files" on storage.objects
  for update to authenticated
  using (bucket_id = 'content-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'content-files' and public.storage_can_write(bucket_id, name));

-- paid files
drop policy if exists "authors upload their own paid files" on storage.objects;
create policy "authors upload their own paid files" on storage.objects
  for insert to authenticated with check (bucket_id = 'paid-files' and public.storage_can_write(bucket_id, name));
drop policy if exists "authors update their own paid files" on storage.objects;
create policy "authors update their own paid files" on storage.objects
  for update to authenticated
  using (bucket_id = 'paid-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'paid-files' and public.storage_can_write(bucket_id, name));

-- size and type, checked by Supabase on every upload
-- (the biggest real files: meditation audio up to 100 MB, a PDF guide up to 80 MB)
update storage.buckets
   set file_size_limit = 100 * 1024 * 1024,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/gif',
         'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm',
         'application/pdf'
       ]
 where id in ('content-files', 'paid-files');
