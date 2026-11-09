-- ─────────────────────────────────────────────────────────────────────
-- TEST DATA ONLY — to look at «Про автора» (Освіта / Сертифікати / Кейси /
-- Досвід) for Masha. Every title starts with «[demo]». Not real credentials.
--
-- ORDER: 1) run author-credentials-migration.sql  2) run this file.
-- Remove later with the DELETE block at the bottom.
-- ─────────────────────────────────────────────────────────────────────
do $demo$
declare
  a uuid := '88aafc4a-39fc-4b5c-8a42-487d486cd58f'; -- Masha
begin
  insert into public.author_credentials (author_id, kind, title, issuer, issued_year, description, is_public)
  select a, v.kind, v.title, v.issuer, v.yr, v.descr, true
  from (values
    ('education',   '[demo] Магістр психології',              'Університет (приклад)',  2014, 'Практична психологія: індивідуальне консультування, групова робота та психологічна підтримка.'),
    ('education',   '[demo] Бакалавр психології',             'Університет (приклад)',  2012, 'Загальна та вікова психологія, психологія особистості, основи психодіагностики й консультування.'),
    ('certificate', '[demo] Практики уважності (MBSR)',       'Центр уважності (приклад)', 2021, 'Восьмитижнева програма: медитація, м''які практики з тілом і робота з думками та емоціями.'),
    ('certificate', '[demo] Сертифікований фасилітатор груп', 'Асоціація практиків (приклад)', 2022, 'Підготовка до ведення груп підтримки: безпечна структура зустрічі, правила групи й межі ролі ведучого.'),
    ('training',    '[demo] Навички емоційної регуляції',     'Школа практик (приклад)',   2023, 'Практичний курс: техніки заземлення, робота з тривогою та стресом, проведення групових практик.'),
    ('training',    '[demo] Робота зі стресом: базовий курс', 'Школа практик (приклад)',   2020, 'Базовий онлайн-курс: ознаки вигорання, прості практики відновлення та стратегії підтримки клієнтів.')
  ) as v(kind, title, issuer, yr, descr)
  where not exists (select 1 from public.author_credentials c where c.author_id = a and c.title = v.title);

  insert into public.author_experience (author_id, organization, role, description, start_year, end_year, is_current, is_public)
  select a, v.org, v.role, v.descr, v.s, v.e, v.cur, true
  from (values
    ('[demo] Центр підтримки (приклад)', 'Психологиня', E'Індивідуальні консультації, групові практики та програми з емоційної регуляції. Супровід у темах стресу, тривоги та самоцінності.\n- Індивідуальні консультації\n- Групові практики\n- Емоційна регуляція\n- Тривога і стрес\n- Супровід клієнтів між сесіями', 2019, null::int, true),
    ('[demo] Освітня платформа (приклад)', 'Авторка курсів', E'Розробка та проведення онлайн-курсів з емоційного благополуччя. Створення практичних інструментів для самопідтримки.\n- Розробка курсів\n- Практичні інструменти\n- Онлайн-формати\n- Підтримка учасників', 2016, 2019, false)
  ) as v(org, role, descr, s, e, cur)
  where not exists (select 1 from public.author_experience x where x.author_id = a and x.organization = v.org);

  -- earlier runs created the credential rows with short or empty descriptions: set the new ones
  update public.author_credentials c set description = v.descr
  from (values
    ('[demo] Магістр психології', 'Практична психологія: індивідуальне консультування, групова робота та психологічна підтримка.'),
    ('[demo] Бакалавр психології', 'Загальна та вікова психологія, психологія особистості, основи психодіагностики й консультування.'),
    ('[demo] Практики уважності (MBSR)', 'Восьмитижнева програма: медитація, м''які практики з тілом і робота з думками та емоціями.'),
    ('[demo] Сертифікований фасилітатор груп', 'Підготовка до ведення груп підтримки: безпечна структура зустрічі, правила групи й межі ролі ведучого.'),
    ('[demo] Навички емоційної регуляції', 'Практичний курс: техніки заземлення, робота з тривогою та стресом, проведення групових практик.'),
    ('[demo] Робота зі стресом: базовий курс', 'Базовий онлайн-курс: ознаки вигорання, прості практики відновлення та стратегії підтримки клієнтів.')
  ) as v(title, descr)
  where c.author_id = a and c.title = v.title;

  -- earlier runs created these rows with a one-line description: set the 3 points
  update public.author_experience set description = E'Індивідуальні консультації, групові практики та програми з емоційної регуляції. Супровід у темах стресу, тривоги та самоцінності.\n- Індивідуальні консультації\n- Групові практики\n- Емоційна регуляція\n- Тривога і стрес\n- Супровід клієнтів між сесіями'
    where author_id = a and organization = '[demo] Центр підтримки (приклад)';
  update public.author_experience set description = E'Розробка та проведення онлайн-курсів з емоційного благополуччя. Створення практичних інструментів для самопідтримки.\n- Розробка курсів\n- Практичні інструменти\n- Онлайн-формати\n- Підтримка учасників'
    where author_id = a and organization = '[demo] Освітня платформа (приклад)';

  -- three demo cases (minimum / medium / maximum text), no «[demo]» prefix. Needs author-cases-details-migration.sql.
  delete from public.author_cases where author_id = a and title = '[demo] Напруга після роботи';
  insert into public.author_cases (author_id, title, situation, approach, details, is_public)
  select a, v.title, v.sit, v.appr, v.det, true
  from (values
    ('Тривога перед виступами',
     'Людина відчувала сильну тривогу перед публічними виступами.',
     'Дихальні вправи та поступове привчання до виступів.',
     '{"topic": "anxiety"}'::jsonb),
    ('Напруга після робочого дня',
     'Людина не могла «вимкнутися» ввечері й довго не засинала. Думки про робочі завдання поверталися навіть уночі.',
     'Коротка вечірня практика, щоб помітити свій стан, і гайд із невеликими кроками на кожен день.',
     '{"topic": "stress", "summary": "Приклад роботи з напругою, яка не минала після завершення робочого дня.", "focus": "Повернулися відчуття опори та поступово знизився внутрішній тиск.", "changes": "Засинання стало спокійнішим, а вечори — більш відновлювальними.", "tags": ["стрес", "відновлення", "сон"]}'::jsonb),
    ('Вигорання після кількох років безперервної роботи в команді підтримки, де постійно не вистачало ресурсів, часу та людей для всіх завдань',
     'Людина прокидалася виснаженою навіть після вихідних і більше не відчувала радості від справи, яку колись любила. Вона дратувалася на колег, відкладала прості завдання й боялася, що це вже не минеться. Їй було важко визнати, що потрібна допомога, бо вона звикла бути тією, на кого можна покластися. Вечорами вона відчувала порожнечу, а вночі прокручувала в голові робочі розмови й сумнівалася, чи варто взагалі продовжувати працювати за цим фахом. Усе це поступово впливало на стосунки вдома: вона рідше розмовляла з рідними й швидко втомлювалася від спілкування.',
     'Короткі практики відновлення вранці та ввечері, щоб вчасно помічати стан тіла й емоцій. Чіткі межі робочого часу та вимкнені робочі сповіщення у вихідні. Підтримка від близьких, регулярний відпочинок без почуття провини й поступове повернення до справ, які приносять задоволення. Також допомогли гайд про відновлення після виснаження, медитації для засинання та щоденник маленьких перемог, у якому людина фіксувала навіть незначні кроки й бачила власний прогрес. Окремо допомогло розділити задачі на ті, що справді важливі, і ті, що лише здаються терміновими, і поступово відпускати другі, не відчуваючи провини за це. Додатково людина щотижня планувала один вечір лише для себе, без обов’язків і обіцянок, і поступово навчилася не порушувати цю домовленість.',
     '{"topic": "burnout", "summary": "Приклад роботи з виснаженням, яке накопичувалося роками й поступово забрало інтерес до улюбленої справи, а також почуття власної ефективності.", "focus": "Відновлення сил, повернення відчуття межі між роботою та відпочинком, м’який перегляд власних очікувань і повернення інтересу до справи, розвиток дбайливого ставлення до себе, не вимагаючи від себе швидких результатів і ідеальності. Важливо було зберегти те, що в роботі справді цінне для людини.", "context": "Людина кілька років працювала в команді, де постійно не вистачало ресурсів. Вихідні йшли на відповіді в робочих чатах, відпустки скорочувалися або переносилися. Виснаження накопичувалося непомітно, а першими змінами стали постійна втома, дратівливість і дедалі частіші думки про звільнення. Поступово зникло відчуття, що її зусилля щось змінюють для інших людей і для всієї команди, і навіть успіхи більше не тішили. Вона перестала планувати щось наперед і жила від одного терміну до іншого.", "process": "Ми зустрічалися раз на тиждень. Спочатку просто описували звичайний робочий день і шукали місця, де сили витікали непомітно. Потім вводили маленькі зміни: перерви між завданнями, чіткий час завершення роботи, один вихідний без повідомлень. Людина вела короткі нотатки про свій стан, і ми разом помічали закономірності. Кожні кілька тижнів переглядали, що працює, а що ні, і змінювали план без поспіху та самокритики. Окремо обговорювали, як просити допомоги в команди й відмовляти без почуття провини. Іноді просто мовчки перевіряли, чи залишилися сили на завтра, і це теж було частиною роботи.", "changes": "Людина почала помічати втому раніше й вчасно зупинялася. Вихідні знову стали вихідними, а до роботи повернулося спокійніше ставлення без постійного відчуття провини. Вона домовилася з командою про розподіл навантаження й знову знайшла час на заняття, які раніше приносили їй задоволення. Вона відновила прогулянки й краще спала.", "useful": "Втома накопичується непомітно, тому корисно раніше помічати перші сигнали: роздратування, байдужість, постійне бажання відкласти справи. Маленькі стабільні кроки часто працюють краще за різкі зміни, а прохання про підтримку не є слабкістю. Відновлення рідко буває рівним, і тимчасові відкати не означають, що все зроблено даремно. Важливо давати собі час і говорити про свій стан вголос.", "tags": ["вигорання", "межі", "відновлення"]}'::jsonb)
  ) as v(title, sit, appr, det)
  where not exists (select 1 from public.author_cases k where k.author_id = a and k.title = v.title);
