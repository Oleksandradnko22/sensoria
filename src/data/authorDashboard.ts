// Mock data for the author cabinet (src/pages/AuthorDashboardPage.tsx and
// src/components/author/*). This is a client-only prototype with no
// backend, so everything here is realistic placeholder data for one demo
// author — Андрій Коваленко, who already authors real content in
// programs.ts ("stress-course") and guides.ts ("panic-sos"). Extending
// his catalog with a few more mock items (a draft, an in-review guide)
// lets every dashboard section — including the ones with no real backing
// data yet (participants, revenue, reviews) — have something coherent to
// render, without inventing a disconnected fictional author.
//
// 2026-09-29 (per Sasha — "залиш тільки одну медитацію, решту видали
// повністю"): removed the mock "grounding-5min" / "5 хвилин на землю"
// meditation that used to live here — it was a second, entirely
// unrelated demo meditation shown only in the author cabinet's own
// content list/stats, separate from the real participant-facing catalog
// in data/meditations.ts (which already has exactly one real meditation,
// "quick-grounding"). Removing it means every "meditation" anywhere in
// the app — participant catalog and author cabinet alike — now traces
// back to that same single real entry.
//
// Terminology: the people taking programs/meditations/guides are called
// "учасники" (participants) everywhere in this platform, not "студенти"
// (students) — this isn't a school, and "клієнти" (clients) would wrongly
// imply a direct therapy relationship. Naming (types, fields, exports)
// follows that throughout, not just the UI copy.

// Same union as ContentItem["type"] (src/data/contentTypes.ts) — kept
// as its own local import rather than redefined, since content_items
// (the real table this now maps to) uses the exact same vocabulary.
import type { ContentItemType, PracticeSpec } from "./contentTypes.ts";

export type SaleStatus = "published" | "complaint_pending" | "unlisted" | "restored" | "suspended_debt";
export type ContentStatus = "published" | "draft" | "review" | "archived";
export type ContentType = "program" | "meditation" | "guide";

// One real, individually-editable lesson inside a module — see
// supabase/schema.sql's content_items table. Mirrors ContentItem
// closely (same field names/shape), but every field here is something
// the author actually fills in through AuthorCourseEditor, whereas
// ContentItem also carries the participant-facing `id` (assigned by
// the database on save, not chosen by the author).
export type AuthoredItem = {
  // Present once saved to a real content_items row; absent for a lesson
  // just added in the editor and not yet persisted.
  id?: string;
  title: string;
  type: ContentItemType;
  isRequired: boolean;
  body?: string;
  videoUrl?: string;
  // See ContentItem["transcript"] in contentTypes.ts — author-pasted
  // text, not auto-generated.
  transcript?: string;
  // See ContentItem["contentWarning"] in contentTypes.ts.
  contentWarning?: string;
  audioUrl?: string;
  // See ContentItem["imageUrl"] in contentTypes.ts — a standalone image
  // (e.g. a diagram, a photo for a grounding exercise), uploaded via
  // Supabase Storage same as fileUrl below, not a YouTube link.
  imageUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileSizeLabel?: string;
  checklist?: string[];
  durationMinutes?: number;
  // "Спробуйте зараз" — see PracticeSpec's own header comment.
  practice?: PracticeSpec;
  // Gift lesson: the author's own meditation / guide given free to everyone who bought the program.
  materialId?: string;
};

export type AuthoredModule = {
  // Present once saved to a real content_modules row; absent for a
  // module just added in the editor and not yet persisted — same
  // convention as AuthoredItem["id"] above. Preserving this across
  // saves (see lib/content.ts's saveContent) is what keeps every
  // participant-facing table keyed by module_id (content_module_mood_checkins)
  // or by the item ids nested under it (bookmarks, progress, saved
  // practices, reflections, mood check-ins, practice answers, warning
  // acks) from silently orphaning every time the author edits and
  // re-saves the course.
  id?: string;
  title: string;
  lessons: number;
  duration: string;
  // Practice-lesson video for this module — a YouTube (unlisted) link,
  // not an uploaded file (see docs/roadmap-to-production.md's
  // free-tier addendum for why: video hosting has no genuinely free
  // self-hosted option, YouTube unlisted does).
  videoUrl?: string;
  // Supplementary PDF/photo — this one IS a real uploaded file, via
  // Supabase Storage (src/lib/storage.ts).
  materialsUrl?: string;
  // Real per-lesson content within this module (content_items) —
  // optional and defaults to empty: a module can still exist with just
  // its bare `lessons` count and no authored items yet, same as before
  // this field existed.
  items?: AuthoredItem[];
};

