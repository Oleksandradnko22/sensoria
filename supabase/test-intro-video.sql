-- ТЕСТ: додає відео-презентацію до однієї вже опублікованої програми, щоб побачити картку
-- «Кілька слів від автора» на її сторінці. Змінює лише колонку intro_video_url в одному рядку.
-- Потрібна колонка з program-page-migration.sql (alter table ... add column if not exists intro_video_url).

-- 1) Яку програму буде змінено (найновіша опублікована). Лише перегляд:
select id, title, intro_video_url
from public.content
where kind = 'program' and status = 'published'
order by created_at desc
limit 1;

-- 2) Додати відео:
update public.content
set intro_video_url = 'https://youtu.be/_bc0HnxvtZQ'
where id = (
  select id from public.content
  where kind = 'program' and status = 'published'
  order by created_at desc
  limit 1
)
returning id, title, intro_video_url;

-- 3) Щоб прибрати тестове відео, виконайте (підставте id із результату вище):
-- update public.content set intro_video_url = null where id = '<id>';