end
$demo$;

-- Example document pictures (drawn samples, served from public/demo-docs; not real diplomas).
-- Run AFTER the insert above:
update public.author_credentials set image_url = '/demo-docs/diploma-master.svg'     where title = '[demo] Магістр психології';
update public.author_credentials set image_url = '/demo-docs/diploma-bachelor.svg'   where title = '[demo] Бакалавр психології';
update public.author_credentials set image_url = '/demo-docs/course-regulation.svg'  where title = '[demo] Навички емоційної регуляції';
update public.author_credentials set image_url = '/demo-docs/course-stress.svg'      where title = '[demo] Робота зі стресом: базовий курс';
update public.author_credentials set image_url = '/demo-docs/cert-mindfulness.svg'   where title = '[demo] Практики уважності (MBSR)';
update public.author_credentials set image_url = '/demo-docs/cert-facilitator.svg'   where title = '[demo] Сертифікований фасилітатор груп';

-- (after author-credentials-degree-migration.sql) to label the second education row:
--   update public.author_credentials set degree = 'bachelor' where title = '[demo] Бакалавр психології';
-- REMOVE the demo rows:
-- delete from public.author_credentials where title like '[demo]%';
-- delete from public.author_experience  where organization like '[demo]%';
-- delete from public.author_cases       where title in ('Тривога перед виступами', 'Напруга після робочого дня', 'Вигорання після кількох років безперервної роботи в команді підтримки, де постійно не вистачало ресурсів, часу та людей для всіх завдань');


