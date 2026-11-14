// Mock data for the participant cabinet (src/pages/ParticipantDashboardPage.tsx
// and src/components/participant/*). Same approach as authorDashboard.ts:
// a client-only prototype with no backend, so this is realistic
// placeholder data for one demo participant.
//
// Reused identity, not a new disconnected one: Олена Гуменюк already
// exists on the author side (authorDashboard.ts's `participants`,
// `transactions`, `reviews`) as a real learner of Андрій Коваленко's
// content — same purchases (stress-course, panic-sos), same 5★ review on
// stress-course, same completed progress there. Using her here instead
// of inventing someone new keeps both cabinets tell the same story
// instead of contradicting each other.

import { programs } from "./programs.ts";
import { guides, guideSizeLabel } from "./guides.ts";
import { meditations } from "./meditations.ts";
import type { ReportReason } from "../lib/reports.ts";

export type ContentKind = "program" | "guide" | "meditation";
export type EnrollmentStatus = "in-progress" | "completed";

export type Enrollment = {
  contentId: string;
  kind: ContentKind;
  progressPercent: number;
  status: EnrollmentStatus;
  purchasedAt: string;
  lastAccessedAt: string;
  // For programs, this percentage is only a display fallback where the
  // real engine isn't wired in — the actual module/item position is
  // always computed from lib/programProgress.ts (data/programModules.ts
  // + the per-item progress store), never a hand-typed number here, so
  // there's exactly one source of truth instead of two that can drift.
};

export const participantProfile = {
  name: "Олена Гуменюк",
  email: "olena.h@example.com",
  phone: "+380 67 555 12 34",
  avatarInitials: "ОГ",
  memberSince: "2026-05-01",
};

// Order matters here: ParticipantOverview.tsx's own "next step" picks
// `inProgress[0]`, and "Ваш маршрут" below uses the same convention —
// keeping the same in-progress item first on both pages tells one
// coherent story instead of two dashboards disagreeing about what
// Олена should do next.
export const enrollments: Enrollment[] = [
  {
    contentId: "mindfulness-course",
    kind: "program",
    progressPercent: 67,
    status: "in-progress",
    purchasedAt: "2026-08-01",
    lastAccessedAt: "2026-08-19",
  },
  {
    contentId: "stress-course",
    kind: "program",
    progressPercent: 100,
    status: "completed",
    purchasedAt: "2026-07-21",
    lastAccessedAt: "2026-08-10",
  },
  {
    contentId: "quick-grounding",
    kind: "meditation",
    progressPercent: 40,
    status: "in-progress",
    purchasedAt: "2026-08-05",
    lastAccessedAt: "2026-08-11",
  },
  // 2026-09-29 (per Sasha — "тут оставь тільки одну"): the four other
  // demo guide enrollments that used to sit here (panic-sos,
  // five-things-lower-anxiety, three-questions-after-conflict,
  // calm-mind-before-sleep) were removed along with their guides in
  // data/guides.ts — only "what-to-do-when-anxiety-hits" remains, right
  // below.
  // The "Interactive experience" flagship demo guide (see
  // data/guides.ts's own comment) — enrolled so it's immediately
  // reachable from "Моє навчання" without needing the catalog/
  // recommendations detour.
  {
    contentId: "what-to-do-when-anxiety-hits",
    kind: "guide",
    progressPercent: 0,
    status: "in-progress",
    purchasedAt: "2026-09-09",
    lastAccessedAt: "2026-09-09",
  },
];

// "Збережені" — content someone has bookmarked but not (yet) bought or
// started, per Sasha's original spec ("людина зможе зберігати контент,
// який їй сподобався, навіть якщо вона ще не почала його проходити").
// This array is now permanently empty — kept only as a typed stub so its
// (few) remaining call sites don't need their own special-casing.
//
// Guides stopped reading from it on 2026-09-09, per Sasha's explicit
// request — "сделай возможність самому в кабінеті добавляти в обране і
// убери всі гайди з обраних": a guide's saved state comes from the real
// guide_saved_for_later table (lib/guideSaves.ts).
//
// Programs joined guides on 2026-09-21 (Issue 1 — "Збережені" wasn't a
// real participant action, just this static demo entry): a program's
// saved state comes from the real program_saved_for_later table
// (lib/programSaves.ts).
//
// Meditations were the last holdout — its one entry (`self-support`,
// "Самопідтримка") was the exact cause of Sasha's 2026-09-24 report
// ("как висела Самопідтримка в збережених так і висить"): the real ♡
// "Моя практика" toggle (content_item_saved_practices) could never
// remove it, because ParticipantLearning's "Збережені" tab was still
// reading this hand-typed array instead of the real save state for that
// one kind. Now emptied for the same reason guides/programs were —
// meditation's saved state comes from the real content_item_saved_practices
// rows (lib/savedPractices.ts) via ParticipantLearning's own
// savedMeditationIds, exactly like the other two kinds.
export type SavedItem = { contentId: string; kind: ContentKind };

