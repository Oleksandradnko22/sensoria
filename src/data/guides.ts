import type { GuideBlock, GuideQuickMode, GuideSOS } from "./guideBlocks.ts";
import type { GuideType } from "./guideTypes.ts";
import type { GuideOutlineItem, GuidePdfMeta } from "./guidePdf.ts";
import type { GuideContent, GuideSource } from "./guideContent.ts";
import { getGuideSectionCount } from "./guideContent.ts";
import { pagesLabel, resolveGuidePdf, sectionsLabel } from "./guidePdf.ts";
import { anxietyHitsContent } from "./guideContents/anxietyHitsContent.ts";

// Single source of truth for guide content. Extracted from
// GuidesCatalogPage.tsx (which used to define this array inline) so the
// new Library home page can reuse the exact same 10 guides instead of
// forking a second copy. GuidesCatalogPage now imports this file — its
// rendering/filtering logic is untouched, so nothing about that screen
// changes visually.
//
// This replaces the previous contents of this file: a second, unrelated
// 5-item guide list (`title`/`tags` only) that was never imported
// anywhere (confirmed via a full `src/` search) — dead data left over
// from an earlier pass, not the guides users actually see on the Guides
// catalog page. Consolidating to one real source instead of two
// disconnected "guides" datasets.
//
// `id` and `tags` are new additions (the inline version in
// GuidesCatalogPage had neither). `tags` uses the same emotional-state
// vocabulary as `programs.ts`/`meditations.ts` (`categoryLabels` keys)
// so the Library home page can pick "relevant to your result" guides
// the same way it does for courses and meditations. These tags are
// metadata only — GuidesCatalogPage's own sidebar still filters by
// `category` (format), exactly as before.
//
// `description` is a further addition — short one-liners for the "Моє
// навчання" card grid, which previously had nothing to show there.
//
// `readMinutes` — added 2026-09-08 for the guide-card redesign (Sasha's
// explicit spec: "12 сторінок · 5 хв" answering "скільки часу займе?").
// A rough per-guide reading-speed estimate, not a measured value —
// checklists read faster per page than workbooks, so this isn't a flat
// pages/constant conversion.
//
// `fileUrl` — added 2026-09-08 alongside GuideExperience.tsx (the
// "Відкрити гайд"/"Завантажити" screen, mirroring
// MeditationExperience). There's no real per-guide PDF asset in this
// demo, so every guide points at the same publicly hosted placeholder
// PDF — same pragmatic fallback decision as meditations.ts's shared
// SoundHelix audio track, and for the same reason (a real, working
// asset the browser can actually open/download beats no asset at all).
//
// `points` — added 2026-09-08 for "Зберегти конкретну частину" (per
// Sasha's explicit spec): a guide broken into its real standalone
// points/steps, each independently saveable (GuideExperience.tsx +
// lib/guideFragments.ts) instead of only the guide as a whole. Optional
// and declared on an explicit `Guide` type (not inferred via `typeof
// guides[number]` like before) precisely so it CAN be absent — only
// guides someone has actually written real step-by-step content for
// get it; the rest just don't render that section yet.
//
// `quickMode` — added 2026-09-09 for "Швидкий режим" (Sasha's explicit
// spec: "не кожен хоче читати 18 сторінок... основне за 2 хвилини"). A
// separate, hand-written short summary — NOT auto-derived from
// `content` — that GuideExperience shows first when present, with a
// "Хочу розібратися глибше →" link into the full guide. See
// data/guideBlocks.ts's GuideQuickMode for the shape.
//
// `content` — added 2026-09-09 for the "Interactive experience" spec
// (Sasha's explicit product call: "Гайд має бути не просто PDF" — text,
// headings, lists, checklists, steps, images, tables, audio, links to
// meditations/other guides, rendered inside the platform, with the PDF
// downgraded to an optional downloadable extra rather than the product
// itself). See data/guideBlocks.ts for the block shapes and
// GuideBlockRenderer.tsx for how they render. Independent of `points`
// above — a guide can have either, both, or neither; GuideExperience
// prefers `content` for the main body whenever it's present.
//
// `relevantIf` — added 2026-09-09 for "Що робити зараз" (Sasha's
// explicit spec: a small "цей гайд може бути корисним, якщо ви зараз..."
// box shown right at the top, before anything else — the same "я зараз
// → ось інструмент" logic already familiar from Sensoria's
// recommendation cards elsewhere, made explicit for a guide instead of
// left implicit in a match score). Plain situational phrases, each
// rendered as one bullet; optional, same reasoning as `points`/`content`
// above — only guides someone has actually written these for show the
// box.
export type Guide = {
  id: string;
  title: string;
  author: string;
  type: string;
  pages: number;
  readMinutes: number;
  fileUrl: string;
  price: string;
  tag?: string;
  // When the guide was added to the catalog (ISO date); feeds the «Нові» sort.
  publishedAt?: string;
  // Average rating 1–5, once it is known; feeds the rating sort (no ratings exist for guides yet).
  rating?: number;
  category: string;
  description: string;
  tags: string[];
  points?: string[];
  content?: GuideBlock[];
  relevantIf?: string[];
  /** false = the author does not let readers download this guide (missing = allowed). */
  allowDownload?: boolean;
  quickMode?: GuideQuickMode;
  // "Тип гайда" (2026-09-09, per Sasha's explicit spec — an author
  // picks this at creation; see data/guideTypes.ts for the full
  // taxonomy). Optional so every guide written before this field
  // existed still type-checks and renders exactly as before — this is
  // architecture laid down ahead of the real author-facing picker, not
  // a migration of the existing catalog. Independent of the pre-
  // existing `type`/`category` strings above (those are format labels
  // for the catalog filter; this is the new duration/purpose axis).
  guideType?: GuideType;
  // Only meaningful when `guideType` is "sos" — see GuideSOS's own
  // comment in guideBlocks.ts and GuideSOSView.tsx for how this
  // replaces the normal quickMode/full-content experience entirely.
  sos?: GuideSOS;

  // ---- Preview-page data -----------------------------------------------
  // Optional; legacy fields (`content`/`quickMode`/`points`/`sos`) are no
  // longer rendered — they only feed related-content links and the outline
  // fallback. New guides use `guideContent` (below).
  //
  // Extra facts about the PDF file itself (source, page count, size,
  // version, real cover/page-preview images). See GuidePdfMeta.
  pdf?: GuidePdfMeta;
  // "Що всередині" — an authored table of contents with one-line
  // purposes. Falls back to the headings of `content` when absent.
  outline?: GuideOutlineItem[];
  // "Після гайду у вас буде" — what the person walks away with, as short
  // plain statements. Guide-specific outcomes only; the page adds the
  // universal "you keep the PDF" line itself.
  outcomes?: string[];

  // ---- Guide as a content entity (2026-10-06) ------------------------
  // "sensoria_structured": built from `guideContent` blocks — has an
  //   interactive web version AND a static/print version of the SAME
  //   content (data/guideContent.ts, data/guideStatic.ts).
  // "uploaded_pdf": an author-uploaded PDF, shown as-is (`fileUrl`); never
  //   given interactions and never modified.
  // Absent = legacy guide, treated as "uploaded_pdf" unless it carries
  // `guideContent`. Use getGuideSource() rather than reading this directly.
  source?: GuideSource;
  guideContent?: GuideContent;
};