-- «Кейси»: example screenshots of anonymous reviews (drawn samples in public/demo-docs).
-- 1 picture for the minimum case, 2 for the medium one, 3 for the maximum one.
update public.author_cases set details = coalesce(details,'{}'::jsonb) || '{"reviewImages":["/demo-docs/review-1.svg"]}'::jsonb
  where title = 'Тривога перед виступами';
update public.author_cases set details = coalesce(details,'{}'::jsonb) || '{"reviewImages":["/demo-docs/review-1.svg","/demo-docs/review-2.svg"]}'::jsonb
  where title = 'Напруга після робочого дня';
update public.author_cases set details = coalesce(details,'{}'::jsonb) || '{"reviewImages":["/demo-docs/review-1.svg","/demo-docs/review-2.svg","/demo-docs/review-3.svg"]}'::jsonb
  where title like 'Вигорання після кількох років%';

-- «Кейси»: manual order of the demo cases (minimum → medium → maximum).
-- The author sets this with the ↑ ↓ buttons in the cabinet; it lives in details.order.
update public.author_cases set details = coalesce(details,'{}'::jsonb) || '{"order":0}'::jsonb where title = 'Тривога перед виступами';
update public.author_cases set details = coalesce(details,'{}'::jsonb) || '{"order":1}'::jsonb where title = 'Напруга після робочого дня';
update public.author_cases set details = coalesce(details,'{}'::jsonb) || '{"order":2}'::jsonb where title like 'Вигорання після кількох років%';
