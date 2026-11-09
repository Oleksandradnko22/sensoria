// The author's own «Про мене» content. Everything is written by the author;
// nothing is generated or pre-filled. Stored as one jsonb value on
// author_details.story (author-story-migration.sql) — no new tables.
//   Знайомство      photo + intro text (up to 2 paragraphs) — both REQUIRED;
//                   optional heading line (tagline)
//   Відео           one video link (+ duration, caption) OR an audio file
//   Підхід          viewpoint + note, stages, principles   (all optional)
//   Межі            what I offer / what I do not offer     (optional)
//   Особиста історія text + up to four extra photos        (optional)
// Education, certificates and experience live in their own tables
// (author_credentials / author_experience). Hiding a block never deletes
// its content.
import { isStoryIcon } from "./storyIcons.ts";
import { parseVideoUrl } from "./authorPosts.ts";

export type StoryStep = { title: string; text: string; icon?: string }; // icon: storyIcons id, "" = default by position
export type StoryFaq = { q: string; a: string };
export type StoryMedia = { kind: "video" | "audio"; url: string; caption: string; duration: string };
export type AuthorStory = {
  tagline: string;
  intro: string;
  portraitUrl: string;
  viewpoint: string;
  viewpointNote: string;
  steps: StoryStep[];
  principles: string[];
  principleIcons: string[]; // aligned with `principles` (same length), "" = default
  media: StoryMedia | null;
  offers: string[]; // what I offer
  offerIcons: string[]; // aligned with `offers`, "" = default
  notOffers: string[]; // what I do not offer
  personal: string; // personal story
  photos: string[]; // extra real photos (https urls)
  faq: StoryFaq[]; // «Запитання та відповіді», the author's own
  hidden: { viewpoint: boolean; principles: boolean; media: boolean; personal: boolean; faq: boolean };
};

export const STORY_LIMITS = {
  tagline: 80,
  intro: 450,
  introParagraphs: 2,
  viewpoint: 100, // the heading of «Підхід і напрями» (24px bold, ≈2 lines)
  viewpointNote: 260, // the sub-heading under it (16px)
  stepTitle: 40,
  stepText: 160,
  principle: 90,
  principles: 4,
  caption: 180,
  steps: 6,
  limit: 90,
  limits: 4,
  personal: 900,
  photos: 4,
  faq: 6,
  faqQ: 100,
  faqA: 400,
} as const;
const L = STORY_LIMITS;

// What an author must write before the page can be saved: every personalised
// block is required. (Facts from education/experience and the catalogue counts
// are not written here, so they are not part of this.)
export const STORY_MIN = {
  intro: 120,
  viewpoint: 20,
  viewpointNote: 60,
  steps: 3,
  stepTitle: 3,
  stepText: 20,
  principles: 3,
  principle: 8,
  offers: 2,
  offer: 8,
  notOffers: 1,
  notOffer: 8,
  faq: 3,
  faqQ: 10,
  faqA: 40,
} as const;
const M = STORY_MIN;

export const EMPTY_STORY: AuthorStory = {
  tagline: "",
  intro: "",
  portraitUrl: "",
  viewpoint: "",
  viewpointNote: "",
  steps: [],
  principles: [],
  principleIcons: [],
  media: null,
  offers: [],
  offerIcons: [],
  notOffers: [],
  personal: "",
  photos: [],
  faq: [],
  hidden: { viewpoint: false, principles: false, media: false, personal: false, faq: false },
};

// Suggestions only — the editor never inserts them without the author's click.
export const STEP_EXAMPLES: StoryStep[] = [
  { title: "Помітити", text: "Звернути увагу на свій емоційний стан." },
  { title: "Зрозуміти", text: "Дослідити, що може стояти за реакцією." },
  { title: "Спробувати", text: "Обрати невеликий наступний крок." },
];
export const OFFER_EXAMPLES = ["Короткі практики на кілька хвилин", "Пояснення простими словами"];
export const NOT_OFFER_EXAMPLES = ["Не замінюю медичну чи психотерапевтичну допомогу", "Не ставлю діагнозів"];
export const PRINCIPLE_SUGGESTIONS = [
  "Без тиску",
  "Повага до індивідуального темпу",
  "Невеликі кроки замість вимоги змінити все одразу",
  "Уважність до особистого досвіду",
];

