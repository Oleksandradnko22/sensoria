// Real program membership for "Моє навчання" (2026-09-21 architecture
// change, following the same-day read-only audit). Replaces the static
// `data/participantDashboard.ts` `enrollments` array as the PROGRAM
// membership source for ParticipantLearning specifically — see that
// file's own header for why `enrollments` itself stays untouched (it
// still feeds Overview/dashboardPriority/emotionalProfile, none of
// which are in scope here).
//
// A program enters "Моє навчання" under exactly one of two real,
// independent signals — never because it merely exists in a catalog:
//   - real activity: a content_progress row whose derived state
//     (lib/contentProgress.ts's computeProgress) is not "not_started"
//   - real saved state: a program_saved_for_later row
// Catalog-only programs, and a brand-new participant with neither
// signal, produce an empty list — intentionally; see the audit's own
// "brand-new participant must not see fake demo programs" requirement.
//
// Deliberately pure — no Supabase calls, no React, no UI state. Callers
// (ParticipantLearning.tsx) own fetching the three real inputs below
// and pass them in already resolved, same shape as
// lib/learningItems.ts's combineByType and lib/contentDiversity.ts's
// excludeOwnedAndDiversify — a pure function over synthetic data is
// trivially unit-testable without a real Supabase connection.

import { computeProgress } from "./contentProgress.ts";
import type { ContentModule, ItemProgressMap } from "../data/contentTypes.ts";
import type { EnrollmentStatus } from "../data/participantDashboard.ts";
import type { LearningItem } from "./learningItems.ts";

// One real content_progress row, already validated
// (lib/contentProgressSync.ts's fetchAllProgress) — contentId is the
// program's id (demo string or real Supabase uuid-as-text, same
// convention as every other content_id column in this schema).
export type ProgramActivityRow = {
  contentId: string;
  progress: ItemProgressMap;
  updatedAt: string;
};

// Resolves a program's module/item structure regardless of which
// catalog it lives in — the caller is expected to check the demo
// dictionary (data/programModules.ts, synchronous) before falling back
// to a bulk real-content fetch (lib/publicContent.ts's
// fetchProgramItemsForIds), exactly as lib/programProgress.ts's
// getProgramModules already does for a single program. Returning null
// means "no structure available yet" — see the fallback branch in
// buildProgramLearningItems below for what that does to the derived
// state.
export type ResolveProgramModules = (contentId: string) => ContentModule[] | null;

// The one shared state-derivation step — exported (2026-09-21, Overview/
// Program Preview/Emotional Profile follow-up) so every real per-program
// lookup in the app goes through this SAME function instead of each
// caller re-deriving its own answer: buildProgramLearningItems' own loop
// below (the bulk case), and programDetail/ProgramDetailPage.tsx (a single-program
// lookup — no reason to force that through the full ProgramActivityRow[]
// bulk shape just to get one answer). Decoupled from ProgramActivityRow
// on purpose — a caller with just a raw progress map and a contentId
// (no `updatedAt` in hand, e.g. before any content_progress row exists)
// can still call this directly.
export function deriveProgramActivityState(
  contentId: string,
  progress: ItemProgressMap,
  resolveModules: ResolveProgramModules
): { state: "not_started" | "in_progress" | "completed"; percent: number } {
  const modules = resolveModules(contentId);
  if (modules) {
    const summary = computeProgress(modules, progress);
    return { state: summary.state, percent: summary.percent };
  }
  // No catalog structure resolved yet (a real program whose bulk fetch
  // hasn't landed, or that no longer resolves at all) — fall back to a
  // raw scan of the stored map itself: any item explicitly marked as
  // something other than "not_started" is real, honest evidence of
  // activity, independent of knowing which items are required. This
  // can never claim "completed" (that needs the required-item list to
  // mean anything), so it only ever reads "in_progress" or
  // "not_started" — it can under-claim (briefly, until structure
  // resolves) but never over-claim.
  const hasAnyActivity = Object.values(progress).some((status) => status !== "not_started");
  return { state: hasAnyActivity ? "in_progress" : "not_started", percent: 0 };
}

