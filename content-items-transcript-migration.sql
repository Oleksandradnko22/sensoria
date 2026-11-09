-- Додає колонку transcript до content_items (текст відео/аудіо, який
-- автор вставляє вручну — YouTube не дає надійно витягти субтитри
-- автоматично). Виконати в Supabase → SQL Editor одним запитом.
--
-- Це ALTER, не CREATE — таблиця content_items вже є, скрипт просто
-- додає нову колонку, існуючі уроки не постраждають (transcript буде
-- NULL, у Lesson Player для них просто не буде кнопки "Показати
-- транскрипт").

alter table public.content_items
  add column if not exists transcript text;
