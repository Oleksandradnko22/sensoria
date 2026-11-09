-- Оновлення для таблиці content_item_practice_responses: додає
-- program_id / program_title / item_title / prompt, щоб відповіді на
-- практичні запитання ("Спробуйте зараз") теж показувались у "Ваші
-- спостереження". Виконати в Supabase → SQL Editor одним запитом.
--
-- Це ALTER, не CREATE — таблиця в тебе вже є з попередньої міграції,
-- цей скрипт просто додає нові колонки, старі відповіді не постраждають
-- (нові колонки для них будуть NULL, картки просто не покажуть
-- назву/питання для дуже старих записів).

alter table public.content_item_practice_responses
  add column if not exists program_id text,
  add column if not exists program_title text,
  add column if not exists item_title text,
  add column if not exists prompt text;
