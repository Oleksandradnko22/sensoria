-- ПЕРЕВІРКА ГОТОВНОСТІ ДО ПІДКЛЮЧЕННЯ АВТОРІВ (25.11.2026). Лише читає — нічого не змінює.
-- Запустіть і надішліть результат: кожен рядок має бути «так».
select 'Анкета: поля освіта/досвід/акаунт (author-applications-2.sql)' as перевірка,
       case when exists (select 1 from information_schema.columns where table_schema='public' and table_name='author_applications' and column_name='with_account') then 'так' else 'НІ' end as стан
union all select 'Сповіщення «Нова анкета автора» (author-applications-3.sql)',
       case when pg_get_functiondef('public.admin_alert_on_row'::regproc) like '%чекає схвалення%' then 'так' else 'НІ' end
union all select 'Без схвалення автор не може створити матеріал',
       case when exists (select 1 from pg_trigger where tgname='content_author_approved_guard') then 'так' else 'НІ' end
union all select 'Документи: Умови, Угода, Повернення — 1.3; Оферта, Політика — 1.4',
       case when (select count(*) from public.legal_documents where is_current and version in ('1.3','1.4')) = 5 then 'так' else 'НІ' end
union all select 'Нотатки в адмінці (admin-notes.sql)',
       case when to_regclass('public.admin_notes') is not null then 'так' else 'НІ' end
union all select 'Ваш вхід в адмінку з кодом з телефона налаштовано',
       case when exists (select 1 from auth.mfa_factors f join public.profiles p on p.id=f.user_id where p.is_admin and f.status='verified') then 'так' else 'НІ — налаштуйте на /admin' end
union all select 'Тестові фінанси очищено',
       case when (select count(*) from public.ledger_entries)=0 then 'так' else 'НІ: ' || (select count(*) from public.ledger_entries) || ' записів' end
union all select 'Акаунтів у базі',
       (select count(*)::text from public.profiles);
