// Single source of truth for a PROGRAM's real completion status
// (2026-09-16 technical audit — ParticipantLearning/Overview). Same
// non-mutating correction pattern as lib/guideProgress.ts's
// withRealGuideStatus, and for the exact same reason: `enrollments` is
// a static demo array (see data/participantDashboard.ts's own header —
// this is a known, accepted limitation this fix does NOT try to
// solve), but real per-item progress for a program with authored
// module data (data/programModules.ts) genuinely advances at runtime
// via utils/demoProgressStore.ts (localStorage) every time someone
// completes an item in ProgramExperience.tsx. Before this, a program
// finished for real through the actual player could keep reading as
// "in-progress" forever on "Моє навчання"/Overview/the continue block —
// their `isCompleted`/status/CTA/filter logic all read the static
// `enrollment.status` field directly, which nothing ever writes back
// to. ProgramExperience.tsx itself never had this problem — it already
// reads `computeProgress(...).isCompleted` exclusively, never
// `enrollment.status` (see its own ctaLabel/summary usage).
//
// Deliberately its own dependency-free module, same reasoning as
// lib/guideProgress.ts's own header comment: `getProgress` is REQUIRED
// (not defaulted to lib/programProgress.ts's real getProgramProgress)
// specifically so importing this file never pulls in that file's own
// value imports (data/programModules.ts -> utils/demoProgressStore.ts),
// which use extension-less relative imports that `node
// --experimental-strip-types --test` cannot resolve. Every real call
// site just passes lib/programProgress.ts's getProgramProgress
// explicitly — one extra argument, in exchange for this function being
// trivially unit-testable with synthetic data.
import type { Enrollment, EnrollmentStatus } from "../data/participantDashboard.ts";
import type { ProgramProgressSummary } from "../data/contentTypes.ts";

// A program with no authored module data (a real, author-created
// program without a programModules entry — see that file's own header)
// has nothing real to correct from, so it passes through unchanged,
// exactly like a plain-PDF guide in withRealGuideStatus.
export function withRealProgramStatus(
  source: Enrollment[],
  getProgress: (contentId: string) => ProgramProgressSummary | null
): Enrollment[] {
  return source.map((e) => {
    if (e.kind !== "program") return e;
    const progress = getProgress(e.contentId);
    if (!progress) return e;
    const status: EnrollmentStatus = progress.isCompleted ? "completed" : "in-progress";
    if (status === e.status && progress.percent === e.progressPercent) return e;
    return { ...e, status, progressPercent: progress.percent };
  });
}
