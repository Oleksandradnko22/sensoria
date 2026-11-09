-- Sample reactions for the sample posts. Run AFTER author-posts-seed.sql.
-- Likes and comments need real user rows (foreign keys to profiles), so they
-- come from the profiles that already exist in your database — the counts
-- will equal the number of such profiles, not 24 / 12. Safe to re-run.
do $r$
declare a_id uuid;
begin
  select id into a_id from public.profiles where role = 'author' order by created_at limit 1;
  if a_id is null then return; end if;

  -- Every non-author profile likes the first four sample posts.
  insert into public.author_post_likes (post_id, user_id)
  select p.id, u.id
  from (select id from public.author_posts
        where author_id = a_id order by created_at desc limit 4) p
  cross join (select id from public.profiles where id <> a_id limit 30) u
  on conflict do nothing;

  -- One participant comment + author reply under the "Чому ми довго думаємо…" post.
  with post as (
    select id from public.author_posts
    where author_id = a_id and body like 'Чому ми довго думаємо%' limit 1
  ), who as (
    select id from public.profiles where id <> a_id order by created_at limit 1
  ), c as (
    insert into public.author_post_comments (post_id, user_id, body)
    select post.id, who.id, 'Дуже відгукується. А як зупинити коло думок ввечері?'
    from post, who
    where not exists (select 1 from public.author_post_comments x where x.post_id = post.id)
    returning id, post_id
  )
  insert into public.author_post_comments (post_id, user_id, parent_id, body)
  select c.post_id, a_id, c.id,
         'Дякую за запитання! Спробуйте записати думку на папері й залишити її до ранку — це дає мозку сигнал, що її не загублено.'
  from c;
end
$r$;
