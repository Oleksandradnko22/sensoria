-- Фікс для "new row violates row-level security policy" на
-- guide_saved_for_later. Таблиця вже існує (інакше була б інша
-- помилка), тож найімовірніше при першому запуску міграції сам
-- create policy не застосувався — RLS лишився увімкненим без жодної
-- політики, а це означає "заборонено все й усім". Безпечно виконати
-- поверх попередньої міграції.

alter table public.guide_saved_for_later enable row level security;

drop policy if exists "users manage their own saved guides" on public.guide_saved_for_later;

create policy "users manage their own saved guides"
  on public.guide_saved_for_later for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Перевірка (необов'язково) — має повернути один рядок:
-- select * from pg_policies where tablename = 'guide_saved_for_later';
