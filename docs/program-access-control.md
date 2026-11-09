# Доступ к платным программам: что сейчас и что нужно (черновик, НЕ применять вслепую)

## Что сейчас (проверено по `supabase/schema.sql`)

| Что | Кто может читать |
|---|---|
| `content`, `content_modules`, `content_items` опубликованной программы | **все**, включая гостя (`status = 'published'`) |
| Поля урока: `video_url`, `audio_url`, `file_url`, `image_url`, `body`, `practice`, `transcript` | **все** (политика на строку, а не на колонки) |
| Файлы в бакете `content-files` (PDF, аудио, картинки) | **все** по прямой ссылке (`public = true`, политика `content files are publicly readable`) |
| Видео уроков | ссылка YouTube (unlisted) хранится открытым текстом |
| Таблица `purchases` | есть, но **нигде не используется для допуска** (оплата не подключена) |

Следствие: оплата ничего не закрывает. Любой, кто знает публичный ключ и id
программы, получает все уроки и файлы платной программы.

Клиентская защита (метки в PDF, ContentShield, `nodownload`) только мешает
случайному копированию. Она не заменяет серверный допуск.

## Целевая модель

1. **Каталог и превью** (названия модулей и уроков, типы, длительности) видны всем.
   Содержимое (`body`, `*_url`, `practice`, `transcript`, `checklist`) только тем,
   у кого есть доступ.
2. **Доступ** имеет: автор, администратор, участник с оплаченной (`completed`)
   покупкой, любой участник для бесплатной программы (`price = 0`).
3. **Файлы** платных программ лежат в **приватном** бакете и отдаются по
   подписанным ссылкам с коротким сроком, которые выдаёт серверная функция после
   проверки доступа.
4. **Видео**: платные уроки нельзя держать на YouTube unlisted. Нужен хостинг с
   привязкой к домену/подписью (Mux, Vimeo, Cloudflare Stream и т.п.).

## Черновик SQL (для обсуждения и проверки на тестовом проекте)

```sql
-- 1. Что считается «есть доступ»
create or replace function public.has_content_access(p_content_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.content c
    where c.id = p_content_id
      and (
        c.author_id = auth.uid()
        or (c.status = 'published' and c.price = 0)
        or exists (
          select 1 from public.purchases p
          where p.content_id = c.id
            and p.participant_id = auth.uid()
            and p.status = 'completed'
        )
        or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin)
      )
  );
$$;

-- 2. Публичное «оглавление» без содержимого
create or replace view public.content_items_outline as
select i.id, i.module_id, i.order_index, i.title, i.type, i.is_required, i.duration_minutes
from public.content_items i
join public.content_modules m on m.id = i.module_id
join public.content c on c.id = m.content_id
where c.status = 'published';
grant select on public.content_items_outline to anon, authenticated;

-- 3. Ограничить саму таблицу уроков
drop policy if exists "items follow their content's visibility" on public.content_items;
create policy "items readable with access"
  on public.content_items for select
  using (
    exists (
      select 1 from public.content_modules m
      where m.id = module_id and public.has_content_access(m.content_id)
    )
  );
```

## Что менять в коде вместе с SQL (иначе приложение сломается)

- `src/lib/publicContent.ts` (каталог, превью): читать оглавление из
  `content_items_outline`, а не из `content_items`.
- `ProgramExperience`: до покупки показывать оглавление и кнопку покупки,
  а не уроки (сейчас читает `content_items` целиком).
- Платёжный поток: запись в `purchases` должна появляться только после
  подтверждения оплаты на сервере (webhook провайдера), не из клиента.
- Приватный бакет и функция выдачи подписанных ссылок (Edge Function, потому
  что проверка идёт по покупкам), перенос существующих файлов, смена путей в
  `file_url`/`audio_url`/`image_url`.
- Решение по видео-хостингу.

## Порядок и риски

1. Сначала платёжный поток (иначе у платных программ не будет покупателей и все
   потеряют доступ, включая тестовых).
2. Затем SQL выше на **тестовом проекте**, прогон: гость, участник без покупки,
   участник с покупкой, автор, администратор.
3. Потом приватный бакет и ссылки.
4. Только после этого применять в продакшене. Откат: вернуть удалённую политику.

Эти шаги меняют доступ ко всему контенту и зависят от платёжной интеграции,
поэтому решение за владельцем продукта, а я их не применяю.