export type AuthoredContent = {
  id: string;
  type: ContentType;
  title: string;
  description?: string;
  status: ContentStatus;
  /** Sale state set by complaints/admin; not editable by the author. */
  saleStatus?: SaleStatus;
  /** High-risk topics the author declared (utils/riskTopics.ts). */
  riskTopics?: string[];
  price: string;
  participants: number;
  revenue: number;
  rating: number | null;
  reviewsCount: number;
  createdAt: string;
  updatedAt: string;
  modules?: AuthoredModule[];
  // Real uploads (Supabase Storage) — cover is an image; mainFileUrl is
  // the guide's PDF or the meditation's audio file, depending on type.
  coverUrl?: string;
  // Point of the cover that stays visible in every crop (utils/coverFocus.ts); needs program-page-migration.sql.
  coverFocus?: import("../utils/coverFocus.ts").CoverFocus;
  introVideoUrl?: string;
  // Program wizard: the step the author stopped on (needs draft-step-migration.sql).
  draftStep?: number;
  // false = never published (needs draft-delete-migration.sql); undefined = unknown, so no deleting is offered.
  everPublished?: boolean;
  mainFileUrl?: string;
  /** Guide only: blocks built in the guide builder (data/guideContent.ts). Empty = a plain PDF guide. */
  guideBlocks?: import("./guideContent.ts").GuideContent;
  // Emotional-topic categories (categoryLabels.ts keys) — same
  // vocabulary the public catalog's filter chips use. Without this, a
  // published item is only ever found under "Всі", never under a
  // specific filter like "Стрес".
  tags?: string[];
  /** Readable id used by the catalog and every table that points at a guide/meditation (set on first save). */
  slug?: string;
  /** Meditation only: length in minutes (the catalog shows it and filters by it). */
  durationMinutes?: number;
  /** Meditation only: what the recording is and the text of the practice. */
  meditation?: AuthoredMeditation;
  /** Guide only: facts shown on the card and the page. */
  guide?: AuthoredGuide;
};

export type AuthoredGuide = {
  guideType: "quick" | "practical" | "deep" | "sos" | "workbook";
  pages: number;
  readMinutes: number;
  relevantIf: string[];
  outcomes: string[];
  /** Kept as stored so editing a structured Sensoria guide never turns it into a PDF one. */
  source?: "uploaded_pdf" | "sensoria_structured";
  /** The author lets readers download the guide (a PDF file, or the PDF version of an interactive guide). Missing = allowed. */
  allowDownload?: boolean;
};

export type AuthoredMeditation = {
  format: "guided" | "minimal" | "silent";
  hasEmbeddedMusic: boolean;
  offlineDownloadEnabled: boolean;
  whenToUse: string[];
  transcript?: { text: string; status: "draft" | "confirmed"; confirmedBy?: string; confirmedAt?: string };
};

export const authorProfile = {
  name: "Андрій Коваленко",
  title: "Психолог, спеціаліст з роботи зі стресом і тривожністю",
  avatarInitials: "АК",
  bio: "Практикую 9 років, працюю з тривожними станами, вигоранням і стресом. Автор програми «Робота зі стресом» на Sensoria.",
  verified: true,
  credentials: "Магістр психології, КПТ-терапевт, сертифікат УСП",
  socialLinks: {
    site: "andriikovalenko.example",
    instagram: "@andrii.psy",
  },
  memberSince: "2024-03-12",
};

