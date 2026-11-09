// DEV-ONLY visual preview of the author profile's creator layer, for
// looking at the design before author-posts-migration.sql is applied.
// Active only with `npm run dev` AND `?authorPreview=1` in the URL; never
// in a production build, never reads or writes the database. All text
// below is sample copy, clearly marked in the UI.
import { guides } from "../data/guides.ts";
import { meditations } from "../data/meditations.ts";
import type { AuthorPost, PostComment } from "../lib/authorPosts.ts";
import { parseVideoUrl, resolveAttachment } from "../utils/authorPosts.ts";

function swatch(a: string, b: string, label: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='900' height='600'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs><rect width='900' height='600' fill='url(#g)'/><text x='50%' y='52%' text-anchor='middle' font-family='sans-serif' font-size='36' fill='white' fill-opacity='0.8'>${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function isAuthorPreview(): boolean {
  try {
    if (!import.meta.env.DEV) return false;
    // Remembered for the tab: the app may rewrite the URL (login, page
    // changes) and drop the query string. `?authorPreview=0` turns it off.
    const param = new URLSearchParams(window.location.search).get("authorPreview");
    if (param === "0") sessionStorage.removeItem("sensoria.authorPreview");
    else if (param !== null) sessionStorage.setItem("sensoria.authorPreview", "1");
    return sessionStorage.getItem("sensoria.authorPreview") === "1";
  } catch {
    return false;
  }
}

// Design preview only: the same test video as in the preview feed, shown as
// the «Відео-знайомство» block when the profile has no video of its own.
// test stock portrait (Unsplash License, Ayo Ogunseinde) — design preview only
export const PREVIEW_PORTRAIT = "https://images.unsplash.com/photo-1569925444984-9e2e5fc3d1fb?w=800&h=1000&fit=crop&crop=faces&auto=format&q=70";

export const PREVIEW_STORY_MEDIA = {
  kind: "video" as const,
  url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
  caption: "",
  duration: "1:24",
};

export const PREVIEW_DETAILS = {
  positioning:
    "Допомагаю краще розуміти емоційні реакції та знаходити практичні способи підтримати себе.",
  approach:
    "Я не обіцяю швидких рішень. Ми разом дивимося, що відбувається з вашим станом, і підбираємо невеликі практики, які можна повторювати щодня — без тиску й самокритики.",
  bio: "Працюю з темою стресу та внутрішньої напруги. Створюю короткі практики й тексти, до яких зручно повертатися в складні моменти.",
  topics: ["stress", "awareness", "emotionalBalance"],
  coverType: "abstract",
  coverVariant: "calm-02",
  coverImageUrl: null,
};

export const PREVIEW_AUDIENCE = { followers: 1248, participants: 326 };

export const PREVIEW_REVIEWS = [
  { id: "pr1", rating: 5, text: "Дуже спокійний і зрозумілий стиль. Практики справді працюють, коли думки йдуть по колу. Після двох тижнів я помітила, що вечорами стало легше заспокоїтися.", createdAt: "2026-09-20T10:00:00Z", reviewerName: "Олена К.", authorReply: "Дякую вам за теплі слова! Радію, що вечірні практики працюють. Якщо захочете, наступним кроком спробуйте короткий гайд про засинання.", authorReplyAt: "2026-09-21T09:30:00Z" },
  { id: "pr2", rating: 4, text: "Подобається, що без тиску. Хотілося б більше коротких вправ.", createdAt: "2026-09-02T10:00:00Z", reviewerName: "Ірина М." },
  { id: "pr3", rating: 5, text: "Матеріали допомогли по-новому подивитися на свої емоції. Особливо сподобалися прості техніки, які легко застосовувати в повсякденному житті. Рекомендую!", createdAt: "2026-08-14T10:00:00Z", reviewerName: "Андрій Т." },
  { id: "pr4", rating: 5, text: "Вперше відчула, що мене не оцінюють. Дякую за уважність і теплий тон.", createdAt: "2026-07-27T10:00:00Z", reviewerName: "Марія Д." },
  { id: "pr5", rating: 3, text: "Корисно, але частина вправ була для мене завеликою за часом. Хотілося б більше гнучкості.", createdAt: "2026-06-11T10:00:00Z", reviewerName: "Софія Л." },
];

function att(kind: "guide" | "meditation" | "program", id: string) {
  if (kind === "meditation") {
    const m = meditations.find((x) => x.id === id);
    return resolveAttachment(kind, id, m ? { title: m.title, detail: `${m.durationMinutes} хв` } : null);
  }
  if (kind === "guide") {
    const g = guides.find((x) => x.id === id);
    return resolveAttachment(kind, id, g ? { title: g.title } : null);
  }
  return resolveAttachment(kind, id, null);
}

export function previewPosts(authorId: string): { pinned: AuthorPost; posts: AuthorPost[] } {
  const med = meditations[0];
  const guide = guides[0];
  const base = { authorId, updatedAt: null, isPinned: false, images: [] as string[], video: null, isShare: false, imageAlt: "" };
  const posts: AuthorPost[] = [
      {
      ...base,
      id: "pv-pinned",
      isPinned: true,
      body:
        "З чого почати знайомство з моєю роботою\n\nЯ пишу про те, як помічати власний стан і дбати про себе без перфекціонізму. Якщо ви тут уперше — почніть із короткої практики заземлення, а потім повертайтеся сюди за поясненнями.",
      contentId: med?.id ?? null,
      contentKind: med ? "meditation" : null,
      createdAt: "2026-09-10T09:00:00Z",
      attachment: med ? att("meditation", med.id) : null,
      stats: { likeCount: 24, commentCount: 2, liked: false },
    },
      {
        ...base,
        id: "pv-1",
        body:
          "Чому ми довго думаємо про одну й ту саму ситуацію\n\nКоли мозок вважає, що проблему ще не розв’язано, він повертається до неї знову й знову. Це не слабкість — це спроба вас захистити. Допомагає не боротьба з думками, а маленький крок: назвати, що саме турбує, і вирішити, що з цим можна зробити сьогодні.",
        contentId: guide?.id ?? null,
        contentKind: guide ? "guide" : null,
        createdAt: "2026-10-02T08:30:00Z",
        attachment: guide ? att("guide", guide.id) : null,
        stats: { likeCount: 12, commentCount: 1, liked: true },
      },
      {
        ...base,
        id: "pv-photos",
        body: "Мій ранковий ритуал\n\nКілька кадрів із простору, де я починаю день: тиша, чай і п’ять хвилин без телефону.",
        contentId: null,
        contentKind: null,
        createdAt: "2026-09-29T07:30:00Z",
        attachment: null,
        images: [swatch("#c7d2fe", "#a78bfa", "Фото 1"), swatch("#fde68a", "#fca5a5", "Фото 2"), swatch("#99f6e4", "#93c5fd", "Фото 3")],
        stats: { likeCount: 8, commentCount: 0, liked: false },
      },
      {
        ...base,
        id: "pv-video",
        body: "Дихання 4-6: коротке пояснення\n\nЯк працює подовжений видих і чому він заспокоює.",
        contentId: null,
        contentKind: null,
        createdAt: "2026-09-27T10:00:00Z",
        attachment: null,
        video: parseVideoUrl("https://www.youtube.com/watch?v=aqz-KE-bpKQ"),
        stats: { likeCount: 5, commentCount: 0, liked: false },
      },
      {
        ...base,
        id: "pv-share",
        body: "Раджу цю практику всім, хто шукає короткий спосіб заспокоїтись перед сном.",
        contentId: med?.id ?? null,
        contentKind: med ? "meditation" : null,
        isShare: true,
        createdAt: "2026-09-26T20:00:00Z",
        attachment: med ? att("meditation", med.id) : null,
        stats: { likeCount: 2, commentCount: 0, liked: false },
      },
      {
        ...base,
        id: "pv-2",
        body: "Невелике нагадування на сьогодні: втома — це теж інформація. Спробуйте не виправдовуватися перед собою, а просто помітити її.",
        contentId: null,
        contentKind: null,
        createdAt: "2026-09-25T18:00:00Z",
        attachment: null,
        stats: { likeCount: 0, commentCount: 0, liked: false },
      },
      {
        ...base,
        id: "pv-3",
        body:
          "Про практику, якої вже немає\n\nІноді матеріал, який я рекомендувала, знімається з публікації. Допис залишається, а посилання показує, що матеріал недоступний.",
        contentId: "00000000-0000-4000-8000-000000000000",
        contentKind: "program",
        createdAt: "2026-09-12T12:00:00Z",
        attachment: att("program", "00000000-0000-4000-8000-000000000000"),
        stats: { likeCount: 3, commentCount: 0, liked: false },
      },
  ];
  const sorted = posts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { pinned: sorted.find((p) => p.isPinned)!, posts: sorted.filter((p) => !p.isPinned) };
}

export function previewComments(postId: string, authorId: string): PostComment[] {
  if (postId !== "pv-pinned" && postId !== "pv-1") return [];
  const c = (o: Partial<PostComment> & Pick<PostComment, "id" | "userId" | "authorName" | "body" | "createdAt">): PostComment => ({
    postId,
    parentId: null,
    avatarUrl: null,
    updatedAt: null,
    isAuthor: false,
    ...o,
  });
  return postId === "pv-1"
    ? [
        c({ id: "pc1", userId: "u1", authorName: "Олена К.", body: "Дуже відгукується. А як зупинити коло думок ввечері?", createdAt: "2026-10-02T12:00:00Z" }),
        c({ id: "pc2", userId: authorId, parentId: "pc1", authorName: "Маша Прикладна", isAuthor: true, body: "Дякую за запитання! Спробуйте записати думку на папері й залишити її до ранку — це дає мозку сигнал, що її не загублено.", createdAt: "2026-10-02T14:00:00Z" }),
      ]
    : [
        c({ id: "pc3", userId: "u2", authorName: "Ірина М.", body: "Гарний початок, дякую.", createdAt: "2026-09-11T09:00:00Z" }),
        c({ id: "pc4", userId: "u3", authorName: "Наталя Р.", body: "Практика заземлення допомогла вже з першого разу.", createdAt: "2026-09-14T09:00:00Z" }),
      ];
}

// ---- DEV-ONLY: the «Про мене» tab at its minimum and maximum fill ----------
// `?storyFill=min` — every required block at its minimum (STORY_MIN).
// `?storyFill=max` — every field filled to its character limit, all lists full.
// `?storyFill=0` turns it off. Replaces the story in the browser only; nothing
// is written anywhere. Not active in a production build.
import { EMPTY_STORY, STORY_LIMITS as SL, STORY_MIN as SM, type AuthorStory } from "../utils/authorStory.ts";

export function storyFillMode(): "min" | "max" | null {
  try {
    if (!import.meta.env.DEV) return null;
    const param = new URLSearchParams(window.location.search).get("storyFill");
    if (param === "0") sessionStorage.removeItem("sensoria.storyFill");
    else if (param === "min" || param === "max") sessionStorage.setItem("sensoria.storyFill", param);
    const v = sessionStorage.getItem("sensoria.storyFill");
    return v === "min" || v === "max" ? v : null;
  } catch {
    return null;
  }
}

const SAMPLE =
  "Я прийшла в цю сферу, коли помітила, як багато людей живуть у постійній напрузі й не мають слів для свого стану. Спершу я шукала відповіді для себе, а згодом почала ділитися тим, що справді допомагало мені та людям поруч. У роботі мені важливо не поспішати й помічати вже наявне. ";
// sample text of at most `n` characters: starts at a whole word, ends at a whole word (≥ n-12 characters)
const WORDS = SAMPLE.trim().split(" ");
const fit = (n: number, offset = 0) => {
  let i = offset % WORDS.length;
  let out = "";
  for (let k = 0; k < 400; k++, i = (i + 1) % WORDS.length) {
    const next = out ? `${out} ${WORDS[i]}` : WORDS[i];
    if (next.length > n) break;
    out = next;
  }
  return out;
};

export function fillStory(mode: "min" | "max", base: AuthorStory): AuthorStory {
  const clean = { ...EMPTY_STORY, hidden: { ...EMPTY_STORY.hidden }, portraitUrl: base.portraitUrl };
  if (mode === "min") {
    // every required block at its minimum (a whole-word text of just over the minimum length)
    const lo = (min: number, off = 0) => fit(min + 14, off);
    return {
      ...clean,
      intro: lo(SM.intro),
      viewpoint: lo(SM.viewpoint, 11),
      viewpointNote: lo(SM.viewpointNote, 23),
      steps: Array.from({ length: SM.steps }, (_, i) => ({ title: lo(SM.stepTitle, i * 9), text: lo(SM.stepText, i * 17 + 5), icon: "" })),
      principles: Array.from({ length: SM.principles }, (_, i) => lo(SM.principle, i * 13 + 2)),
      principleIcons: Array.from({ length: SM.principles }, () => ""),
      offers: Array.from({ length: SM.offers }, (_, i) => lo(SM.offer, i * 11 + 4)),
      offerIcons: Array.from({ length: SM.offers }, () => ""),
      notOffers: Array.from({ length: SM.notOffers }, (_, i) => lo(SM.notOffer, i * 7 + 9)),
      faq: Array.from({ length: SM.faq }, (_, i) => ({ q: lo(SM.faqQ, i * 5 + 1), a: lo(SM.faqA, i * 19 + 3) })),
      media: PREVIEW_STORY_MEDIA,
    };
  }
  const icons = ["sprout", "search", "sparkles", "flag", "clock", "check"];
  const stepIcons = ["moon", "compass", "lightbulb", "wind", "heart", "target"];
  return {
    ...clean,
    tagline: fit(SL.tagline, 7),
    intro: `${fit(Math.floor(SL.intro / 2) - 1)}\n\n${fit(Math.ceil(SL.intro / 2) - 1, 40)}`,
    viewpoint: fit(SL.viewpoint, 11),
    viewpointNote: fit(SL.viewpointNote, 23),
    steps: Array.from({ length: SL.steps }, (_, i) => ({ title: fit(SL.stepTitle, i * 9), text: fit(SL.stepText, i * 17 + 5), icon: stepIcons[i] ?? icons[i] })),
    principles: Array.from({ length: SL.principles }, (_, i) => fit(SL.principle, i * 13 + 2)),
    principleIcons: ["shield", "user", "feather", "sun"],
    offers: Array.from({ length: SL.limits }, (_, i) => fit(SL.limit, i * 11 + 4)),
    offerIcons: ["clock", "message", "book", "headphones"],
    notOffers: Array.from({ length: SL.limits }, (_, i) => fit(SL.limit, i * 7 + 9)),
    faq: Array.from({ length: SL.faq }, (_, i) => ({ q: fit(SL.faqQ, i * 5 + 1), a: fit(SL.faqA, i * 19 + 3) })),
    media: PREVIEW_STORY_MEDIA,
  };
}

// ---- DEV-ONLY: the «Освіта та досвід» tab at its minimum and maximum fill ----
// `?eduFill=min` — every (required) field filled, each at about its minimum length.
// `?eduFill=max` — every field at its limit with realistic example text close to each limit, 6 direction tags,
// document pictures, 2 entries per group. `?eduFill=0` turns it off. Browser-only, nothing is saved.
import { composeExperienceText, type AuthorCredential, type AuthorExperience } from "../utils/authorCredentials.ts";

export function eduFillMode(): "min" | "max" | null {
  try {
    if (!import.meta.env.DEV) return null;
    const param = new URLSearchParams(window.location.search).get("eduFill");
    if (param === "0") sessionStorage.removeItem("sensoria.eduFill");
    else if (param === "min" || param === "max") sessionStorage.setItem("sensoria.eduFill", param);
    const v = sessionStorage.getItem("sensoria.eduFill");
    return v === "min" || v === "max" ? v : null;
  } catch {
    return null;
  }
}

// Realistic example records for the «maximum» preview (each field close to its limit).
const MAX_CREDENTIALS = [
  { kind: "education", degree: "master", year: 2014, title: "Магістр психології, спеціалізація «Практична психологія та консультування»",
    issuer: "Київський національний університет імені Тараса Шевченка, факультет психології",
    description: "Спеціалізація з практичної психології: індивідуальне консультування, групова робота, основи кризового втручання, психодіагностика та психологічна підтримка.",
    doc: "diploma-master" },
  { kind: "education", degree: "bachelor", year: 2012, title: "Бакалавр психології, напрям «Психологія», диплом з відзнакою",
    issuer: "Київський національний університет імені Тараса Шевченка, факультет психології, денна форма навчання",
    description: "Загальна та вікова психологія, психологія особистості, основи психодіагностики й консультування, педагогічна практика в школі та центрі підтримки.",
    doc: "diploma-bachelor" },
  { kind: "training", degree: null, year: 2023, title: "Навички емоційної регуляції: практичний курс для психологів і фасилітаторів груп",
    issuer: "Школа практичної психології та емоційного інтелекту «Баланс»",
    description: "Курс на 72 години: техніки заземлення, робота з тривогою та стресом, проведення групових практик, супервізія власних кейсів, розбір сесій і письмові завдання.",
    doc: "course-regulation" },
  { kind: "training", degree: null, year: 2020, title: "Робота зі стресом і вигоранням: базовий курс для фахівців допомагаючих професій і волонтерів",
    issuer: "Український інститут когнітивно-поведінкової терапії",
    description: "Базовий онлайн-курс: природа стресу, ознаки професійного вигорання, прості практики відновлення, стратегії підтримки клієнтів і колег та план самодопомоги.",
    doc: "course-stress" },
  { kind: "certificate", degree: null, year: 2021, title: "Практики уважності та зниження стресу (MBSR): сертифікований 8-тижневий курс з викладачем",
    issuer: "Центр практик уважності та усвідомленого життя, Київ",
    description: "Восьмитижнева програма MBSR: медитація, м'які практики з тілом, робота з думками й емоціями, щоденна практика, день тиші та підсумкове заняття з викладачем.",
    doc: "cert-mindfulness" },
  { kind: "certificate", degree: null, year: 2022, title: "Сертифікований фасилітатор груп емоційної підтримки (ліцензована програма, 120 годин)",
    issuer: "Асоціація практикуючих психологів і фасилітаторів України",
    description: "Підготовка до ведення груп підтримки: безпечна структура зустрічі, правила групи, робота з сильними емоціями, етика й межі ролі ведучого, практика з наставником",
    doc: "cert-facilitator" },
] as const;
const MAX_EXPERIENCE = [
  { startYear: 2019, endYear: null, role: "Психологиня-консультантка, ведуча групових практик емоційної регуляції",
    organization: "Центр психологічної підтримки «Ресурс», відділення для дорослих, підлітків та сімей з дітьми",
    text: "Індивідуальні консультації та групові практики з емоційної регуляції. Супровід клієнтів у темах стресу, тривоги й самоцінності, розробка коротких практик для самостійної роботи між сесіями, ведення груп підтримки та супервізія колег-початківців щомісяця.",
    areas: ["Індивідуальні консультації", "Групові практики", "Емоційна регуляція", "Робота з тривогою", "Стрес і вигорання", "Супровід між сесіями"] },
  { startYear: 2016, endYear: 2019, role: "Авторка онлайн-курсів з емоційного благополуччя та самопідтримки",
    organization: "Освітня платформа «Баланс», напрям психологічного здоров'я та емоційного благополуччя",
    text: "Розробка та проведення онлайн-курсів з емоційного благополуччя, створення практичних інструментів для самопідтримки: щоденників, відео- та аудіопрактик, чек-листів і коротких вправ. Підтримка учасників у чаті, збір відгуків і щорічне оновлення програм курсів.",
    areas: ["Онлайн-курси", "Практичні інструменти", "Аудіопрактики", "Щоденники самоспостереження", "Підтримка учасників", "Методичні матеріали"] },
  { startYear: 2014, endYear: 2016, role: "Психологиня-консультантка у клініці психічного здоров'я",
    organization: "Клініка психічного здоров'я «Довіра», відділення денного стаціонару",
    text: "Проведення індивідуальних консультацій, робота з тривожними станами та емоційним вигоранням, психоосвіта для клієнтів та їхніх близьких, участь у міждисциплінарних зустрічах команди, ведення документації та регулярна супервізія складних випадків.",
    areas: ["Тривожні стани", "Емоційне вигорання", "Психоосвіта", "Робота з близькими", "Командні зустрічі", "Супервізія"] },
  { startYear: 2012, endYear: 2014, role: "Практична психологія: індивідуальна й групова робота з підлітками та дорослими",
    organization: "Освітній центр «Розвиток», психологічна служба",
    text: "Психологічний супровід підлітків і дорослих, проведення групових зустрічей та тренінгів з розвитку емоційного інтелекту, консультування батьків щодо спілкування й підтримки дітей, підготовка інформаційних матеріалів та проведення відкритих лекцій.",
    areas: ["Робота з підлітками", "Тренінги", "Емоційний інтелект", "Консультування батьків", "Групові зустрічі", "Діагностика"] },
] as const;

export function fillBackground(mode: "min" | "max"): { credentials: AuthorCredential[]; experience: AuthorExperience[] } {
  if (mode === "min") {
    // EVERYTHING is required, so the minimum is: every field filled, each at (about) its shortest length —
    // title 10, institution 2, description 30, a year, the document picture; role 5, organisation 2,
    // start/end years, work description 60, TWO main areas
    const min = (id: string, kind: AuthorCredential["kind"], title: string, doc: string): AuthorCredential => ({
      id, kind, degree: null, title, issuer: "КНУ", year: 2020, description: "Практична психологія та терапія", imageUrl: `/demo-docs/${doc}.svg`, isPublic: true,
    });
    return {
      credentials: [
        min("f-c1", "education", "Магістр ІТ", "diploma-master"),
        min("f-c2", "training", "Основи UX/UI", "course-regulation"),
        min("f-c3", "certificate", "Основи UX/UI", "cert-mindfulness"),
      ],
      experience: [{ id: "f-e1", organization: "ГО", role: "Тренер", description: composeExperienceText("Індивідуальні консультації, групові практики та супровід клієнтів.", ["Сон", "Стрес"]), startYear: 2020, endYear: 2022, isCurrent: false, isPublic: true }],
    };
  }
  // every field close to its limit, with realistic example text
  return {
    credentials: MAX_CREDENTIALS.map((c, i): AuthorCredential => ({
      id: `f-c${i}`, kind: c.kind, degree: c.degree, title: c.title, issuer: c.issuer, year: c.year, description: c.description, imageUrl: `/demo-docs/${c.doc}.svg`, isPublic: true,
    })),
    experience: MAX_EXPERIENCE.map((e, i): AuthorExperience => ({
      id: `f-e${i}`, organization: e.organization, role: e.role, description: composeExperienceText(e.text, [...e.areas]),
      startYear: e.startYear, endYear: e.endYear, isCurrent: e.endYear === null, isPublic: true,
    })),
  };
}