// The intro text must never be taller than the portrait next to it (desktop).
// Heights are estimated in "lines": a 16px text line = 1, a 24px heading line
// = 1.4, the gap between paragraphs = 0.6. The portrait + name/role leave room
// for INTRO_MAX_LINES such units.
export const INTRO_MAX_LINES = 8;
const CHARS_PER_LINE = 58; // 16px body text in the text column
const CHARS_PER_HEADING_LINE = 34; // 24px bold heading
export function introLines(tagline: string, intro: string): number {
  const t = tagline.trim();
  const paras = paragraphs(intro);
  const heading = t ? Math.ceil(t.length / CHARS_PER_HEADING_LINE) * 1.4 + 0.6 : 0;
  const body = paras.reduce((n, para) => n + Math.max(1, Math.ceil(para.length / CHARS_PER_LINE)), 0);
  const gaps = Math.max(0, paras.length - 1) * 0.6;
  return Math.round((heading + body + gaps) * 10) / 10;
}

// Paragraphs are separated by a blank line; the intro keeps at most two.
export function paragraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const httpsUrl = (u: string) => /^https:\/\/[^\s]+$/i.test(u);

// text lines and their icons live in two aligned arrays; blank lines are dropped together with their icon
function zipItems<A extends string, B extends string>(texts: unknown, icons: unknown, maxLen: number, maxItems: number, a: A, b: B): Record<A, string[]> & Record<B, string[]> {
  const ics = Array.isArray(icons) ? icons : [];
  const pairs = (Array.isArray(texts) ? texts : [])
    .map((t, i) => ({ t: str(t, maxLen), i: isStoryIcon(ics[i]) ? (ics[i] as string) : "" }))
    .filter((x) => x.t)
    .slice(0, maxItems);
  return { [a]: pairs.map((x) => x.t), [b]: pairs.map((x) => x.i) } as Record<A, string[]> & Record<B, string[]>;
}

export function normalizeStory(raw: unknown): AuthorStory {
  if (!raw || typeof raw !== "object") return { ...EMPTY_STORY, hidden: { ...EMPTY_STORY.hidden } };
  const r = raw as Record<string, unknown>;

  // media — also reads the earlier shape (`videoUrl`)
  let media: StoryMedia | null = null;
  const m = r.media && typeof r.media === "object" ? (r.media as Record<string, unknown>) : null;
  const caption = str(m?.caption, L.caption);
  const dur = str(m?.duration, 8);
  const duration = /^\d{1,2}:\d{2}(:\d{2})?$/.test(dur) ? dur : "";
  if (m && (m.kind === "video" || m.kind === "audio")) {
    const url = str(m.url, 400);
    if ((m.kind === "video" ? !!parseVideoUrl(url) : httpsUrl(url))) media = { kind: m.kind, url, caption, duration };
  } else {
    const legacy = str(r.videoUrl, 300);
    if (legacy && parseVideoUrl(legacy)) media = { kind: "video", url: legacy, caption: "", duration: "" };
  }

  const hid = r.hidden && typeof r.hidden === "object" ? (r.hidden as Record<string, unknown>) : {};
  const portrait = str(r.portraitUrl, 400);
  return {
    tagline: "", // the heading above the intro was removed; old saved values are dropped
    intro: paragraphs(str(r.intro, L.intro)).slice(0, L.introParagraphs).join("\n\n"),
    portraitUrl: httpsUrl(portrait) ? portrait : "",
    viewpoint: str(r.viewpoint, L.viewpoint),
    viewpointNote: str(r.viewpointNote, L.viewpointNote),
    steps: arr(r.steps)
      .map((s) => {
        const o = (s ?? {}) as Record<string, unknown>;
        return { title: str(o.title, L.stepTitle), text: str(o.text, L.stepText), icon: isStoryIcon(o.icon) ? o.icon : "" };
      })
      .filter((s) => s.title || s.text)
      .slice(0, L.steps),
    ...zipItems(r.principles, r.principleIcons, L.principle, L.principles, "principles", "principleIcons"),
    media,
    ...zipItems(r.offers, r.offerIcons, L.limit, L.limits, "offers", "offerIcons"),
    notOffers: arr(r.notOffers).map((x) => str(x, L.limit)).filter(Boolean).slice(0, L.limits),
    personal: str(r.personal, L.personal),
    photos: arr(r.photos).map((x) => str(x, 400)).filter(httpsUrl).slice(0, L.photos),
    faq: arr(r.faq)
      .map((x) => (x && typeof x === "object" ? { q: str((x as Record<string, unknown>).q, L.faqQ), a: str((x as Record<string, unknown>).a, L.faqA) } : { q: "", a: "" }))
      .filter((x) => x.q && x.a)
      .slice(0, L.faq),
    hidden: { viewpoint: hid.viewpoint === true, principles: hid.principles === true, media: hid.media === true, personal: hid.personal === true, faq: hid.faq === true },
  };
}

