import { test } from "node:test";
import assert from "node:assert/strict";
import { withRealProgramStatus } from "./programStatus.ts";
import type { Enrollment } from "../data/participantDashboard.ts";
import type { ProgramProgressSummary } from "../data/contentTypes.ts";

function makeEnrollment(overrides: Partial<Enrollment>): Enrollment {
  return {
    contentId: "x",
    kind: "program",
    progressPercent: 0,
    status: "in-progress",
    purchasedAt: "2026-01-01",
    lastAccessedAt: "2026-01-02",
    ...overrides,
  };
}

function makeProgress(overrides: Partial<ProgramProgressSummary>): ProgramProgressSummary {
  return {
    totalItems: 10,
    requiredItems: 10,
    completedRequiredItems: 0,
    percent: 0,
    totalModules: 5,
    currentModuleIndex: 0,
    currentItemIndex: 0,
    isCompleted: false,
    ...overrides,
  };
}

test("withRealProgramStatus never touches guide or meditation entries", () => {
  const source: Enrollment[] = [
    makeEnrollment({ contentId: "g1", kind: "guide", status: "in-progress", progressPercent: 40 }),
    makeEnrollment({ contentId: "m1", kind: "meditation", status: "completed", progressPercent: 100 }),
  ];
  const result = withRealProgramStatus(source, () => makeProgress({ isCompleted: true, percent: 100 }));
  assert.equal(result[0].status, "in-progress");
  assert.equal(result[0].progressPercent, 40);
  assert.equal(result[1].status, "completed");
});

test("0 of N real progress reads as in-progress (not started is still in-progress, per existing enrollment semantics)", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "p1", status: "in-progress", progressPercent: 0 })];
  const result = withRealProgramStatus(source, () => makeProgress({ completedRequiredItems: 0, percent: 0, isCompleted: false }));
  assert.equal(result[0].status, "in-progress");
  assert.equal(result[0].progressPercent, 0);
});

test("partial real progress (N-1 of N) stays in-progress, never completed", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "p1", status: "in-progress" })];
  const result = withRealProgramStatus(
    source,
    () => makeProgress({ completedRequiredItems: 9, requiredItems: 10, percent: 90, isCompleted: false })
  );
  assert.equal(result[0].status, "in-progress");
  assert.equal(result[0].progressPercent, 90);
});

test("real progress at N of N corrects status to completed, even if the static field said in-progress", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "p1", status: "in-progress", progressPercent: 40 })];
  const result = withRealProgramStatus(
    source,
    () => makeProgress({ completedRequiredItems: 10, requiredItems: 10, percent: 100, isCompleted: true })
  );
  assert.equal(result[0].status, "completed");
  assert.equal(result[0].progressPercent, 100);
});

test("a program genuinely finished via the real per-item engine is corrected even if the static enrollment.status never moved — the exact bug this fix closes", () => {
  // Mirrors data/programModules.ts's real shape: enrollments never gets
  // written back to at runtime, only utils/demoProgressStore.ts does.
  const source: Enrollment[] = [
    makeEnrollment({ contentId: "mindfulness-course", status: "in-progress", progressPercent: 67 }),
  ];
  const result = withRealProgramStatus(source, (id) =>
    id === "mindfulness-course" ? makeProgress({ isCompleted: true, percent: 100 }) : null
  );
  assert.equal(result[0].status, "completed");
});

test("no module data for this program (getProgress returns null) leaves the enrollment untouched", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "real-authored-program", status: "completed", progressPercent: 100 })];
  const result = withRealProgramStatus(source, () => null);
  assert.equal(result[0].status, "completed");
  assert.equal(result[0].progressPercent, 100);
  assert.equal(result[0], source[0]); // same reference — genuinely untouched, not just equal
});

test("withRealProgramStatus doesn't mutate the input array or its entries", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "p1", status: "in-progress", progressPercent: 40 })];
  const before = JSON.stringify(source);
  withRealProgramStatus(source, () => makeProgress({ isCompleted: true, percent: 100 }));
  assert.equal(JSON.stringify(source), before);
});

test("an entry that already agrees with the real progress is returned by the same reference (no unnecessary new object)", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "p1", status: "completed", progressPercent: 100 })];
  const result = withRealProgramStatus(source, () => makeProgress({ isCompleted: true, percent: 100 }));
  assert.equal(result[0], source[0]);
});
