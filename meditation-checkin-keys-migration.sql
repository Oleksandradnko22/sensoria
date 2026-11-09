-- Перевірка стану після медитації: ключі замість підписів + захист шкали.
-- Виконати в Supabase → SQL Editor одним запитом. Безпечно.
--
-- 1) Нові записи зберігають СТАБІЛЬНІ КЛЮЧІ варіантів (anxious, calmer, ...),
--    а не український підпис. Старі записи з підписами додатково читаються
--    правильно (код зіставляє підпис із ключем), тож їх переписувати не
--    обовʼязково. Нижче — необовʼязкове вирівнювання, щоб у базі було єдине
--    представлення (аналітика за ключами).
update public.meditation_mood_checkins set states = (
  select coalesce(array_agg(case s
    when 'Тривожно' then 'anxious'
    when 'Напружено' then 'tense'
    when 'Втомлено' then 'tired'
    when 'Не можу зосередитись' then 'cant_focus'
    when 'Важко заснути' then 'cant_sleep'
    when 'Просто хочу побути в тиші' then 'want_quiet'
    else s end), '{}')
  from unnest(states) as s
)
where states is not null and cardinality(states) > 0;

update public.meditation_mood_checkins set change_note = (
  select string_agg(case trim(p)
    when 'Стало спокійніше' then 'calmer'
    when 'Думок стало менше' then 'fewer_thoughts'
    when 'Відчуваю більше опори' then 'more_support'
    when 'Майже нічого не змінилося' then 'little_changed'
    when 'Важко сказати' then 'hard_to_say'
    else trim(p) end, ', ')
  from unnest(string_to_array(change_note, ',')) as p
)
where change_note is not null and change_note <> '';

-- 2) Шкала 1–5 для НОВИХ рядків (not valid = старі рядки з колишньої шкали
--    1–10 не перевіряються і не ламаються).
alter table public.meditation_mood_checkins
  add constraint meditation_mood_before_range check (before_value is null or before_value between 1 and 5) not valid;
alter table public.meditation_mood_checkins
  add constraint meditation_mood_after_range check (after_value is null or after_value between 1 and 5) not valid;
