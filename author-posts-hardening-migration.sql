-- Publications hardening. Run once in the Supabase SQL editor. Safe to re-run.
-- Existing rows are NOT re-checked (NOT VALID); every new / edited row is.

-- 1) one short description of the photos of a post (alt text for screen readers)
alter table public.author_posts add column if not exists image_alt text;
alter table public.author_posts drop constraint if exists author_posts_image_alt_len;
alter table public.author_posts
  add constraint author_posts_image_alt_len check (image_alt is null or char_length(image_alt) <= 200);
grant update (image_alt) on public.author_posts to authenticated;

-- 2) photos only from our own storage (or the app itself) — never an arbitrary address
create or replace function public.post_images_ok(imgs text[])
returns boolean language sql immutable as $$
  select coalesce(bool_and(u ~ '^(/[^/]|https://[^/]+/storage/v1/object/public/content-files/)'), true)
  from unnest(coalesce(imgs, '{}')) as u
$$;
alter table public.author_posts drop constraint if exists author_posts_images_own_storage;
alter table public.author_posts
  add constraint author_posts_images_own_storage check (public.post_images_ok(images)) not valid;

-- 3) no e-mail addresses or links in public text (the app already filters contacts;
--    this is the last line of defence)
alter table public.author_posts drop constraint if exists author_posts_no_contacts;
alter table public.author_posts
  add constraint author_posts_no_contacts check (body !~* '(@|https?://|www\.)') not valid;
alter table public.author_post_comments drop constraint if exists author_post_comments_no_contacts;
alter table public.author_post_comments
  add constraint author_post_comments_no_contacts check (body !~* '(@|https?://|www\.)') not valid;

notify pgrst, 'reload schema';