export const authoredContent: AuthoredContent[] = [
  {
    id: "stress-course",
    type: "program",
    title: "Робота зі стресом",
    status: "published",
    price: "1500",
    participants: 540,
    revenue: 689_250,
    rating: 4.9,
    reviewsCount: 128,
    createdAt: "2024-04-02",
    updatedAt: "2026-06-18",
    modules: [
      { title: "Природа стресу", lessons: 4, duration: "40 хв" },
      { title: "Техніки стабілізації", lessons: 5, duration: "55 хв" },
      { title: "Робота з емоціями", lessons: 6, duration: "1 год 10 хв" },
    ],
  },
  {
    id: "panic-sos",
    type: "guide",
    title: "SOS при панічних атаках",
    status: "published",
    price: "290",
    participants: 312,
    revenue: 76_908,
    rating: 4.8,
    reviewsCount: 54,
    createdAt: "2024-05-20",
    updatedAt: "2026-05-02",
  },
  {
    id: "burnout-course-draft",
    type: "program",
    title: "Вихід із вигорання",
    status: "draft",
    price: "1800",
    participants: 0,
    revenue: 0,
    rating: null,
    reviewsCount: 0,
    createdAt: "2026-07-30",
    updatedAt: "2026-08-10",
    modules: [
      { title: "Розпізнати вигорання", lessons: 3, duration: "30 хв" },
      { title: "Відновлення ресурсу", lessons: 4, duration: "45 хв" },
    ],
  },
  {
    id: "night-anxiety-guide",
    type: "guide",
    title: "Нічна тривога: що робити",
    status: "review",
    price: "190",
    participants: 0,
    revenue: 0,
    rating: null,
    reviewsCount: 0,
    createdAt: "2026-08-05",
    updatedAt: "2026-08-09",
  },
];

export type ParticipantSegment = "new" | "active" | "inactive";

export type ParticipantProgress = {
  id: string;
  name: string;
  email: string;
  contentId: string;
  progressPercent: number;
  lastActive: string;
  enrolledAt: string;
  segment: ParticipantSegment;
  certificateIssued: boolean;
};

export const participants: ParticipantProgress[] = [
  {
    id: "s1",
    name: "Олена Гуменюк",
    email: "olena.h@example.com",
    contentId: "stress-course",
    progressPercent: 100,
    lastActive: "2026-08-10",
    enrolledAt: "2026-05-01",
    segment: "active",
    certificateIssued: true,
  },
  {
    id: "s2",
    name: "Тарас Мельник",
    email: "taras.m@example.com",
    contentId: "stress-course",
    progressPercent: 60,
    lastActive: "2026-08-09",
    enrolledAt: "2026-06-14",
    segment: "active",
    certificateIssued: false,
  },
  {
    id: "s3",
    name: "Юлія Бондаренко",
    email: "yulia.b@example.com",
    contentId: "stress-course",
    progressPercent: 15,
    lastActive: "2026-07-02",
    enrolledAt: "2026-06-20",
    segment: "inactive",
    certificateIssued: false,
  },
  {
    id: "s4",
    name: "Ірина Ковальська",
    email: "iryna.k@example.com",
    contentId: "panic-sos",
    progressPercent: 100,
    lastActive: "2026-08-08",
    enrolledAt: "2026-07-01",
    segment: "active",
    certificateIssued: false,
  },
  {
    id: "s5",
    name: "Максим Дорошенко",
    email: "maksym.d@example.com",
    contentId: "stress-course",
    progressPercent: 4,
    lastActive: "2026-08-11",
    enrolledAt: "2026-08-10",
    segment: "new",
    certificateIssued: false,
  },
  {
    id: "s6",
    name: "Софія Литвиненко",
    email: "sofia.l@example.com",
    contentId: "grounding-5min",
    progressPercent: 100,
    lastActive: "2026-08-01",
    enrolledAt: "2026-07-20",
    segment: "active",
    certificateIssued: false,
  },
];

export type Transaction = {
  id: string;
  date: string;
  contentId: string;
  participantName: string;
  amount: number;
  status: "completed" | "refunded" | "pending";
};

