// PREVIEW ONLY: five empty guide cards so the catalog can be judged with more than one card. They exist
// only in the development build (see GuidesCatalogPage), have no content behind them, cannot be opened or
// bookmarked, and are not part of the real `guides` list (search, recommendations and the library never see them).
// Delete this file together with its import when real guides are added.
import type { Guide } from "./guides.ts";

const base = { type: "PDF", readMinutes: 0, fileUrl: "", source: "uploaded_pdf" } as const;

export const DEMO_GUIDE_PREFIX = "demo-";

export const demoGuides: Guide[] = [
  {
    ...base,
    id: "demo-morning-reset",
    outcomes: ["Спокійний старт дня без поспіху","Одна головна справа замість довгого списку","Звичку, яку легко повторювати"],
    relevantIf: ["прокидаєтесь із відчуттям напруги","не знаєте, з чого почати день","хочете простий ранковий ритуал"],
    outline: [{title:"Прокидаємось без поспіху",summary:"Три дії для перших п’яти хвилин."},{title:"Тіло й дихання"},{title:"Одна головна справа"},{title:"Вечірній підсумок"}],
    title: "Чек-лист ранкового ресету",
    author: "Марія Шевченко",
    pages: 5,
    price: "0",
    tag: "Популярний",
    publishedAt: "2026-09-12",
    category: "Чек-листи",
    description: "Короткий чек-лист на п’ять хвилин: допомагає м’яко почати день, зменшити внутрішню напругу й обрати одну головну справу.",
    tags: ["stress", "motivation"],
  },
  {
    ...base,
    id: "demo-sos-breathing",
    outcomes: ["Швидкий спосіб вирівняти дихання","Опору в тілі за дві хвилини","Наступний маленький крок"],
    relevantIf: ["відчуваєте, що бракує повітря","тривога наростає просто зараз","потрібна допомога без довгого читання"],
    outline: [{title:"Зупиніться і виділіть хвилину"},{title:"Дихання 4–6"},{title:"Опора на тіло"}],
    title: "SOS: коли бракує повітря",
    author: "Sensoria",
    pages: 2,
    price: "0",
    publishedAt: "2026-10-20",
    category: "Міні-гайди",
    description: "Дві сторінки з простими кроками для моменту, коли тривога накриває найсильніше: дихання, опора на тіло, наступний маленький крок.",
    tags: ["anxiety"],
    guideType: "sos",
  },
  {
    ...base,
    id: "demo-boundaries-workbook",
    outcomes: ["Розуміння, де саме ваші межі","Готові фрази для спокійної відмови","План розмови зі значущою людиною"],
    relevantIf: ["важко сказати «ні»","після розмов лишається провина","втомлюєтесь від чужих очікувань"],
    outline: [{title:"Що таке межі",summary:"Коротко про тілесні, емоційні й часові межі."},{title:"Мої сигнали"},{title:"Вправи на кожен день"},{title:"Підготовка до розмови"},{title:"Підсумок і наступні кроки"}],
    title: "Воркбук: межі у стосунках",
    author: "Андрій Коваленко",
    pages: 24,
    price: "450",
    publishedAt: "2026-08-02",
    category: "Воркбуки",
    description: "Вправи й запитання для самоспостереження: як помічати свої межі, говорити про них спокійно та не відчувати провини за відмову.",
    tags: ["relationships", "selfEsteem"],
  },
  {
    ...base,
    id: "demo-burnout-recovery",
    outcomes: ["Карту власного вигорання","Режим із місцем для відпочинку","План відновлення на чотири тижні"],
    relevantIf: ["відчуваєте постійну втому","байдужість до того, що раніше цікавило","хочете повернути ресурс без різких змін"],
    outline: [{title:"Ознаки вигорання"},{title:"Чому ресурс закінчується"},{title:"Режим дня"},{title:"Робота зі стресом"},{title:"Відпочинок, що відновлює"},{title:"План на чотири тижні"}],
    title: "Відновлення після вигорання: покроковий гайд",
    author: "Марія Шевченко",
    pages: 21,
    price: "1200",
    publishedAt: "2026-07-18",
    category: "PDF-гайди",
    description:
      "Докладний гайд про те, як розпізнати ранні ознаки вигорання, повернути ресурс і побудувати режим, у якому є місце для відпочинку, роботи та ваших власних потреб.",
    tags: ["burnout", "stress"],
  },
  {
    ...base,
    id: "demo-gratitude-journal",
    outcomes: ["Звичку помічати хороше","Легший настрій наприкінці дня","Чотирнадцять заповнених сторінок"],
    relevantIf: ["не помічаєте того, що виходить","хочете м’якше ставитися до себе","шукаєте короткий щоденний ритуал"],
    outline: [{title:"Як користуватися щоденником"},{title:"Дні 1–7"},{title:"Дні 8–14"},{title:"Що змінилось"}],
    title: "Щоденник вдячності на 14 днів",
    author: "Олена Ткачук",
    pages: 14,
    price: "750",
    publishedAt: "2026-10-28",
    category: "Воркбуки",
    description: "Щоденні сторінки з коротким запитанням: допомагають помічати хороше, підтримувати мотивацію та м’якше ставитися до себе.",
    tags: ["motivation", "selfEsteem"],
  },
];

