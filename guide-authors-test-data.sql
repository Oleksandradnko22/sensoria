-- Тестові дані для «Запитати автора» (2026-09-09) — автоматично бере
-- ПЕРШОГО автора з profiles (жодних id вручну вставляти не треба).
-- Виконати ПІСЛЯ guide-authors-migration.sql, в Supabase → SQL Editor.

insert into public.guide_authors (guide_id, author_id)
select 'what-to-do-when-anxiety-hits', id
from public.profiles
where role = 'author'
limit 1
on conflict (guide_id) do update set author_id = excluded.author_id;

insert into public.meditation_authors (meditation_id, author_id)
select 'quick-grounding', id
from public.profiles
where role = 'author'
limit 1
on conflict (meditation_id) do update set author_id = excluded.author_id;

-- Перевірка — якщо тут 0 рядків, значить у profiles взагалі немає
-- жодного акаунту з role = 'author' (потрібно спершу зареєструвати
-- хоча б одного автора):
select * from public.guide_authors where guide_id = 'what-to-do-when-anxiety-hits';
select * from public.meditation_authors where meditation_id = 'quick-grounding';

-- Після цього: увійдіть як УЧАСНИК (не той самий акаунт-автор) і
-- відкрийте «Інтерактивний набір проти тривоги» (гайд) або «Швидке
-- заземлення» (медитація) — унизу з'явиться «Запитати автора».
-- Повідомлення прийде в кабінет автора, розділ «Повідомлення».
