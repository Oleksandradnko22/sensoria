-- ОКРЕМИЙ АКАУНТ ЛИШЕ ДЛЯ АДМІНКИ (25.11.2026). Після цього ваш акаунт учасника стає звичайним і в адмінку не пускає.
-- Підготовка: на sensoria.courses зареєструйте новий акаунт з адресою, яку більше ніде не використовуєте
-- (наприклад admin@sensoria.courses — листи прийдуть у sensoriaplatform@gmail.com через пересилання Cloudflare),
-- підтвердіть пошту. Потім замініть дві адреси нижче й запустіть увесь блок.
begin;
-- захист «ніхто не дає собі прав із браузера» пропускає лише службовий доступ — у цій транзакції він службовий
set local request.jwt.claim.role = 'service_role';
do $$
declare new_id uuid; old_id uuid;
begin
  select id into new_id from public.profiles where lower(email) = lower('admin@sensoria.courses');
  select id into old_id from public.profiles where lower(email) = lower('aleksandra.dnko@gmail.com');
  if new_id is null then raise exception 'Новий акаунт не знайдено — спершу зареєструйте його й підтвердіть пошту.'; end if;
  if old_id is null then raise exception 'Поточний акаунт не знайдено — перевірте адресу.'; end if;
  update public.profiles set is_admin = true, admin_role = 'owner' where id = new_id;
  update public.profiles set is_admin = false, admin_role = null where id = old_id;
end $$;
commit;
-- Перевірка: має бути один рядок — нова адреса.
--   select email, is_admin from public.profiles where is_admin;