// Demo author and reviews: only the five demo guides above use them (see GuidesPreviewModal).
export const demoGuideAuthor = {
  name: "Марія Шевченко",
  role: "Клінічна психологиня · КПТ-терапевтка",
  since: "з березня 2025",
  bio: "Вісім років працюю з тривогою, стресом і вигоранням. Допомагаю перетворювати складні психологічні ідеї на прості кроки, які можна зробити за п’ять хвилин.",
  approach: "Короткі практичні матеріали без зайвої теорії: кожна вправа перевірена на моїх клієнтах і має зрозумілий результат уже в день використання.",
  specialties: ["Тривожність", "Стрес", "Вигорання", "Самооцінка"],
  stats: [
    { label: "Гайдів", value: "6" },
    { label: "Програм", value: "3" },
    { label: "Читачів", value: "1 240" },
    { label: "Середня оцінка", value: "4,8" },
  ],
};

export const demoGuideCriteria = [
  { label: "Зрозумілість", value: 4.9 },
  { label: "Практичність", value: 4.8 },
  { label: "Допомогло", value: 4.7 },
];

export const demoGuideReviews = [
  { id: "r1", kind: "guide" as const, rating: 5, name: "Олена К.", date: "2026-10-18", text: "Вперше за довгий час вдалося швидко заспокоїтись під час тривоги. Кроки дуже прості, нічого зайвого.", reply: "Дякую, що поділились! Рада, що вправа спрацювала саме в потрібний момент." },
  { id: "r2", kind: "author" as const, rating: 5, name: "Ірина М.", date: "2026-10-02", text: "Авторка пише спокійно і по справі. Видно, що за кожною порадою стоїть практика." },
  { id: "r3", kind: "guide" as const, rating: 4, name: "Катерина Л.", date: "2026-09-21", text: "Сподобалось, що все можна використати в житті одразу. Хотілося б трохи більше прикладів." },
  { id: "r4", kind: "guide" as const, rating: 5, name: "Андрій Т.", date: "2026-09-09", text: "Чек-лист зручний, поставив на телефон і користуюсь щоранку." },
  { id: "r5", kind: "author" as const, rating: 4, name: "Наталія В.", date: "2026-08-27", text: "Приємно, що можна звернутись до авторки з питанням і отримати відповідь." },
  { id: "r6", kind: "guide" as const, rating: 3, name: "Дмитро Р.", date: "2026-08-11", text: "Корисно, але для мене трохи занадто коротко. Для початку підходить." },
];
