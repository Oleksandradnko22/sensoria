# Аудит дублей: ProgramPreviewModal / ProgramsCatalogPage / CourseCard

2026-10-07. Сравнивался реальный код, а не вид экранов. Код не менялся.
Файлы: `components/ProgramPreviewModal.tsx` (1395 строк), `components/ProgramsCatalogPage.tsx` (551),
`components/CourseCard.tsx` (271, карточка каталога), для сверки — `pages/LibraryHomePage.tsx`,
`components/GuidesCatalogPage.tsx`, `components/participant/ProgramExperience.tsx`, `lib/programProgress.ts`.

## A. Подтверждённые дубли

1. **Правило «модуль пройден»** (все обязательные уроки решены, обязательных ≥ 1).
   - `lib/programProgress.ts → isModuleDone` (читает localStorage, вызывается из `ProgramPreviewModal` ~833).
   - `ProgramExperience.tsx → moduleDone` (по состоянию `progress`).
   Одно и то же правило записано дважды.
   Так же дублируется «модуль заблокирован»: `isModuleLocked` (lib) и `moduleLocked` (ProgramExperience) — оба вызывают `isItemLocked(modules, progress, mi, 0)`.
2. **Метка «Безкоштовно / цена»** — шесть реализаций:
   `CourseCard` (два места: бейдж и текст), `ProgramPreviewModal` ~1074, `LibraryHomePage.coursePrice` / `guideMeta`, `GuidesCatalogPage` ~676, `ParticipantBilling`.
3. **Проверка «бесплатно»** записана по-разному: `price === "0"` (CourseCard, LibraryHomePage) и `Number(price) === 0` (ProgramPreviewModal, фильтр каталога). Результаты расходятся на пустой цене `""` и на `"0.00"`.
4. **Тип `Program`** описан отдельно в `ProgramsCatalogPage` (комментарий в файле прямо говорит «держим в соответствии с App.tsx»), в `App.tsx` и неявно в `CourseCard` (`program: any`).
5. **Метка «N уроків • длительность»**: сборка строки в `ProgramPreviewModal` (две ветки для демо и реального контента) повторяет шаблон из `lib/publicContent` (`moduleWord`) и из карточек в `ParticipantLearning` (склонение уже вынесено в `pluralUk`).

## B. Похожее, но намеренно разное

- **Цена «₴» против «грн».** `CourseCard`: «1500 грн». `ProgramPreviewModal`, `LibraryHomePage`: «1500₴». Это видимый пользователю текст, а не кодовый дубль — менять нельзя без решения по копирайту.
- **Список категорий каталога** (`categories`: «Вигорання») и `data/categoryLabels` («Виснаження» для того же тега `burnout`): тот же тег, разные подписи. Сейчас это видимое расхождение; объединять нельзя без решения, какая подпись верна.
- **«Ваш шлях»**: в модальном окне это просто список строк по модулям без статусов (`DisplayModule`), в плеере — интерактивный `ProgramModulesPath`. Разная структура данных, разное поведение.
- **Откуда берётся прогресс**: окно читает серверный `content_progress` для сводки («Ваш прогрес») и одновременно localStorage через `isModuleDone`. Это два источника в одном окне. Разное намеренно или историческое — вопрос к тебе, не к рефакторингу.
- **Фильтры цены и сортировки** в `ProgramsCatalogPage` и `GuidesCatalogPage` внешне близки, но работают с разными типами и разными подписями («Безкоштовно / До 1000₴» против диапазонов). Не объединять.

## C. Рекомендуемые общие куски

1. **`isModuleResolved(modules, progress, moduleIndex)` + `isModuleLockedByProgress(...)`** — чистые функции в `lib/contentProgress.ts`. Их используют `ProgramExperience`, а `lib/programProgress.isModuleDone/Locked` остаются тонкими обёртками (читают storage, вызывают чистую функцию). Риск низкий, поведение проверяется тестами.
2. **`isFreePrice(price)` + `formatPrice(price)`** в одном месте с единым правилом «бесплатно» (`Number(price) === 0`, как в большинстве мест). Сам символ валюты («₴» / «грн») остаётся как есть на каждом экране до твоего решения.
3. **Общий тип `Program`** (экспортируется один раз, `CourseCard` перестаёт быть `any`).

## D. Остаётся локальным

- Вся вёрстка `ProgramPreviewModal` и `CourseCard` (разные макеты, разное поведение).
- Фильтры, сортировки, пагинация «Показати ще» в `ProgramsCatalogPage`.
- Нормализация демо/реальных модулей (`DisplayModule`) — она нужна только окну.
- Блоки отзывов, «Написати автору», «Ваш прогрес» внутри окна.

## Что НЕ делать

Не объединять `ProgramPreviewModal` и `ProgramsCatalogPage` в общие «ProgramCard / ProgramMeta» компоненты: заголовок, автор, длительность, цена и теги есть у обоих, но подача, макет и поведение разные.
