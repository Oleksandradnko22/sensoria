// Shared content/progress types for the "core content experience" —
// used by all three content types (program/meditation/guide), not just
// programs, so a guide's sections and a program's lessons are both
// ContentItem specifically, not two parallel concepts. See
// src/lib/contentProgress.ts for the pure progress-engine functions
// that operate on these types, and src/data/programModules.ts /
// src/data/guideSections.ts for the demo data authored against them.
//
// Real (non-demo, authored) content now has its own content_items
// table mirroring this exact shape (see lib/content.ts's ItemRow and
// lib/publicContent.ts's fetchProgramItems) — AuthorCourseEditor edits
// items one at a time the same way it edits modules. A real program
// with modules but no authored items yet (lessons collected only as a
// bare count) still falls back to PublicProgramModule in
// lib/publicContent.ts, which is the "no item data" path.

export type ContentItemType =
  | "text"
  | "video"
  | "audio"
  | "image"
  | "pdf"
  | "checklist"
  | "mixed";

// "Спробуйте зараз" — a short interactive practice attached to a
// lesson, distinct from the checklist body text above (that's just
// read-only instructions; this is something the person actually
// answers inside the interface). Kept as one flexible spec instead of
// four parallel item shapes, since an item has at most one practice —
// the type discriminates which input the Lesson Player renders.
// Deliberately scoped to Sasha's four "base" types for this first pass
// (text/scale/choice/checkboxes) — timer, breathing, reflection and
// short-meditation practices are separate, later features (her own
// prioritized list), not variants of this same spec.
export type PracticeType = "text" | "scale" | "choice" | "checkboxes";

export type PracticeSpec = {
  type: PracticeType;
  // The question/instruction shown above the input, e.g. "Наскільки
  // напружено ви почуваєтесь зараз?" — always required, every type
  // needs something to ask.
  prompt: string;
  // choice/checkboxes only — the list of selectable options.
  options?: string[];
  // scale only — endpoints and their labels, e.g. 1..10 with
  // ["Спокійно", "Напружено"]. Both default (1..5) if omitted so an
  // author can add a scale practice without configuring every field.
  scaleMin?: number;
  scaleMax?: number;
  scaleLabels?: [string, string];
};

export type ContentItem = {
  // Stable within its content — never renumbered when items are added/
  // removed elsewhere, so progress recorded against an id stays valid.
  id: string;
  title: string;
  type: ContentItemType;
  // Default true. An optional item (e.g. a bonus mini-task) never
  // blocks program completion or the next required item's unlock —
  // see lib/contentProgress.ts's isItemLocked/computeProgress.
  isRequired: boolean;
  body?: string;
  videoUrl?: string;
  // Full text of what's said in the video/audio, pasted in by the
  // author (see AuthorCourseEditor) — not auto-generated. There's no
  // reliable way to pull captions out of an unlisted YouTube video
  // client-side, so this stays manual, same spirit as fileUrl's
  // fileName/fileSizeLabel being author-supplied metadata rather than
  // something fetched. Mainly for accessibility (screen readers / deaf
  // and hard-of-hearing participants) — rendered collapsed under the
  // video so it doesn't compete with actually watching/listening.
  transcript?: string;
  // "Перед початком" — a short, author-written note on sensitive topics
  // this item touches (loss, panic attacks, traumatic experience...),
  // shown as a gate the person has to actively continue past ("Готовий
  // продовжити") before the item's real content renders at all — not
  // just a passive line of text they might scroll past. Especially
  // important for emotional-wellbeing content, per Sasha's explicit
  // call. Absent means no gate — most items have nothing sensitive to
  // flag.
  contentWarning?: string;
  audioUrl?: string;
  imageUrl?: string;
  fileUrl?: string;
  // Display-only metadata for the download card (see ProgramExperience's
  // materials block) — the real filename/size a browser would otherwise
  // have to fetch the file just to learn. Optional: a fileUrl with
  // neither still renders a sensible generic card.
  fileName?: string;
  fileSizeLabel?: string;
  checklist?: string[];
  // Plain minutes, not a pre-formatted string — lets module/program
  // totals be summed and formatted consistently (see
  // lib/contentProgress.ts's formatDuration) instead of concatenating
  // strings like "40 хв" + "55 хв" that can't be added together.
  durationMinutes?: number;
  // "Спробуйте зараз" — see PracticeSpec above. Optional and
  // independent of `type`, same as audioUrl/fileUrl: any item can carry
  // a practice regardless of what its primary content is.
  practice?: PracticeSpec;
  // Gift lesson: an author's own meditation / guide included in the program for free. `material` is what the
  // player shows (resolved from the content row); `appId` is the id the guides / meditations pages use (the slug).
  materialId?: string;
  material?: { kind: "meditation" | "guide"; title: string; description?: string; appId: string };
};

export type ContentModule = {
  id: string;
  title: string;
  description: string;
  items: ContentItem[];
};

// "skipped" — only ever set via the "Перед початком" content-warning
// gate's "Не зараз" (ProgramExperience.tsx), never by the person just
// choosing not to do something. Satisfies sequential locking exactly
// like "completed" (isItemLocked/getNextItem in lib/contentProgress.ts
// — declining a warning shouldn't trap someone behind a required item
// they explicitly chose not to open), and DOES count toward
// completedRequiredItems/percent/isCompleted (see isResolved) — a
// person who declines a warning can still fully finish the program,
// rather than being permanently capped below 100%. The item itself
// still remembers it was only skipped, not actually done, and shows a
// distinct "— Пропущено" label (not "✓ Завершено") wherever individual
// items are listed, and never counts toward investedMinutes.
export type ItemProgressStatus = "not_started" | "in_progress" | "completed" | "skipped";

// contentItemId -> status. One flat map per piece of content — a
// program's map spans all its modules' items; a guide's map spans its
// (module-less) items directly. Absence of a key means "not_started",
// so a brand-new map ({}) is always a valid, fully-untouched state.
export type ItemProgressMap = Record<string, ItemProgressStatus>;

// Whether the PARTICIPANT has started, not how far they've gotten —
// deliberately a separate axis from `percent` (2026-09-21 state-
// semantics fix). `percent` only moves on required-item completion, by
// design (see its own comment below) — a real, honest 0% is valid
// alongside having genuinely started. `state` is what a "Не розпочато"/
// "У процесі"/"Завершено" badge or CTA should read, `percent` is what
// the numeric ring/bar should read; neither is derived from the other.
// See lib/contentProgress.ts's computeProgress for exactly how this is
// derived — the same required/optional/isResolved vocabulary already
// used for percent and isCompleted, no parallel state machine.
export type ProgramState = "not_started" | "in_progress" | "completed";

export type ProgramProgressSummary = {
  totalItems: number;
  requiredItems: number;
  completedRequiredItems: number;
  // 0–100, based on required items only — an optional mini-task never
  // moves this number, matching "не превращать в LMS с давлением".
  percent: number;
  totalModules: number;
  // -1 once every required item across the whole program is done —
  // there's no "current module" left to resume into.
  currentModuleIndex: number;
  currentItemIndex: number;
  isCompleted: boolean;
  // See ProgramState's own comment above — this can be "in_progress"
  // while percent is still 0 (a required item is open but not yet
  // completed/skipped). Never used to derive percent/isCompleted, and
  // never derived FROM percent — both read the same underlying
  // progress map independently.
  state: ProgramState;
};