export const transactions: Transaction[] = [
  { id: "t1", date: "2026-08-10", contentId: "stress-course", participantName: "Максим Дорошенко", amount: 1500, status: "completed" },
  { id: "t2", date: "2026-08-08", contentId: "panic-sos", participantName: "Ірина Ковальська", amount: 290, status: "completed" },
  { id: "t3", date: "2026-08-05", contentId: "stress-course", participantName: "Юлія Бондаренко", amount: 1500, status: "refunded" },
  { id: "t4", date: "2026-08-02", contentId: "stress-course", participantName: "Тарас Мельник", amount: 1500, status: "completed" },
  { id: "t5", date: "2026-07-28", contentId: "panic-sos", participantName: "Олена Гуменюк", amount: 290, status: "completed" },
  { id: "t6", date: "2026-07-21", contentId: "stress-course", participantName: "Олена Гуменюк", amount: 1500, status: "completed" },
];

export type Review = {
  id: string;
  contentId: string;
  participantName: string;
  rating: number;
  text: string;
  date: string;
  reply?: string;
};

export const reviews: Review[] = [
  {
    id: "r1",
    contentId: "stress-course",
    participantName: "Олена Гуменюк",
    rating: 5,
    text: "Дуже практичний курс та сильний автор.",
    date: "2026-07-15",
  },
  {
    id: "r2",
    contentId: "stress-course",
    participantName: "Тарас Мельник",
    rating: 5,
    text: "Після програми стало значно легше справлятися зі стресом.",
    date: "2026-07-02",
    reply:
      "Дякую, дуже приємно це чути! Раджу повертатись до техніки дихання з модуля 2, коли відчуваєте напругу.",
  },
  {
    id: "r3",
    contentId: "panic-sos",
    participantName: "Ірина Ковальська",
    rating: 4,
    text: "Корисний гайд, хотілось би трохи більше прикладів.",
    date: "2026-06-28",
  },
  {
    id: "r4",
    contentId: "grounding-5min",
    participantName: "Софія Литвиненко",
    rating: 5,
    text: "Слухаю щоранку, дуже допомагає почати день спокійніше.",
    date: "2026-07-25",
  },
];

export type Message = {
  id: string;
  from: string;
  contentTitle?: string;
  preview: string;
  date: string;
  unread: boolean;
  // A message the platform's contact-info filter already caught on the
  // way in (see components/author/contactFilter.ts) — shown to the
  // author as evidence the guardrail is active, not as raw contact info.
  blocked?: boolean;
};

export const messages: Message[] = [
  {
    id: "m1",
    from: "Юлія Бондаренко",
    contentTitle: "Робота зі стресом",
    preview: "Підкажіть, будь ласка, чи можна повторно пройти модуль 2?",
    date: "2026-08-11",
    unread: true,
  },
  {
    id: "m2",
    from: "Ірина Ковальська",
    contentTitle: "SOS при панічних атаках",
    preview: "Дякую за гайд, дуже допоміг!",
    date: "2026-08-09",
    unread: false,
  },
  {
    id: "m3",
    from: "Тарас Мельник",
    contentTitle: "Робота зі стресом",
    preview: "Коли з'явиться новий модуль?",
    date: "2026-08-06",
    unread: true,
  },
  {
    id: "m4",
    from: "Максим Дорошенко",
    contentTitle: "Робота зі стресом",
    preview: "Повідомлення приховано: користувач намагався поділитися номером телефону.",
    date: "2026-08-05",
    unread: false,
    blocked: true,
  },
];

export type ActivityEvent = {
  id: string;
  type: "purchase" | "review" | "message" | "moderation";
  text: string;
  date: string;
};

export const recentActivity: ActivityEvent[] = [
  { id: "a1", type: "purchase", text: "Максим Дорошенко придбав «Робота зі стресом»", date: "2026-08-10" },
  { id: "a2", type: "message", text: "Нове повідомлення від Юлії Бондаренко", date: "2026-08-11" },
  { id: "a3", type: "review", text: "Новий відгук на «SOS при панічних атаках» — 4★", date: "2026-06-28" },
  { id: "a4", type: "moderation", text: "«Нічна тривога: що робити» надіслано на модерацію", date: "2026-08-09" },
];

