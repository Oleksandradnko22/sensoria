-- Редакція 1.2 (правила monobank; юрист, 23.11.2026, «Ю-Б»): оферта для авторів, Правила повернення коштів і Політика
-- конфіденційності. Угода учасника й Умови використання лишаються 1.1. Реальних авторів ще немає — без 14 днів.
-- Опублікувати ДО підписання заяви банку про інформаційне партнерство. Ідемпотентно.
begin;
update public.legal_documents set is_current = false where is_current and document in ('author_agreement', 'refunds', 'privacy');
insert into public.legal_documents (document, version, text_hash, effective_from, changes_summary, is_current) values ('author_agreement', '1.2', '7c5f28192b066f268a6c74d7fc1f26a6519373294a88208233b3bb90d3bc8490', now(), 'Правила monobank: одна платформа-партнер, залишок 600 ₴, поповнення рахунку не пізніше наступного робочого дня, контакти продавця для покупців', true) on conflict (document, version) do update set text_hash = excluded.text_hash, is_current = true;
insert into public.legal_documents (document, version, text_hash, effective_from, changes_summary, is_current) values ('refunds', '1.2', 'f81e86cbebd79f011a4765d9a07fd3c1c60c7c8a4ab5a7ab81dae5b430de9e4a', now(), 'Автор поповнює рахунок для повернення не пізніше наступного робочого дня', true) on conflict (document, version) do update set text_hash = excluded.text_hash, is_current = true;
insert into public.legal_documents (document, version, text_hash, effective_from, changes_summary, is_current) values ('privacy', '1.2', '68cc75ecdeededa836ede180dfa0ebe44a3d4e81cb8d0c3696532e34e312f4e8', now(), 'Контакти автора для звернень покупців (email і телефон) показуються покупцям перед оплатою', true) on conflict (document, version) do update set text_hash = excluded.text_hash, is_current = true;
commit;
