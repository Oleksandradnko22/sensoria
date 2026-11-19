-- ТЕСТ ОПЛАТИ (20.11.2026): справжня платна програма для перевірки оплати в тестовому режимі.
-- «Здорові стосунки» від «Анна Кравчук» у каталозі — демо-вітрина з коду (src/data/programs.ts): її немає в базі,
-- у неї немає продавця, тому купити її неможливо. Цей скрипт створює опубліковану копію в базі від тестового
-- автора «Олександра Тест» (1 800 ₴, тестові оплати йдуть на тестового отримувача monobank і тестову касу Sensoria).
-- Купувати її треба під обліковим записом УЧАСНИКА (власний матеріал автор купити не може).
-- Ідемпотентно: вдруге не створює. Прибрати після тестів — блок «ПРИБРАТИ» внизу.

do $$
declare
  v_author uuid;
  v_content uuid;
begin
  select id into v_author from public.profiles where role = 'author' and name ilike 'Олександра Тест%' order by created_at limit 1;
  if v_author is null then
    raise exception 'Не знайдено автора «Олександра Тест». Вкажіть id тестового автора вручну.';
  end if;
  if exists (select 1 from public.content where author_id = v_author and title = 'Здорові стосунки (тест оплати)') then
    raise notice 'Тестова програма вже є.';
    return;
  end if;
  insert into public.content (author_id, kind, title, description, price, status, tags, ever_published)
  values (
    v_author, 'program', 'Здорові стосунки (тест оплати)',
    'Тестова копія для перевірки оплати: особисті кордони, комунікація без звинувачень і робота з конфліктами.',
    1800, 'published', array['relationships'], true
  )
  returning id into v_content;
  insert into public.content_modules (content_id, order_index, title, lessons, duration_label)
  values (v_content, 0, 'Особисті кордони', 1, '15 хв');
  raise notice 'Створено тестову програму %', v_content;
end $$;

-- ПРИБРАТИ після тестів (не видаляє, а знімає з продажу й публікації):
-- update public.content set status = 'archived' where title = 'Здорові стосунки (тест оплати)';