export const savedContent: SavedItem[] = [];

export type ContentInfo = {
  title: string;
  author: string;
  price: string;
  benefits?: string[];
  modulesCount?: number;
  description?: string;
  tags?: string[];
  // Only ever one of these two is set — a program's "duration" is
  // computed from its real modules (see lib/programProgress.ts), not
  // read from here.
  duration?: string;
  pages?: number;
  // "10 розділів" / "8 сторінок" — see guideSizeLabel in data/guides.ts.
  sizeLabel?: string;
  // Guide only — authored reading-time estimate (see data/guides.ts),
  // used for the "12 сторінок · 5 хв" meta line on the redesigned guide
  // card (2026-09-08, per Sasha's explicit spec).
  readMinutes?: number;
  // Meditation only — the real number behind `duration`'s display
  // string, needed to turn an in-progress meditation's percent into an
  // actual "Зупинено на 7:14" time on the "Моє навчання" card (Sasha's
  // explicit call, 2026-08-28: a percentage reads as judgment there,
  // a real stopped-at timestamp doesn't).
  durationMinutes?: number;
};

// Minimal shape lib/publicContent.ts's PublicProgram already satisfies
// structurally — kept as an inline type here (rather than importing
// PublicProgram itself) so this data-layer file doesn't need to depend
// on lib/publicContent.ts, same reasoning as this file staying
// dependency-light everywhere else.
type RealProgramMeta = {
  title: string;
  author: string;
  price: string;
  description?: string;
  tags?: string[];
};

// Looks the enrolled content up in the real public catalogs
// (programs.ts/guides.ts/meditations.ts) rather than duplicating title/
// author/price here a second time — one source of truth for what a piece
// of content is actually called.
//
// `realProgram` (2026-09-21, real program participation architecture):
// a program id can now legitimately be a REAL authored program (from
// Supabase `content`, resolved in bulk by
// lib/publicContent.ts's fetchProgramsByIds) that has no entry in the
// static demo `programs` array at all — passing its already-fetched
// metadata here lets this function resolve it too, instead of
// returning null and having the card silently disappear (see
// ParticipantLearning.tsx's realProgramMetaById). Optional and
// program-only; every other call site/kind is completely unaffected.
export function getContentInfo(
  contentId: string,
  kind: ContentKind,
  realProgram?: RealProgramMeta | null
): ContentInfo | null {
  if (kind === "program") {
    const p = programs.find((x) => x.id === contentId);
    if (p) {
      return {
        title: p.title,
        author: p.author,
        price: p.price,
        benefits: p.benefits,
        description: p.description,
        tags: p.tags,
      };
    }
    return realProgram
      ? {
          title: realProgram.title,
          author: realProgram.author,
          price: realProgram.price,
          description: realProgram.description,
          tags: realProgram.tags,
        }
      : null;
  }
  if (kind === "guide") {
    const g = guides.find((x) => x.id === contentId);
    return g
      ? {
          title: g.title,
          author: g.author,
          price: g.price,
          description: g.description,
          tags: g.tags,
          pages: g.pages,
          sizeLabel: guideSizeLabel(g),
          readMinutes: g.readMinutes,
        }
      : null;
  }
  const m = meditations.find((x) => x.id === contentId);
  return m
    ? {
        title: m.title,
        author: m.author || "Sensoria",
        price: m.price ?? "0",
        description: m.description,
        tags: m.tags,
        duration: m.duration,
        durationMinutes: m.durationMinutes,
      }
    : null;
}

// "free" is a distinct status from "paid" — a zero-amount item never
// went through a payment at all, so it shouldn't carry the same status
// a real transaction does just because both end up listed in purchase
// history. Keeping this distinction in the data (not just in how the
// UI labels things) matters once real payments/refunds/analytics read
// this field: a free meditation must never count as "paid" revenue.
export type PurchaseStatus = "paid" | "pending" | "unpaid" | "refunded" | "free";

export type PurchaseRecord = {
  id: string;
  contentId: string;
  kind: ContentKind;
  title: string;
  amount: number;
  date: string;
  status: PurchaseStatus;
};