export function hasStory(s: AuthorStory): boolean {
  return !!(s.tagline || s.intro || s.viewpoint || s.steps.length || s.principles.length || s.media || s.offers.length || s.notOffers.length || s.personal || s.photos.length || s.faq.length);
}

// Which blocks the public page shows. A block is never published empty;
// a hidden block keeps its content but is not shown.
export function visibleBlocks(s: AuthorStory) {
  const steps = s.steps.filter((x) => x.title && x.text);
  return {
    intro: !!(s.tagline || s.intro),
    viewpoint: !!s.viewpoint && !s.hidden.viewpoint,
    how: steps.length >= 2,
    steps,
    principles: s.principles.length > 0 && !s.hidden.principles,
    media: !!s.media && !s.hidden.media,
    limits: s.offers.length > 0 || s.notOffers.length > 0,
    personal: (!!s.personal || s.photos.length > 0) && !s.hidden.personal,
    faq: s.faq.length > 0 && !s.hidden.faq,
  };
}

// What is still missing, per editor section (empty array = the section is complete).
export type SectionId = "intro" | "media" | "approach" | "principles" | "limits" | "faq";
export function missingParts(s: AuthorStory, hasPhoto = true): Record<SectionId, string[]> {
  const t = (x: string) => x.trim().length;
  const out: Record<SectionId, string[]> = { intro: [], media: [], approach: [], principles: [], limits: [], faq: [] };
  if (!s.portraitUrl.trim() && !hasPhoto) out.intro.push("додайте фото");
  if (t(s.intro) < M.intro) out.intro.push(`текст знайомства: щонайменше ${M.intro} символів (зараз ${t(s.intro)})`);
  const m = s.media;
  if (!m || !m.url.trim()) out.media.push("додайте відео (YouTube або Vimeo) чи аудіо");
  else if (m.kind === "video" && !parseVideoUrl(m.url.trim())) out.media.push("посилання на відео не розпізнано (YouTube або Vimeo)");
  if (t(s.viewpoint) < M.viewpoint) out.approach.push(`заголовок: щонайменше ${M.viewpoint} символів`);
  if (t(s.viewpointNote) < M.viewpointNote) out.approach.push(`підзаголовок: щонайменше ${M.viewpointNote} символів`);
  const steps = s.steps.filter((x) => t(x.title) >= M.stepTitle && t(x.text) >= M.stepText);
  if (steps.length < M.steps) out.approach.push(`етапи: щонайменше ${M.steps} повні (назва від ${M.stepTitle}, пояснення від ${M.stepText} символів), зараз ${steps.length}`);
  const pr = s.principles.filter((x) => t(x) >= M.principle);
  if (pr.length < M.principles) out.principles.push(`щонайменше ${M.principles} принципи (кожен від ${M.principle} символів), зараз ${pr.length}`);
  const of = s.offers.filter((x) => t(x) >= M.offer);
  if (of.length < M.offers) out.limits.push(`«Чого очікувати»: щонайменше ${M.offers} пункти (від ${M.offer} символів), зараз ${of.length}`);
  const no = s.notOffers.filter((x) => t(x) >= M.notOffer);
  if (no.length < M.notOffers) out.limits.push(`«Межі»: щонайменше ${M.notOffers} пункт (від ${M.notOffer} символів)`);
  const fq = s.faq.filter((x) => t(x.q) >= M.faqQ && t(x.a) >= M.faqA);
  if (fq.length < M.faq) out.faq.push(`щонайменше ${M.faq} запитання (запитання від ${M.faqQ}, відповідь від ${M.faqA} символів), зараз ${fq.length}`);
  return out;
}