export const analyticsOverview = {
  viewsLast30Days: 4820,
  purchasesLast30Days: 96,
  conversionRate: 0.02,
  completionRateByContent: {
    "stress-course": 0.68,
    "panic-sos": 0.81,
    "grounding-5min": 0.9,
  } as Record<string, number>,
  trafficSources: [
    { source: "Каталог Sensoria", percent: 54 },
    { source: "Пошук на сайті", percent: 21 },
    { source: "Рекомендації після тесту", percent: 17 },
    { source: "Зовнішні посилання", percent: 8 },
  ],
  dropOffByModule: [
    { module: "Природа стресу", completion: 94 },
    { module: "Техніки стабілізації", completion: 78 },
    { module: "Робота з емоціями", completion: 61 },
  ],
};

// Promo codes deduct from the AUTHOR's own earnings, never from the
// platform's commission — the commission is fixed regardless of any
// discount. Every code also needs a declared reason (so the platform's
// managers can see why it exists — e.g. an Instagram collab — instead
// of an unexplained discount), a hard max-uses cap (no more unlimited
// codes), and there's a cap on how many an author can have active at
// once, both to prevent an author from minting large numbers of codes
// to hand out freely.
export const PROMO_REASONS = [
  "Instagram",
  "Друзі/знайомі",
  "Партнерство",
  "Email-розсилка",
  "Інше",
] as const;

export const MAX_ACTIVE_PROMO_CODES = 5;
export const MAX_PROMO_DISCOUNT_PERCENT = 30;

export type PromoCode = {
  code: string;
  discountPercent: number;
  contentId: string | "all";
  uses: number;
  maxUses: number;
  active: boolean;
  expiresAt: string | null;
  reason: (typeof PROMO_REASONS)[number];
};

export const promoCodes: PromoCode[] = [
  {
    code: "STRESS20",
    discountPercent: 20,
    contentId: "stress-course",
    uses: 34,
    maxUses: 100,
    active: true,
    expiresAt: "2026-09-30",
    reason: "Instagram",
  },
  {
    code: "WELCOME10",
    discountPercent: 10,
    contentId: "all",
    uses: 152,
    maxUses: 300,
    active: true,
    expiresAt: null,
    reason: "Email-розсилка",
  },
];

export const payoutSettings = {
  method: "card" as const,
  cardLast4: "4411",
  minPayout: 500,
  // Payouts always land on one of these two fixed dates each month —
  // this is not something an author can choose or move.
  payoutDates: [1, 15],
  nextPayoutDate: "2026-09-01",
  pendingAmount: 4230,
  isRegisteredEntity: true,
  entityType: "ФОП" as "ФОП" | "ТОВ" | null,
  requisites: {
    bankName: "monobank",
    iban: "UA00 0000 0000 0000 0000 0000 000",
    edrpou: "",
  },
};

export const publishChecklist = [
  {
    id: "c1",
    label: "Опис курсу відповідає реальному змісту",
    done: true,
    hint: "Перевірте, що назва, опис і модулі описують саме те, що учасник отримає всередині.",
  },
  {
    id: "c2",
    label: "Немає медичних обіцянок чи гарантій результату",
    done: true,
    hint: "Уникайте формулювань на кшталт «гарантовано вилікує» чи «100% позбавить тривоги».",
  },
  {
    id: "c3",
    label: "Вказано, що курс не замінює психотерапію",
    done: true,
    hint: "Додайте в опис коротке нагадування, що це не замінює роботу з фахівцем.",
  },
  {
    id: "c4",
    label: "Додано контакти підтримки при кризових станах",
    done: false,
    hint: "У описі або першому модулі додайте, куди звернутись, якщо стан гострий чи кризовий.",
  },
  {
    id: "c5",
    label: "Перевірено якість відео/аудіо матеріалів",
    done: false,
    hint: "Переконайтесь, що звук чистий, а відео — не нижче 720p, перед тим як надсилати на модерацію.",
  },
];

export type FaqCategory = {
  id: string;
  label: string;
  description: string;
  items: { q: string; a: string }[];
};

