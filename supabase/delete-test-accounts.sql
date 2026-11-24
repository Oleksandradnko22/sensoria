-- ВИДАЛЕННЯ ВСІХ ТЕСТОВИХ АКАУНТІВ, КРІМ АДМІНІСТРАТОРА (24.11.2026, на прохання власниці).
-- НЕЗВОРОТНО: акаунти, їхні профілі, матеріали, покупки, повідомлення, відгуки, нотатки — видаляються назавжди.
-- Лишаються: акаунти з is_admin = true (ваш). Фінансові записи тестових оплат (журнал, акти, чеки) не мають зв'язку
-- з акаунтами й лишаються в базі — це тестовий режим, на облік не впливає.
--
-- КРОК 1 — подивитися, що буде видалено (запустіть окремо й перевірте список):
--   select p.email, p.role, p.name, p.is_admin from public.profiles p order by p.is_admin desc, p.role, p.email;
--   select count(*) as буде_видалено from auth.users u where u.id not in (select id from public.profiles where is_admin);
--
-- КРОК 2 — видалення (весь блок нижче одним запуском):
begin;

-- захист від випадкового запуску без адміністратора: якщо адміна немає — нічого не робимо
do $$ begin
  if not exists (select 1 from public.profiles where is_admin) then
    raise exception 'Не знайдено жодного адміністратора — видалення скасовано.';
  end if;
end $$;

-- таблиці, що забороняють видалення профілю (закриті акаунти, каса автора): спершу їхні рядки
delete from public.closed_participants where profile_id not in (select id from public.profiles where is_admin);
delete from public.closed_authors where profile_id not in (select id from public.profiles where is_admin);
delete from public.author_fiscal where author_id not in (select id from public.profiles where is_admin);

-- матеріали, які «купували» в тесті, захищені від видалення — на час цієї транзакції захист вимкнено
alter table public.content disable trigger protect_sold_content_trg;
alter table public.content disable trigger content_keep_if_acquired_trg;

-- покупки й посилання на матеріали тестових авторів (зокрема ваші тестові покупки) — інакше матеріал не видаляється
delete from public.purchases where content_id in (select id from public.content where author_id not in (select id from public.profiles where is_admin));
update public.content_items set material_id = null where material_id in (select id from public.content where author_id not in (select id from public.profiles where is_admin));

delete from auth.users where id not in (select id from public.profiles where is_admin);

alter table public.content enable trigger protect_sold_content_trg;
alter table public.content enable trigger content_keep_if_acquired_trg;

-- підключення ФОП тестових авторів (без зв'язку з акаунтом) і заявки з анкети
delete from public.author_mono_receivers where author_id not in (select id from public.profiles where is_admin);
delete from public.author_applications;

commit;

-- КРОК 3 — перевірка: має лишитися лише ваш акаунт
--   select email, role, is_admin from public.profiles;