export function getGuideSource(guide: Pick<Guide, "source" | "guideContent">): GuideSource {
  if (guide.source) return guide.source;
  return guide.guideContent && guide.guideContent.length > 0 ? "sensoria_structured" : "uploaded_pdf";
}

// "10 розділів" for an interactive guide (it has no pages), "8 сторінок" for an
// uploaded PDF — one place so every card and block says the same thing.
export function guideSizeLabel(guide: Guide): string {
  return getGuideSource(guide) === "sensoria_structured"
    ? sectionsLabel(getGuideSectionCount(guide))
    : pagesLabel(guide.pages);
}

// What a catalog card says about the guide's size: its page count (the file's own, else the stored
// one) — no sections and no reading time. A missing or zero value is left out rather than shown wrong.
export function guideCardMeta(guide: Guide): string[] {
  const pages = resolveGuidePdf(guide).pageCount;
  return pages > 0 ? [pagesLabel(pages)] : [];
}

// The catalog. Exactly one real guide (Sasha, 2026-09-29: "оставь только
// одну"): the structured interactive guide below, which replaced the earlier
// demo of the same topic (2026-10-06) because the block model superseded
// its hand-rolled content. Real guides get added the same way real
// meditations do: authored content first, catalog entry second.
export const guides: Guide[] = [
  {
    id: "what-to-do-when-anxiety-hits",
    title: "Що робити, коли накриває тривога",
    author: "Sensoria",
    type: "Interactive guide",
    // An authored estimate of the printed length — a structured guide has
    // no PDF file whose real page count could be read. The preview page
    // shows sections and reading time instead of this number.
    pages: 8,
    readMinutes: 10,
    // A structured guide has no uploaded file; its print version is
    // rendered from `guideContent` on demand.
    fileUrl: "",
    price: "0",
    tag: "Новий",
    // the structured guide replaced the earlier demo on this date (see the note above)
    publishedAt: "2026-10-06",
    category: "Міні-гайди",
    description:
      "Практичний гайд про те, що відбувається під час тривоги: впізнати свою реакцію, спробувати одну практику заземлення, помітити, що змінилося, і обрати наступний крок.",
    tags: ["anxiety", "stress"],
    guideType: "practical",
    source: "sensoria_structured",
    relevantIf: [
      "не знаєте, що робити прямо зараз",
      "відчуваєте сильне напруження в тілі",
      "хочете розібратися, що з вами відбувається",
      "шукаєте конкретний план дій, а не просто «заспокойся»",
    ],
    outcomes: [
      "Розуміння того, як тривога проходить через думки, тіло й поведінку",
      "Одна практика заземлення, яку можна повторити в будь-який момент",
      "Невеликий план на найближчий час",
    ],
    guideContent: anxietyHitsContent,
  },
];
