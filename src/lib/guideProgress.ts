// Single source of truth for a GUIDE's real completion status
// (2026-09-15, Dashboard QA fix). Before this, "completed vs
// in-progress" for a guide was decided two different, independent ways:
// the real section-view count (lib/guideSectionViews.ts, "Ви переглянули
// X із Y розділів" — correct) drove the CARD LABEL only, while every
// other guide-status decision (Моє навчання's "Завершені"/"У процесі"
// filter, "Продовжити", "скільки незавершених матеріалів", the CTA
// label) kept reading the static demo `enrollment.status` field, which
// never moves just because someone read every section for real. A guide
// could show "✓ Опрацьовано" on its own card while still counting as
// "in-progress" everywhere else on the page.
//
// This file is the one place that decides guide completion from real
// data — every caller below routes through it instead of re-deriving
// its own answer. Programs and meditations are untouched: they keep
// their own existing, already-correct sources (lib/programProgress.ts;
// meditation's real saved position) — nothing here applies to them.
//
// Deliberately dependency-free (only a type import, erased at runtime):
// `guides`/`countGuideSections` stay the caller's own concern (every
// caller already imports them for its own rendering anyway) rather than
// this file reaching into data/guides.ts itself — keeps this a small,
// pure logic layer that's trivial to unit test in isolation.

import type { Enrollment, EnrollmentStatus } from "../data/participantDashboard.ts";

export type GuideStatus = "not_started" | "in_progress" | "completed";

// Pure arithmetic — no I/O. `totalSections` only ever counts a guide's
// real sections (data/guideBlocks.ts's countGuideSections, heading-
// grouped); there is no "required vs optional section" concept anywhere
// in the guide content model today (unlike a program's items), so every
// counted section counts toward completion — nothing optional to
// exclude.
export function getGuideStatus(totalSections: number, viewedSections: number): GuideStatus | null {
  // A guide with no structured content (a plain-PDF guide) has nothing
  // to derive a real status from — null tells the caller to fall back
  // to whatever coarser signal it already had (the static enrollment
  // status), exactly as before this fix for that case.
  if (totalSections <= 0) return null;
  const viewed = Math.max(0, Math.min(viewedSections, totalSections));
  if (viewed === 0) return "not_started";
  return viewed >= totalSections ? "completed" : "in_progress";
}

// Maps the real 3-state guide status onto the coarser 2-state
// EnrollmentStatus every non-guide-aware piece of Dashboard logic
// already understands. "Not started yet" still reads as "in-progress"
// at that level — the person owns it, they just haven't opened a
// section yet, same as a freshly-purchased program sitting at 0%.
export function guideStatusToEnrollmentStatus(status: GuideStatus): EnrollmentStatus {
  return status === "completed" ? "completed" : "in-progress";
}

// The actual integration point: returns a NEW array — never mutates
// `source`, so this creates no new mock data and changes nothing about
// programs/meditations — where every GUIDE entry's `status` reflects
// its real section-view completion whenever that's knowable (structured
// content + section counts already fetched). Programs and meditations
// pass through completely unchanged by construction (the
// `e.kind !== "guide"` branch below), and a guide without structured
// content, or before its section counts have loaded (`sectionCounts`
// still `{}`), also passes through unchanged — same "not confirmed yet,
// don't guess" rule this app already uses for meditation's own real
// position (see ParticipantLearning's realStoppedSeconds comment).
//
// `totalSectionsFor` is the caller's own `countGuideSections(guide?.content)`
// lookup — see the file header on why this file doesn't import
// data/guides.ts itself.
//
// Every Dashboard/Моє навчання decision that reads a guide's
// completed/in-progress/unfinished/available-to-continue state should
// run its `enrollments` source through this once, rather than each
// re-deriving its own answer.
//
// Also corrects `progressPercent` to the real viewed/total ratio, not
// just `status` — dashboardPriority.ts's countOtherUnfinished (the
// "Ще N незавершених матеріалів" count) and pickContinueEnrollment's
// recency tiebreak both read that static field as their own "genuinely
// started, not just purchased" signal. Leaving it at its old static
// value (often 0 in the demo data) would make a really-in-progress
// guide invisible to that count even with `status` corrected — this
// keeps both fields consistent with the same real numbers instead of
// fixing one and leaving the other stale.
export function withRealGuideStatus(
  source: Enrollment[],
  sectionCounts: Record<string, number>,
  totalSectionsFor: (guideId: string) => number
): Enrollment[] {
  return source.map((e) => {
    if (e.kind !== "guide") return e;
    const total = totalSectionsFor(e.contentId);
    const viewed = sectionCounts[e.contentId] ?? 0;
    const real = getGuideStatus(total, viewed);
    if (real === null) return e;
    const status = guideStatusToEnrollmentStatus(real);
    const progressPercent = Math.round((Math.max(0, Math.min(viewed, total)) / total) * 100);
    if (status === e.status && progressPercent === e.progressPercent) return e;
    return { ...e, status, progressPercent };
  });
}
