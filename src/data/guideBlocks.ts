// The structured content model behind a guide's "Interactive
// experience" (2026-09-09, per Sasha's explicit product spec — "Гайд
// має бути не просто PDF... Sensoria повинна вміти відображати
// структурований гайд усередині платформи"). A guide's `content`
// (data/guides.ts) is an ordered list of these blocks — text,
// headings, lists, checklists, step-by-step instructions, images,
// tables, audio, and links to other real content (a meditation or
// another guide) — rendered in order by GuideBlockRenderer.tsx.
//
// A guide's `fileUrl` (the PDF) still exists alongside this — per
// Sasha's own framing, it becomes an optional downloadable extra once a
// guide has real `content`, not the product itself. A guide with no
// `content` at all (the common case for the existing catalog) still
// works exactly as before: fileUrl is the whole guide, opened/
// downloaded directly. Both can coexist; `content` just takes over as
// the primary thing GuideExperience shows when it's there.
//
// Deliberately NOT wired into the separate fragment-save feature
// (lib/guideFragments.ts, the ♡ on a `points` string) — that still reads
// a guide's flat `points` field, unrelated to `content`. Checklist/note/
// self-assessment state below has its own persistence instead. The
// still-outstanding follow-up is the author-side Guide Builder, per
// Sasha's own call: participant-side rendering first, authoring after.
export type GuideBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  // A checklist is genuinely interactive here (checkable in the UI) and,
  // as of 2026-09-09 per Sasha's explicit "Чек-лист... і користувач
  // реально відмічає це всередині гайду" spec, real: each checked item
  // is persisted per person per guide (lib/guideChecklistChecks.ts,
  // keyed by guide+block+item index) and comes back checked the next
  // time this guide is opened.
  | { type: "checklist"; items: string[] }
  // Visually distinct from `list` — numbered circles instead of plain
  // bullets, for content that's genuinely sequential ("зробіть спочатку
  // це, потім це"), not just a set of related points.
  | { type: "steps"; items: string[] }
  | { type: "image"; url: string; caption?: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "audio"; url: string; title?: string }
  // Cross-links to other REAL content already in the catalogs
  // (data/meditations.ts / data/guides.ts / data/programs.ts) — opening
  // one closes this guide's screen and opens the linked experience
  // instead (see GuideExperience's onOpenMeditationLink/onOpenGuideLink/
  // onOpenProgramLink props), exactly like following a link should feel.
  // Together these are what makes a guide a real entry point into the
  // rest of Sensoria rather than an island (2026-09-09, per Sasha's
  // "Це створює екосистему, а не набір окремих продуктів").
  | { type: "meditationLink"; meditationId: string; label?: string }
  | { type: "guideLink"; guideId: string; label?: string }
  | { type: "programLink"; programId: string; label?: string }
  // A free-text reflection field (2026-09-09, per Sasha's "Поле для
  // замітки" spec) — persisted per person per guide (lib/guideNotes.ts),
  // not shared or visible to anyone else. `prompt` is the question shown
  // above the textarea (e.g. "Що я помітив/ла?").
  | { type: "note"; prompt: string }
  // A 1–10 self-rating (2026-09-09, per Sasha's "Самооцінка" spec) —
  // `phase` marks whether this is the "Було" (before) or "Стало" (after)
  // reading; GuideBlockRenderer shows a live "Було: X → Стало: Y"
  // comparison once both exist for the same guide+person
  // (lib/guideSelfAssessments.ts persists each phase separately).
  | { type: "selfAssessment"; phase: "before" | "after"; prompt: string };

// A cross-link usable from "Швидкий режим" specifically — the same
// shape as the three *Link block types above, just not itself a
// GuideBlock (quick mode isn't a page in `content`, it's a separate,
// much shorter summary shown instead of it — see GuideQuickMode below).
export type GuideQuickPractice =
  | { type: "meditationLink"; meditationId: string; label?: string }
  | { type: "guideLink"; guideId: string; label?: string }
  | { type: "programLink"; programId: string; label?: string };

// "Швидкий режим" (2026-09-09, per Sasha's explicit spec: "не кожен
// хоче читати 18 сторінок" — a whole separate, hand-written 2-minute
// summary of a guide, not an auto-generated excerpt of `content`).
// Optional on Guide (data/guides.ts); when present, GuideExperience
// opens showing this FIRST instead of the full paginated content, with
// a "Хочу розібратися глибше →" link to switch to the full guide (and
// back). A guide with `content` but no `quickMode` just opens straight
// into the full experience, exactly as before this feature existed.
export type GuideQuickMode = {
  keyIdea: string;
  // Meant to be exactly 3 per Sasha's mock ("3 головні дії"), but
  // rendered as however many are given — no hard validation here.
  actions: string[];
  practice?: GuideQuickPractice;
  nextStep: string;
};

// "SOS Guide" (2026-09-09, per Sasha's explicit spec — the one guide
// type she called out as its own product-level experience, not just a
// duration label: "Користувач відкриває його — і не отримує 15 екранів
// тексту. Одразу: Зараз зробіть це."). Deliberately much smaller than
// GuideQuickMode above — no keyIdea, no nextStep, nothing to read
// before acting. Only meaningful on a guide whose `guideType`
// (data/guideTypes.ts) is "sos"; GuideExperience.tsx shows this INSTEAD
// of quickMode/full content whenever it's present, with no toggle back
// into the full document — see GuideSOSView.tsx.
export type GuideSOS = {
  // The immediate, numbered steps — exactly what GuideSOSView renders
  // under its fixed "Зараз зробіть це:" heading.
  actions: string[];
  practice?: GuideQuickPractice;
};

// How many "сторінок"/sections a guide's content splits into once
// GuideBlockRenderer groups it by heading (2026-09-09, per Sasha's
// "Ви переглянули X із Y розділів" spec — progress should read in
// sections, not an artificial %, because "гайд — не курс"). Mirrors
// GuideBlockRenderer's buildPages grouping exactly: every `heading`
// starts a new section, and content with no heading at all is still one
// single section rather than zero. Guides with no `content` (plain PDF)
// return 0 — there's nothing to count sections of, so callers fall back
// to their previous progress display for those.
export function countGuideSections(content: GuideBlock[] | undefined): number {
  if (!content || content.length === 0) return 0;
  const headingCount = content.filter((block) => block.type === "heading").length;
  return headingCount > 0 ? headingCount : 1;
}