export const purchaseHistory: PurchaseRecord[] = [
  {
    id: "p1",
    contentId: "stress-course",
    kind: "program",
    title: "Робота зі стресом",
    amount: 1500,
    date: "2026-07-21",
    status: "paid",
  },
  {
    id: "p2",
    contentId: "panic-sos",
    kind: "guide",
    title: "SOS при панічних атаках",
    amount: 290,
    date: "2026-07-28",
    status: "paid",
  },
  {
    id: "p3",
    contentId: "quick-grounding",
    kind: "meditation",
    title: "Швидке заземлення",
    amount: 0,
    date: "2026-08-05",
    status: "free",
  },
  // Dated ~a week before "today" specifically so Sasha can test the
  // refund flow end-to-end (only offered within REFUND_WINDOW_DAYS —
  // see utils/refundWindow.ts — so these need to stay recent relative
  // to whenever this is tested; p1/p2 above are already past the
  // 14-day window and won't show the refund button).
  {
    id: "p4",
    contentId: "relationships-course",
    kind: "program",
    title: "Здорові стосунки",
    amount: 1800,
    date: "2026-08-13",
    status: "paid",
  },
  {
    id: "p5",
    contentId: "mindfulness-course",
    kind: "program",
    title: "Усвідомленість у житті",
    amount: 900,
    date: "2026-08-13",
    status: "paid",
  },
];

export type MyReview = {
  id: string;
  contentId: string;
  contentKind: ContentKind;
  authorName: string;
  title: string;
  rating: number;
  text: string;
  date: string;
  authorReply?: string;
};

export const myReviews: MyReview[] = [
  {
    id: "rev1",
    contentId: "stress-course",
    contentKind: "program",
    authorName: "Андрій Коваленко",
    title: "Робота зі стресом",
    rating: 5,
    text: "Дуже практичний курс та сильний автор.",
    date: "2026-07-15",
  },
  {
    id: "rev2",
    contentId: "panic-sos",
    contentKind: "guide",
    authorName: "Андрій Коваленко",
    title: "SOS при панічних атаках",
    rating: 4,
    text: "Корисний гайд, допоміг у важкий момент. Хотілося б трохи більше прикладів.",
    date: "2026-07-30",
  },
];

// "Відгук про автора" — demo entries so Sasha can see how this new
// block looks in ParticipantReviews.tsx before any real author_reviews
// rows exist. Same idea as myReviews above: placeholder data for the
// same demo participant (Олена Гуменюк), not wired to persistence.
export type MyAuthorReview = {
  id: string;
  authorName: string;
  rating: number;
  text: string;
  date: string;
};

export const myAuthorReviews: MyAuthorReview[] = [
  {
    id: "arev1",
    authorName: "Андрій Коваленко",
    rating: 5,
    text: "Дуже уважний і чуйний автор — завжди відповідає на питання й пояснює доступно.",
    date: "2026-07-22",
  },
];

// "Мої скарги" — demo entries for the same reason: lets the filed-
// reports history section render with real-looking content before any
// message_reports rows exist for this account.
export type MyReportDemo = {
  id: string;
  reportedName: string;
  contentTitle: string | null;
  reason: ReportReason;
  details: string | null;
  status: "open" | "reviewed";
  createdAt: string;
  kind?: string;
  reasonLabel?: string;
  deletable?: boolean;
};

export const myReportsDemo: MyReportDemo[] = [
  {
    id: "rep1",
    reportedName: "Олексій Мельник",
    contentTitle: "Медитація для сну",
    reason: "requests_contact_info",
    details: "Попросив написати напряму в Telegram замість спілкування через Sensoria.",
    status: "reviewed",
    createdAt: "2026-08-02T14:30:00.000Z",
  },
  {
    id: "rep2",
    reportedName: "Марина Ткаченко",
    contentTitle: null,
    reason: "inappropriate_behavior",
    details: null,
    status: "open",
    createdAt: "2026-08-14T09:10:00.000Z",
  },
];

export type ParticipantMessage = {
  id: string;
  authorName: string;
  contentTitle: string;
  // Lets "Про цю програму" in ParticipantMessages.tsx actually open the
  // real demo catalog item instead of being decorative-only — same ids
  // already used by `enrollments` above, not invented separately.
  contentId: string;
  contentKind: ContentKind;
  preview: string;
  date: string;
  unread: boolean;
};

export const participantMessages: ParticipantMessage[] = [
  {
    id: "pm1",
    authorName: "Андрій Коваленко",
    contentTitle: "Робота зі стресом",
    contentId: "stress-course",
    contentKind: "program",
    preview:
      "Раді, що курс допоміг! Якщо напруга повертається — почніть з техніки дихання з модуля 2.",
    date: "2026-08-10",
    unread: true,
  },
  {
    id: "pm2",
    authorName: "Андрій Коваленко",
    contentTitle: "SOS при панічних атаках",
    contentId: "panic-sos",
    contentKind: "guide",
    preview: "Дякуємо за відгук! Раді, що гайд був корисним саме тоді, коли треба.",
    date: "2026-07-29",
    unread: false,
  },
];

