-- Маша: ім'я та прізвище в профілі (тепер усюди показується повне ім'я).
-- 1) Заміни ПРІЗВИЩЕ на справжнє (можна змінити й ім'я, напр. «Марія»).
-- 2) Виконай у Supabase → SQL Editor.
do $$
declare
  full_name text := 'Маша ПРІЗВИЩЕ';
begin
  if full_name like '%ПРІЗВИЩЕ%' then
    raise exception 'Спочатку впиши справжнє прізвище у full_name';
  end if;
  update public.profiles
     set name = full_name
   where id = '88aafc4a-39fc-4b5c-8a42-487d486cd58f';
end $$;
