-- Starter content for ONE author (same sample content as the dev preview).
-- Run AFTER author-posts-migration.sql. By default the first author profile
-- is used; to pick another, replace the `target` subquery with
--   (select id from public.profiles where id = '<uuid>')
-- Safe to re-run: adds only sample posts that are not there yet; profile fields
-- are only filled where they are still empty. Edit or delete everything
-- later in the author cabinet. Likes/comments/followers are NOT faked.
do $seed$
declare t_id uuid;
begin
select id into t_id from public.profiles where role = 'author' order by created_at limit 1;
if t_id is null then raise notice 'No author profile found'; return; end if;

-- Profile copy, topics and cover.
update public.author_details d set
  positioning = coalesce(nullif(d.positioning, ''), 'Допомагаю краще розуміти емоційні реакції та знаходити практичні способи підтримати себе.'),
  approach = coalesce(nullif(d.approach, ''), 'Я не обіцяю швидких рішень. Ми разом дивимося, що відбувається з вашим станом, і підбираємо невеликі практики, які можна повторювати щодня — без тиску й самокритики.'),
  topics = case when coalesce(array_length(d.topics, 1), 0) = 0 then array['stress','awareness','emotionalBalance'] else d.topics end,
  cover_type = coalesce(d.cover_type, 'abstract'),
  cover_variant = coalesce(d.cover_variant, 'calm-02')
where d.profile_id = t_id;

-- Posts.
insert into public.author_posts
  (author_id, body, content_id, content_kind, is_pinned, is_share, images, video_url, created_at)
select t_id, v.body, v.content_id, v.content_kind, v.is_pinned, v.is_share, v.images, v.video_url, v.created_at
from (values
  ('З чого почати знайомство з моєю роботою' || E'\n\n' || 'Я пишу про те, як помічати власний стан і дбати про себе без перфекціонізму. Якщо ви тут уперше — почніть із короткої практики заземлення, а потім повертайтеся сюди за поясненнями.',
   'quick-grounding', 'meditation', not exists (select 1 from public.author_posts x where x.author_id = t_id and x.is_pinned), false, '{}'::text[], null::text, now() - interval '28 days'),
  ('Чому ми довго думаємо про одну й ту саму ситуацію' || E'\n\n' || 'Коли мозок вважає, що проблему ще не розв’язано, він повертається до неї знову й знову. Це не слабкість — це спроба вас захистити. Допомагає не боротьба з думками, а маленький крок: назвати, що саме турбує, і вирішити, що з цим можна зробити сьогодні.',
   'what-to-do-when-anxiety-hits', 'guide', false, false, '{}'::text[], null, now() - interval '6 days'),
  ('Мій ранковий ритуал' || E'\n\n' || 'Кілька кадрів із простору, де я починаю день: тиша, чай і п’ять хвилин без телефону.',
   null, null, false, false, array['data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27900%27%20height%3D%271125%27%3E%3Cdefs%3E%3ClinearGradient%20id%3D%27g%27%20x1%3D%270%27%20y1%3D%270%27%20x2%3D%271%27%20y2%3D%271%27%3E%3Cstop%20offset%3D%270%27%20stop-color%3D%27%23c7d2fe%27%2F%3E%3Cstop%20offset%3D%271%27%20stop-color%3D%27%23a78bfa%27%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%27900%27%20height%3D%271125%27%20fill%3D%27url%28%23g%29%27%2F%3E%3C%2Fsvg%3E','data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27900%27%20height%3D%271125%27%3E%3Cdefs%3E%3ClinearGradient%20id%3D%27g%27%20x1%3D%270%27%20y1%3D%270%27%20x2%3D%271%27%20y2%3D%271%27%3E%3Cstop%20offset%3D%270%27%20stop-color%3D%27%23fde68a%27%2F%3E%3Cstop%20offset%3D%271%27%20stop-color%3D%27%23fca5a5%27%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%27900%27%20height%3D%271125%27%20fill%3D%27url%28%23g%29%27%2F%3E%3C%2Fsvg%3E','data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27900%27%20height%3D%271125%27%3E%3Cdefs%3E%3ClinearGradient%20id%3D%27g%27%20x1%3D%270%27%20y1%3D%270%27%20x2%3D%271%27%20y2%3D%271%27%3E%3Cstop%20offset%3D%270%27%20stop-color%3D%27%2399f6e4%27%2F%3E%3Cstop%20offset%3D%271%27%20stop-color%3D%27%2393c5fd%27%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%27900%27%20height%3D%271125%27%20fill%3D%27url%28%23g%29%27%2F%3E%3C%2Fsvg%3E']::text[], null, now() - interval '9 days'),
  ('Дихання 4-6: коротке пояснення' || E'\n\n' || 'Як працює подовжений видих і чому він заспокоює.',
   null, null, false, false, '{}'::text[], 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', now() - interval '11 days'),
  ('Раджу цю практику всім, хто шукає короткий спосіб заспокоїтись перед сном.',
   'quick-grounding', 'meditation', false, true, '{}'::text[], null, now() - interval '12 days'),
  ('Невелике нагадування на сьогодні: втома — це теж інформація. Спробуйте не виправдовуватися перед собою, а просто помітити її.',
   null, null, false, false, '{}'::text[], null, now() - interval '13 days')
) as v(body, content_id, content_kind, is_pinned, is_share, images, video_url, created_at)
where not exists (select 1 from public.author_posts p where p.author_id = t_id and p.body = v.body);
-- Only one pinned post per author: unpin the sample one if another is already pinned.
update public.author_posts a set is_pinned = false
where a.author_id = t_id and a.is_pinned
  and a.body like 'З чого почати знайомство%'
  and exists (select 1 from public.author_posts o where o.author_id = t_id and o.is_pinned and o.id <> a.id);
end
$seed$;
