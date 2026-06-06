# SENSORIA

## Product Vision

State Selection
→ Assessment
→ Insight
→ Registration
→ Recommendation

Цель:
Помочь пользователю понять своё текущее состояние и получить персональную программу поддержки.

---

## MVP Flow

1. StateSelectionPage
2. TestPage
3. LoadingScreen
4. InsightPage
5. RegisterPage
6. RecommendationPage

---

## Main Stores

### funnelStore

selectedState
answers
insight
recommendation
email

### recommendationStore

activeTags

---

## Main Pages

### StateSelectionPage

Выбор текущего состояния пользователя.

После выбора:
funnelStore.setSelectedState()

---

### TestPage

Основной тест.

Использует:

- QuestionCard
- LoadingScreen
- testUtils

После завершения:

calculateResults()
getTopCategories()

---

### InsightPage

Показывает:

- текущее состояние
- объяснение
- нормализацию
- направление работы

CTA:

Отримати персональний план

---

### RegisterPage

Позиционирование:

Сохранение результата.

Поля:

- Email
- Password

CTA:

Зберегти результат

---

### RecommendationPage

Показывает:

- состояние
- причину
- программу

CTA:

Почати програму

---

## Legacy

Старый flow:

TestIntro
→ Questions
→ Loading
→ ResultsPage

Планируется удалить после завершения нового funnel.

---

## Current Status

✅ StateSelectionPage

✅ InsightPage

✅ RegisterPage

✅ RecommendationPage

✅ funnelStore

🚧 App.tsx migration

🚧 Connect new funnel

🚧 Remove old ResultsPage architecture

---

## Important UX Rules

State Selection:
- CTA появляется только после выбора
- пользователь выбирает состояние, которое беспокоит сильнее всего

Insight:
- не использовать диагностику
- не использовать психиатрию
- создать ощущение "меня поняли"

Registration:
- не использовать слово "регистрация"
- пользователь сохраняет результат

Recommendation:
- показывать только одну программу
- объяснять почему именно она подходит

Эмоциональная последовательность:

Узнавание
↓
Понимание
↓
Облегчение
↓
Доверие
↓
Персональная рекомендация
↓
Действие