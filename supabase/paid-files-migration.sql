-- Private storage for the files of PAID guides and meditations (audio, PDF).
-- Run ONCE in the Supabase SQL editor.
--
-- Why: the existing `content-files` bucket is public, so anyone who knows a file's link can open it without paying.
-- Paid files go to this private bucket instead; the app asks for a short-lived signed link, and storage only hands
-- one out to the author or to a person with an active purchase of that material.
--
-- Path convention (enforced below): {author_id}/{content_id}/{file}
--   segment 1 = the uploader's own id, segment 2 = the content row's uuid.
-- Free materials stay in `content-files` (nothing to protect, and they work offline / without sign-in).

insert into storage.buckets (id, name, public)
values ('paid-files', 'paid-files', false)
on conflict (id) do update set public = false;

drop policy if exists "authors upload their own paid files" on storage.objects;
create policy "authors upload their own paid files" on storage.objects
  for insert with check (bucket_id = 'paid-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "authors update their own paid files" on storage.objects;
create policy "authors update their own paid files" on storage.objects
  for update using (bucket_id = 'paid-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "authors delete their own paid files" on storage.objects;
create policy "authors delete their own paid files" on storage.objects
  for delete using (bucket_id = 'paid-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- reading: the author, or a buyer whose purchase is active (has_active_purchase also respects complaint restrictions)
drop policy if exists "authors and buyers read paid files" on storage.objects;
create policy "authors and buyers read paid files" on storage.objects
  for select using (
    bucket_id = 'paid-files'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
        and public.has_active_purchase(((storage.foldername(name))[2])::uuid)
      )
    )
  );
