-- Редакція 1.4 (юрист, 25.11.2026): Політика конфіденційності й оферта для авторів — анкета автора (дані, підстава,
-- строк зберігання) і Telegram-спільнота авторів. Умови, Угода учасника й Правила повернення лишаються 1.3.
-- Реальних користувачів немає — чинна з дня публікації; повторна згода не потрібна. Ідемпотентно.
begin;
update public.legal_documents set is_current = false where is_current and document in ('author_agreement', 'privacy') and version <> '1.4';
insert into public.legal_documents (document, version, text_hash, effective_from, changes_summary, is_current) values ('author_agreement', '1.4', 'b7dc0b3752c99fa36b779112e9d3bb958c01ea0ceeb0e176e9f63c3085bf323f', now(), 'Спільнота авторів у месенджері: повідомлення там не є повідомленнями за Договором; заборона публікувати дані учасників у спільноті', true) on conflict (document, version) do update set text_hash = excluded.text_hash, is_current = true;
insert into public.legal_documents (document, version, text_hash, effective_from, changes_summary, is_current) values ('privacy', '1.4', '0b33c42a87126e91b8d8d135f3d4793cd4549375c94358db2889b6d2ed8da3af', now(), 'Анкета автора: дані, мета, підстава (ст. 11 Закону), строк зберігання; Telegram-спільнота авторів', true) on conflict (document, version) do update set text_hash = excluded.text_hash, is_current = true;
commit;