// What must be true before saving to the database (drafts stay local).
export function validateStory(s: AuthorStory, opts: { hasProfilePhoto?: boolean } = {}): string[] {
  const errors: string[] = [];
  if (!s.portraitUrl.trim() && !opts.hasProfilePhoto) errors.push("Додайте фото: завантажте портрет або фото профілю.");
  if (!s.intro.trim()) errors.push("Додайте текст знайомства (до двох абзаців).");
  else if (paragraphs(s.intro).length > L.introParagraphs) errors.push("Текст знайомства: не більше двох абзаців (абзаци розділяйте порожнім рядком).");
  if (s.steps.some((x) => (x.title.trim() ? !x.text.trim() : !!x.text.trim()))) errors.push("«Підхід»: в етапі не вистачає назви або пояснення.");
  if (introLines(s.tagline, s.intro) > INTRO_MAX_LINES) errors.push("Текст знайомства задовгий: він має вміщатися по висоті біля фото. Скоротіть текст.");
  if (s.media) {
    if (!s.media.url.trim()) errors.push("«Особисте знайомство»: додайте відео або аудіо.");
    else if (s.media.kind === "video" && !parseVideoUrl(s.media.url.trim())) errors.push("Відео: підійде лише посилання YouTube або Vimeo.");
  }
  if (s.faq.some((x) => (x.q.trim() ? !x.a.trim() : !!x.a.trim()))) errors.push("«Запитання та відповіді»: у питанні не вистачає запитання або відповіді.");
  if (s.viewpointNote.trim() && !s.viewpoint.trim()) errors.push("«Мій погляд»: додайте основну думку або приберіть пояснення.");
  return errors;
}

// Plain-language reason a block is (not) shown publicly — the editor shows it
// so authors understand what visitors see. null = shown.
export type BlockId = "intro" | "viewpoint" | "how" | "principles" | "media" | "limits" | "personal" | "faq";
export function blockStatus(s: AuthorStory, id: BlockId, hasPhoto = true): string | null {
  const v = visibleBlocks(s);
  switch (id) {
    case "intro":
      if (!s.intro.trim()) return "Потрібно заповнити: додайте текст знайомства.";
      if (!s.portraitUrl.trim() && !hasPhoto) return "Потрібно заповнити: додайте фото.";
      return null;
    case "viewpoint":
      return s.hidden.viewpoint ? "Не показується: приховано (текст збережено)." : !s.viewpoint.trim() ? "Не показується: основна думка порожня." : null;
    case "how":
      return v.how ? null : "Не показується: потрібно щонайменше два повні етапи (назва й пояснення).";
    case "principles":
      return s.hidden.principles ? "Не показується: приховано (принципи збережено)." : !s.principles.length ? "Не показується: принципи не обрані." : null;
    case "limits":
      return v.limits ? null : "Не показується: нічого не заповнено.";
    case "personal":
      if (s.hidden.personal) return "Не показується: приховано (історію й фото збережено).";
      return v.personal ? null : "Не показується: ні тексту, ні фото.";
    case "faq":
      if (s.hidden.faq) return "Не показується: приховано (запитання збережено).";
      return v.faq ? null : "Не показується: немає жодної пари «запитання + відповідь».";
    case "media":
      if (s.hidden.media) return "Не показується: приховано (запис збережено).";
      if (!s.media) return "Не показується: відео чи аудіо ще немає.";
      if (!s.media.url.trim()) return s.media.kind === "audio" ? "Не показується: аудіофайл не завантажено." : "Не показується: посилання на відео порожнє.";
      return v.media ? null : "Не показується: посилання на відео не розпізнано (YouTube або Vimeo).";
  }
}

// What gets saved: normalised; an entirely empty story → null.
export function storyForSave(s: AuthorStory): AuthorStory | null {
  const n = normalizeStory(s);
  return hasStory(n) ? n : null;
}

// Audio file rules (checked before upload).
// What the page can show about the video (only what the author gave).
export function durationLabel(d: string): string {
  return d && /^\d{1,2}:\d{2}(:\d{2})?$/.test(d) ? d : "";
}

export const AUDIO_MAX_BYTES = 25 * 1024 * 1024;
export function validateAudioFile(f: { type: string; size: number }): string | null {
  if (!/^audio\/(mpeg|mp3|mp4|x-m4a|m4a|aac|wav|x-wav|ogg|webm)$/.test(f.type)) return "Підійде аудіо MP3, M4A, WAV або OGG.";
  if (f.size > AUDIO_MAX_BYTES) return "Файл завеликий (до 25 МБ).";
  return null;
}
export function validatePortraitFile(f: { type: string; size: number }): string | null {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return "Підійде зображення JPG, PNG або WebP.";
  if (f.size > 5 * 1024 * 1024) return "Файл завеликий (до 5 МБ).";
  return null;
}
