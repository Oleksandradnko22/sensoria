// "Моє навчання" list-building — one shared shape for both a real
// enrollment (in-progress/completed) and a merely-saved item (no
// purchase/start yet), so ParticipantLearning's card grid renders
// either without two parallel branches (2026-09-16 technical audit —
// extracted out of ParticipantLearning.tsx into its own dependency-free
// module for the same reason lib/contentDiversity.ts's
// excludeOwnedAndDiversify was: a pure, catalog-agnostic function is
// trivially unit-testable with synthetic data, where the component
// itself (heavy with unrelated imports) is not).
//
// Deliberately takes `savedItems` as a parameter rather than importing
// data/participantDashboard.ts's real `savedContent` array itself —
// same reasoning as `realSavedGuideIds` already being a parameter: the
// caller already has whichever "what's saved" source is relevant, this
// file shouldn't need its own opinion about where that comes from.
import type { ContentKind, Enrollment, EnrollmentStatus, SavedItem } from "../data/participantDashboard.ts";

// "recommended" (2026-08-30, per Sasha's explicit call): a genuinely
// new status, not a reuse of "saved" — a personalized suggestion the
// person hasn't touched yet is a fundamentally different thing from
// something they deliberately bookmarked, and the card reads them
// differently ("Рекомендовано для вас" vs "У збереженому"). Only ever
// synthesized by ParticipantLearning's own "Мої рекомендації" filter —
// never produced by combineByType below.
export type LearningItem = {
  contentId: string;
  kind: ContentKind;
  status: EnrollmentStatus | "saved" | "recommended";
  enrollment?: Enrollment;
  // Independent of `status` (2026-09-21, real program participation
  // architecture) — an item can be BOTH genuinely in-progress/completed
  // AND separately saved for later at the same time (see
  // lib/programParticipation.ts's buildProgramLearningItems, the only
  // producer that sets this today). `status` stays whichever single
  // bucket the card itself renders as (its badge/CTA can only say one
  // thing); this flag is what the "Збережені" filter checks instead,
  // so a started-and-saved / completed-and-saved program can pass BOTH
  // its status filter and "Збережені" without appearing twice. Absent/
  // false everywhere else (guides, meditations, saved-only rows of any
  // kind, which already use status === "saved" for this) — unchanged.
  saved?: boolean;
};

// `realSavedIds` (2026-09-09, per Sasha's explicit request — a person
// adding a guide to "обране" themselves from the dashboard; extended
// 2026-09-21 to programs for the same reason — "Збережені" needs a
// real save/unsave action, not a static demo entry; extended again
// 2026-09-24, per Sasha's explicit call — "сделай систему сохранения
// такой же как и в програмах" — to meditations too): guides read their
// "saved" state from the real guide_saved_for_later table
// (lib/guideSaves.ts); programs read theirs from the real
// program_saved_for_later table (lib/programSaves.ts); meditations read
// theirs from the real content_item_saved_practices "Моя практика" rows
// (lib/savedPractices.ts) — all three passed in here as `realSavedIds`,
// never from `savedItems` for any of them anymore. This was the actual
// bug behind Sasha's "как висела Самопідтримка в збережених так і
// висить" report: the ♡ toggle on a meditation card only ever wrote to
// content_item_saved_practices, but this function was still deciding
// the "Збережені" tab's membership from the hand-typed `savedItems`
// array for meditations — so a demo-seeded "saved" meditation could
// never be removed by the real toggle, and a newly-heart-saved one would
// never actually show up under "Збережені" either. Callers pass
// whichever real-saved Set actually matches `kind` (an empty Set when it
// doesn't apply) — this function has no opinion about where that Set
// comes from. `savedItems` is now unused by this function entirely —
// kept as a parameter only so call sites don't need updating, matching
// how `source`/enrollments already work.
//
// `source` should already be status-corrected (lib/guideProgress.ts's
// withRealGuideStatus / lib/programStatus.ts's withRealProgramStatus)
// before it reaches here — this function has no opinion about that, it
// only ever reads whatever `status` each entry already carries.
//
// Ownership vs. saved is structural, not just a status string: an id
// that's in `source` (enrolled) is NEVER also emitted from `savedItems`
// (the `!enrolledIds.has(...)` filters below) — a person can't see the
// same content twice, once as "in-progress"/"completed" and again as
// "saved". A bookmark on something already owned still exists (see
// lib/guideSaves.ts's/lib/programSaves.ts's own real, independent
// toggle) — it just doesn't need its own extra row here, since the
// owned row already represents that content. This is also exactly what
// keeps saved/enrolled/started/completed fully independent: saving
// something already in progress or already completed still just adds
// its id to the real-saved table, it never touches `source`/enrollment
// at all, and unsaving never touches it either — see programSaves.ts's
// own plain add/remove functions, which are the only thing this file
// consults for kind === "program".
export function combineByType(
  kind: ContentKind,
  realSavedIds: Set<string>,
  source: Enrollment[],
  // No longer read — ContentKind is exactly "program" | "guide" |
  // "meditation" and all three now resolve "saved" from `realSavedIds`
  // above, so the old savedItems-based fallback branch this used to feed
  // is dead. Kept as a parameter (prefixed `_`, unused-by-design) purely
  // so existing call sites don't all need updating for an otherwise
  // no-op signature change.
  _savedItems: SavedItem[]
): LearningItem[] {
  // An enrolled/started meditation (or guide) can *also* be real-saved at
  // the same time — same "both at once" case already handled for programs
  // (see `saved` field's own comment above). Without this, a meditation
  // that already has a demo enrollment row could never show under
  // "Збережені" no matter what: its enrollment entry always wins below,
  // and the dedicated fromSaved entry is filtered out as already-owned —
  // this was the real cause of Sasha's "все одно не з'являється у
  // Збережених" report (2026-09-24), distinct from the earlier RLS/session
  // bug that blocked the write itself.
  const fromEnrollments: LearningItem[] = source
    .filter((e) => e.kind === kind)
    .map((e) => ({ contentId: e.contentId, kind, status: e.status, enrollment: e, saved: realSavedIds.has(e.contentId) }));
  const enrolledIds = new Set(fromEnrollments.map((i) => i.contentId));

  const fromSaved: LearningItem[] = Array.from(realSavedIds)
    .filter((id) => !enrolledIds.has(id))
    .map((id) => ({ contentId: id, kind, status: "saved" }));
  return [...fromEnrollments, ...fromSaved];
}
