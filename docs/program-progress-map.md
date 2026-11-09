# Карта прогресса в ProgramExperience (до выноса `useProgramProgress`)

Составлена 2026-10-07 перед шагом 4 рефакторинга. Только описание текущего
поведения; код не менялся. Номера строк — по `ProgramExperience.tsx` на этот день.

## 1. Единственный источник правды

`progress: ItemProgressMap` (`useState`, ~243) — карта `itemId → not_started | in_progress | completed | skipped`.
Начальное значение: `getItemProgress(session?.id, programId, false)` из localStorage
(`allowSeed=false`: настоящий участник стартует с пустого, не с демо-данных).
Всё остальное (`summary`, `nextRef`, `moduleDone`, замки) — производное от `progress` и `modules`.

## 2. Все места, где прогресс МЕНЯЕТСЯ

| # | Где | Что делает | Через что |
|---|-----|-----------|-----------|
| 1 | `openAt(ref)` ~675 | Если урок `not_started` → `in_progress`. Никогда не понижает `completed`. | `markItemStatus` → `persistProgress` |
| 2 | `completeCurrentItem()` ~830 | Урок → `completed`; `setJustCompletedItem(true)`; если `computeProgress(next).isCompleted` → `setView("completed")` | `markItemStatus` → `persistProgress` |
| 3 | кнопка «Не зараз» (предупреждение о контенте) ~1600 | Урок → `skipped`, затем `goNext()` | `markItemStatus` → `persistProgress` |
| 4 | эффект слияния с сервером ~263 | `setProgress(current => merge(current, server))` | `mergeProgress` (берёт больший статус) |

Все пути 1–3 идут через `persistProgress(next)` (~252): `setProgress(next)`; если есть
`session.id` → `setItemProgress` (localStorage, мгновенно) + `pushServerProgress` (Supabase,
fire-and-forget). Без `session.id` прогресс живёт только в памяти.

## 3. Что читает прогресс (производное)

- `summary = useMemo(computeProgress(modules, progress))` (~346): `percent`, `state`, `isCompleted`, `currentModuleIndex`, `totalModules`.
- `nextRef = getNextItem(modules, progress)` (~709; `null`, если `summary.isCompleted`).
- `isLocked`, `moduleLocked` (`isItemLocked`), `moduleDone`, `moduleRequired`, `moduleCompletedCount`, `doneModulesCount`, `doneItemsCount`, `totalItemsCount`, `investedMinutes` (~720–765).
- `isDone` в экране урока (~1551): `progress[currentItem.id] === "completed"`.
- Отчёт о завершении (~2445) и `modulesSnapshot` (~801): статус каждого урока.
- Список «Ваш шлях» (`ProgramModulesPath`): `progress`, `nextRef`, `isLocked`, `moduleDone`…

## 4. Что зависит от ТЕКУЩЕГО урока (`openItem`)

`openItem` — отдельный `useState<FlatItemRef | null>`; **не** часть прогресса.
- `currentModule`, `currentItem` (~851).
- `completeCurrentItem` / `goNext` / `goPrev` используют `openItem.itemId` + `flat`.
- Кнопки «Завершити» / «Далі» показываются по `justCompletedItem` и `isDone`.
- `openAt` ставит `openItem`, `justCompletedItem=false`, `view="item"`.
- Эффект сброса по уроку (~570) зависит от `[openItem?.itemId, session?.id]`, но прогресс **не трогает**.
  Он сбрасывает UI-черновики (видео, отзыв, рефлексия) и грузит данные урока.

## 5. Эффекты, которые читают / пишут прогресс

1. Слияние с сервером `[programId, session.id]` (~263): читает сервер, **пишет** в `progress`, localStorage и сервер. Один раз на (программа, человек).
2. Эффект записи отчёта `recordProgramCompletion` (~781): читает `summary.isCompleted`, `progress`, `doneModulesCount` и др. Запускается при `isCompleted === true`; защищён `completionSnapshotChecked` / `completionSnapshot`, чтобы не дублировать запись.
3. Эффект рекомендации гайда (~552): читает `summary?.isCompleted`.
4. Загрузка счётчиков практик/рефлексий — прогресс не читает.

## 6. Синхронизация localStorage ↔ сервер

- Запись: localStorage сразу, сервер без ожидания и без показа ошибки (`pushServerProgress` fire-and-forget).
- Чтение: localStorage при монтировании, сервер один раз в эффекте; слияние «больший статус побеждает» (`lib/mergeProgress.ts`, есть тесты).
- В функции-апдейтере `setProgress(current => …)` внутри эффекта слияния есть побочные эффекты (`setItemProgress`, `pushServerProgress`). В StrictMode (dev) апдейтер вызывается дважды → две записи на сервер. Безвредно, но при выносе нужно сохранить результат, а не форму.

## 7. Зависимости «завершить → следующий»

1. `completeCurrentItem` считает `computeProgress(modules, next)` по **новой** карте (а не по `summary`, который ещё старый) и сразу переключает `view` на `completed`.
2. Эффект записи отчёта срабатывает уже на следующем рендере, когда `summary.isCompleted` стал `true`.
3. «Следующий урок» = `flat[pos+1]` (`goNext`), либо `overview`, если последний. Замки (`isItemLocked`) учитываются только в списке модулей и в `nextRef`, не в `goNext`.

## 8. Риски выноса

- Замыкание: `persistProgress(markItemStatus(progress, …))` берёт `progress` из рендера. Два вызова в одном обработчике без промежуточного рендера (например `openAt` → `completeCurrentItem`) дали бы потерю первого. Сейчас такого вызова нет; хук должен сохранить это свойство (или перейти на функциональный апдейт без изменения результата).
- `openAt` смешивает навигацию (`setOpenItem`, `setView`) и прогресс (`in_progress`). В хук идёт только прогресс; навигация остаётся в экране.
- `completeCurrentItem` смешивает прогресс, `justCompletedItem` и `view`. В хук — вычисление `next` и признак «программа стала завершённой»; переключение `view` остаётся в экране.

## 9. План выноса (после тестов)

Чистая логика (в `utils/`, без `supabaseClient`), покрываем тестами ДО замены:
- `applyOpen(progress, itemId)` → новая карта (`in_progress` только из `not_started`; `completed`/`skipped` не трогает).
- `applyComplete(progress, itemId, modules)` → `{ next, becameCompleted }`.
- `applySkip(progress, itemId)` → новая карта.
- `shouldPersistMerge(current, server)` → `merged | null` (null, если слияние ничего не меняет).

Затем `useProgramProgress({ programId, userId, modules })` возвращает `{ progress, summary, markOpened, markCompleted, markSkipped }` и содержит `persistProgress` + эффект слияния. Единый источник правды и порядок записи (localStorage → сервер) не меняются.