export const authorFaqCategories: FaqCategory[] = [
  {
    id: "moderation",
    label: "Модерація контенту",
    description: "Як проходить перевірка контенту перед публікацією.",
    items: [
      {
        q: "Хто перевіряє новий контент — людина чи автоматично?",
        a: "Спочатку контент перевіряє ШІ-модерація — зазвичай це займає від 30 хвилин до 3 днів. Якщо система не може впевнено ухвалити рішення або на контент надійшло багато скарг, перевірку бере на себе менеджер платформи вручну, і це може зайняти до 7 днів.",
      },
      {
        q: "Чи можу я оновлювати курс після публікації?",
        a: "Так, зміни в контенті не потребують повторної модерації, окрім суттєвих змін структури чи ціни.",
      },
    ],
  },
  {
    id: "finance",
    label: "Виплати та комісія",
    description: "Комісія платформи та графік виплат.",
    items: [
      {
        q: "Яка комісія платформи?",
        a: "Оплата розподіляється в момент покупки: комісія Sensoria — 30% для покупців із каталогу та 15% для покупців, яких ви привели за своїм реферальним посиланням; решта одразу надходить на ваш підтверджений банківський рахунок (ФОП). Комісію банку за приймання платежу (1,3% при оплаті картками України й 2% іноземними) сплачує Sensoria за власний рахунок: з вашої частки вона не утримується, а покупець платить лише ціну матеріалу. Якщо покупцеві повертають кошти, ви повертаєте лише свою частку. Якщо покупцеві повертають кошти, відповідну частину може бути утримано з ваших наступних продажів.",
      },
      {
        q: "Як часто відбуваються виплати?",
        a: "Ви самі виводите кошти на прив'язану картку кнопкою «Вивести кошти» у розділі «Фінанси», коли на балансі є щонайменше 500 ₴. Виплата береться лише з коштів, які вже пройшли 14-денне підтвердження.",
      },
      {
        q: "За чий рахунок діють знижки за промокодами?",
        a: "Знижка списується з вашої винагороди як автора — комісія платформи завжди залишається незмінною.",
      },
    ],
  },
  {
    id: "participants",
    label: "Спілкування з учасниками",
    description: "Правила спілкування та як реагувати на порушення.",
    items: [
      {
        q: "Як відповісти учаснику?",
        a: "У розділі «Повідомлення» — там же вся історія переписки з кожним учасником.",
      },
      {
        q: "Чи можна обмінюватись контактами з учасником?",
        a: "Ні — спілкування відбувається лише через внутрішні повідомлення Sensoria. Обмін особистими контактами (телефон, email, соцмережі) заборонений і фільтрується автоматично.",
      },
      {
        q: "Що робити, якщо учасник порушує правила платформи?",
        a: "Скористайтесь кнопкою «Поскаржитися» біля повідомлення в переписці.",
      },
    ],
  },
  {
    id: "profile",
    label: "Профіль автора",
    description: "Що можна вказати у профілі та як це впливає на довіру учасників.",
    items: [
      {
        q: "Чи можу я вказати сайт чи Instagram у профілі?",
        a: "Так, це допомагає учасникам вам довіряти. Але ці посилання не повинні вести на пряму оплату чи запис поза Sensoria — переведення продажів в обхід платформи порушує угоду з автором і може призвести до блокування акаунту.",
      },
    ],
  },
  {
    id: "account",
    label: "Акаунт та безпека",
    description: "Пароль, email, вхід та видалення акаунту.",
    items: [
      {
        q: "Не можу увійти в акаунт — що робити?",
        a: "Перевірте, чи правильний email і пароль. Заходили раніше через Google? Використовуйте кнопку «Увійти через Google», а не пароль. Якщо пароль забутий — самостійного відновлення поки немає, напишіть у підтримку, ми допоможемо.",
      },
      {
        q: "Як змінити пароль?",
        a: "У розділі «Налаштування» → «Безпека». Для акаунтів через Google спершу потрібно встановити пароль.",
      },
      {
        q: "Як змінити email?",
        a: "У розділі «Налаштування» — на нову адресу прийде лист підтвердження, email зміниться лише після переходу за посиланням.",
      },
      {
        q: "Як увімкнути 2FA?",
        a: "У розділі «Налаштування» → «Безпека» — потрібен застосунок-автентифікатор (Google Authenticator, Authy тощо).",
      },
      {
        q: "Як видалити акаунт?",
        a: "У розділі «Налаштування», внизу сторінки — акаунт можна відновити протягом 14 днів після видалення.",
      },
    ],
  },
];