// The real assembler: real activity rows + real saved ids + a catalog
// resolver -> deduplicated program LearningItems, ready for
// ParticipantLearning's existing filter/render pipeline (same
// LearningItem shape lib/learningItems.ts's combineByType already
// produces for guides/meditations, so ContentCard needs no changes).
//
// Dedup rule: a program with BOTH real activity and a real save
// produces exactly ONE item — its `status` reflects the real activity
// (never demoted to "saved"), and `saved: true` is set alongside it so
// the "Збережені" filter can still find it (see LearningItem.saved's
// own comment for why that's a separate flag from `status`). A
// save-only program (no activity) is the only case that gets
// `status: "saved"`, matching the existing convention
// lib/learningItems.ts's combineByType already uses for guides.
export function buildProgramLearningItems(
  activity: ProgramActivityRow[],
  savedProgramIds: Set<string>,
  resolveModules: ResolveProgramModules,
  // free programs added from the cart: in the cabinet at 0%, before any real activity
  acquiredProgramIds: Set<string> = new Set()
): LearningItem[] {
  const items: LearningItem[] = [];
  const seen = new Set<string>();

  for (const row of activity) {
    const { state, percent } = deriveProgramActivityState(row.contentId, row.progress, resolveModules);
    // Not real membership — an empty/all-not-started progress row
    // (should be rare in practice, since nothing writes one, but a
    // genuinely empty `{}` row is a valid, honest state) never counts
    // as activity, matching the audit's explicit "must not fabricate
    // interest" rule. It may still appear below via the saved-only
    // pass if it's also saved.
    if (state === "not_started") continue;
    if (seen.has(row.contentId)) continue;
    seen.add(row.contentId);

    const status: EnrollmentStatus = state === "completed" ? "completed" : "in-progress";
    items.push({
      contentId: row.contentId,
      kind: "program",
      status,
      saved: savedProgramIds.has(row.contentId),
      // A real Enrollment-shaped object, built from the ONLY two real
      // timestamps this architecture actually has for a program
      // (content_progress.updated_at) — never a fabricated purchase
      // date. `purchasedAt` has no real backing anywhere in this data
      // model (see the 2026-09-21 audit's own finding — there is no
      // real enrollment/purchase table at all), and is never rendered
      // by anything reading this specific object (ContentCard only
      // reads progressPercent/status; dashboardPriority's
      // pickContinueEnrollment only reads status/progressPercent/
      // lastAccessedAt) — reusing the one real timestamp available is
      // an honest simplification, not invented history.
      enrollment: {
        contentId: row.contentId,
        kind: "program",
        progressPercent: percent,
        status,
        purchasedAt: row.updatedAt,
        lastAccessedAt: row.updatedAt,
      },
    });
  }

  // Added from the cart, not started: a real in-progress-at-0% program (the state that already exists
  // for "a required item is open but nothing is done"), never a fabricated date or percentage.
  for (const programId of acquiredProgramIds) {
    if (seen.has(programId)) continue;
    seen.add(programId);
    items.push({
      contentId: programId,
      kind: "program",
      status: "in-progress",
      saved: savedProgramIds.has(programId),
      enrollment: { contentId: programId, kind: "program", progressPercent: 0, status: "in-progress", purchasedAt: "", lastAccessedAt: "" },
    });
  }

  for (const programId of savedProgramIds) {
    if (seen.has(programId)) continue;
    items.push({ contentId: programId, kind: "program", status: "saved", saved: true });
  }

  return items;
}

// "Скільки ІНШИХ реальних програм ще не завершено" — the program-only
// equivalent of lib/dashboardPriority.ts's countOtherUnfinished
// (2026-09-21, Overview follow-up). Kept as its own small function
// here rather than editing that shared one: its `progressPercent > 0`
// clause is still correct for guides (a real section-view percent
// genuinely means "opened at least one section"), but would be wrong
// for programs post the state-semantics fix — IN_PROGRESS + 0% is
// valid and real, so gating on percent would silently undercount a
// genuinely-started program again, the exact bug that fix already
// resolved for the badge/CTA elsewhere. Editing the shared function
// would also loosen this rule for guides/meditations, outside this
// task's scope. `items` is expected to already be program
// LearningItems from buildProgramLearningItems above — status is
// trusted as-is (never percent-gated), so a real IN_PROGRESS + 0%
// program counts, a COMPLETED one doesn't, and a SAVED-only one
// (status "saved", no real activity) doesn't either.
export function countOtherUnfinishedPrograms(items: LearningItem[], excludeContentId: string | null): number {
  return items.filter((i) => i.status === "in-progress" && i.contentId !== excludeContentId).length;
}