export type FaqCategory = {
  id: string;
  label: string;
  description: string;
  items: { q: string; a: string }[];
};

export const participantFaqCategories: FaqCategory[] = [
  {
    id: "billing",
    label: "Покупки та оплата",
    description: "Все про оплату, доступ до придбаного та повернення коштів.",
    items: [
      {
        q: "Як оплатити програму?",
        a: "Кнопка «Придбати курс» на сторінці програми — після оплати доступ з'являється одразу в розділі «Моє навчання».",
      },
      {
        q: "Де знайти придбаний контент?",
        a: "У розділі «Моє навчання» — усі ваші програми, гайди й медитації з прогресом по кожній.",
      },
      {
        q: "Чи можу я отримати повернення коштів?",
        a: "Так, протягом 14 днів з моменту покупки, якщо контент не відповідає опису. Форма запиту — у розділі «Оплати», під конкретною покупкою.",
      },
      {
        q: "Що робити, якщо платіж не пройшов?",
        a: "Перевірте розділ «Оплати» — якщо покупка там не з'явилась, кошти не списались. Якщо списання все ж відбулося, а доступу немає — повідомте про проблему нижче.",
      },
      {
        q: "Що робити, якщо я оплатив(-ла), але контент не відкрився?",
        a: "Повідомте про проблему нижче з категорією «Проблема з оплатою» — вкажіть назву програми, ми розберемось.",
      },
    ],
  },
  {
    id: "learning",
    label: "Навчання",
    description: "Як проходити програми та де зберігається прогрес.",
    items: [
      {
        q: "Як почати програму?",
        a: "Відкрийте її в розділі «Моє навчання» — модулі проходяться послідовно, прогрес зберігається автоматично.",
      },
      {
        q: "Де зберігається мій прогрес?",
        a: "На сервері, прив'язаний до акаунту — нічого не втрачається при виході чи зміні пристрою.",
      },
      {
        q: "Чи можу я продовжити навчання з іншого пристрою?",
        a: "Так, достатньо увійти в той самий акаунт — прогрес і придбаний контент завжди з вами.",
      },
      {
        q: "Чи отримую я сертифікат?",
        a: "Ні. Sensoria — психологічна платформа: тут ідеться про ваш стан і підтримку, а не про перевірку знань, тому ми не оцінюємо учасників і не видаємо сертифікатів.",
      },
    ],
  },
  {
    id: "authors",
    label: "Спілкування з авторами",
    description: "Як зв'язатися з автором і на що звертати увагу.",
    items: [
      {
        q: "Як написати автору?",
        a: "Через кнопку «Написати автору» на сторінці програми або розділ «Повідомлення». Спілкування відбувається лише через внутрішні повідомлення Sensoria — обмін особистими контактами (телефон, email, соцмережі) заборонений.",
      },
      {
        q: "Де знайти відповідь автора?",
        a: "У розділі «Повідомлення» — там же зберігається вся історія переписки.",
      },
      {
        q: "Чому автор не відповідає?",
        a: "Автори відповідають у власному темпі, це не миттєва підтримка. Якщо відповіді немає кілька днів, а питання термінове — напишіть у підтримку.",
      },
      {
        q: "Що робити, якщо автор порушує правила платформи?",
        a: "Поскаржтесь на повідомлення прямо в переписці — кнопка «Поскаржитися» біля репліки. Історію своїх скарг видно в «Мої відгуки».",
      },
    ],
  },
  {
    id: "reviews",
    label: "Відгуки",
    description: "Як залишати, змінювати чи видаляти відгуки на програми та авторів.",
    items: [
      {
        q: "Як залишити відгук?",
        a: "На сторінці програми, після проходження — розділ «Оцінити автора» там же.",
      },
      {
        q: "Чи можу я змінити відгук?",
        a: "Так, у розділі «Мої відгуки» — зміни зберігаються одразу, автор побачить оновлену версію.",
      },
      {
        q: "Чи можу я видалити відгук?",
        a: "Так, кнопка видалення є під відгуком у розділі «Мої відгуки».",
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
        a: "У розділі «Профіль» → «Безпека». Для акаунтів через Google спершу потрібно встановити пароль.",
      },
      {
        q: "Як змінити email?",
        a: "У розділі «Профіль» — на нову адресу прийде лист підтвердження, email зміниться лише після переходу за посиланням.",
      },
      {
        q: "Як увімкнути 2FA?",
        a: "У розділі «Профіль» → «Безпека» — потрібен застосунок-автентифікатор (Google Authenticator, Authy тощо).",
      },
      {
        q: "Як видалити акаунт?",
        a: "У розділі «Профіль», внизу сторінки — акаунт можна відновити протягом 14 днів після видалення.",
      },
    ],
  },
];
