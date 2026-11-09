-- TEST COPY ONLY — fills Masha's «Про мене» (current shape; the video is the same TEST video as in the test feed — replace it with her real one in the cabinet) so the
-- tab can be looked at. The texts are placeholders written for testing, not
-- Masha's words: replace them in the cabinet (Публічний профіль → «Сторінка
-- „Про мене“»). No migration needed beyond author-story-migration.sql.
-- Remove with:
--   update public.author_details set story = null
--   where profile_id = '88aafc4a-39fc-4b5c-8a42-487d486cd58f';
update public.author_details
set story = jsonb_build_object(
  -- TEST stock photo (Unsplash License, Ayo Ogunseinde) — not Masha; upload her real portrait in the cabinet to replace it
  'portraitUrl', 'https://images.unsplash.com/photo-1569925444984-9e2e5fc3d1fb?w=800&h=1000&fit=crop&crop=faces&auto=format&q=70',
  'intro', E'Я прийшла в цю сферу, коли помітила, як багато людей живуть у постійній напрузі й не мають слів для свого стану. Спершу я шукала відповіді для себе, а згодом почала ділитися тим, що справді допомагало мені та людям поруч.\n\nУ роботі мені важливо не поспішати й помічати вже наявне. Поруч зі мною можна говорити спокійно й чесно, без оцінок і потреби виглядати сильнішим, ніж ви є зараз.',
  'viewpoint', 'Не кожну емоцію треба виправляти',
  'viewpointNote', 'Іноді спершу важливо зрозуміти, про що вона говорить. Тому мої практики починаються з уваги до стану, а не з «правильних» відповідей.',
  'steps', jsonb_build_array(
    jsonb_build_object('icon', 'search', 'title', 'Помітити', 'text', 'Звернути увагу на свій емоційний стан.'),
    jsonb_build_object('icon', 'lightbulb', 'title', 'Зрозуміти', 'text', 'Дослідити, що може стояти за реакцією.'),
    jsonb_build_object('icon', 'sparkles', 'title', 'Спробувати', 'text', 'Обрати невеликий наступний крок.'),
    jsonb_build_object('icon', 'moon', 'title', 'Пригальмувати', 'text', 'Дати собі кілька хвилин без поспіху.'),
    jsonb_build_object('icon', 'compass', 'title', 'Повернутися', 'text', 'Помітити, що змінилося після практики.'),
    jsonb_build_object('icon', 'check', 'title', 'Закріпити', 'text', 'Обрати одну звичку, яку легко повторювати.')
  ),
  'principles', jsonb_build_array('Без тиску', 'Повага до індивідуального темпу', 'Невеликі кроки замість вимоги змінити все одразу'),
  'principleIcons', jsonb_build_array('shield', 'user', 'feather'),
  'offers', jsonb_build_array('Короткі практики на кілька хвилин', 'Пояснення простими словами'),
  'offerIcons', jsonb_build_array('clock', 'message'),
  'notOffers', jsonb_build_array('Не замінюю медичну чи психотерапевтичну допомогу', 'Не ставлю діагнозів'),
  'faq', jsonb_build_array(
    jsonb_build_object('q', 'З чого краще почати знайомство з моїми матеріалами?', 'a', 'Почніть із короткої практики на кілька хвилин. Не обов’язково проходити все одразу: обирайте те, що зараз актуально для вас.'),
    jsonb_build_object('q', 'Чи потрібен попередній досвід?', 'a', 'Ні. Усе пояснюється простими словами, без спеціальних знань.'),
    jsonb_build_object('q', 'Чи можна проходити матеріали у власному темпі?', 'a', 'Так, у матеріалах немає жодних строків: повертайтеся тоді, коли вам зручно.')
  ),
  'personal', 'Я обрала цю тему, бо сама довго вчилася помічати свій стан замість того, щоб його заглушати. Хочу, щоб такий досвід був доступнішим і спокійнішим.',
  -- the same test video that is in the test feed post (not Masha's real one)
  'media', jsonb_build_object('kind', 'video', 'url', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', 'caption', '', 'duration', '1:24')
)
where profile_id = '88aafc4a-39fc-4b5c-8a42-487d486cd58f';

-- TEST profile photo (header, feed, comments): the same stock photo. Not Masha;
-- replace it in the cabinet («Профіль» → фото) with her real one.
update public.profiles
set avatar_url = 'https://images.unsplash.com/photo-1569925444984-9e2e5fc3d1fb?w=800&h=1000&fit=crop&crop=faces&auto=format&q=70'
where id = '88aafc4a-39fc-4b5c-8a42-487d486cd58f';
