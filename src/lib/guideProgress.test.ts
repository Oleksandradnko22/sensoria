import { test } from "node:test";
import assert from "node:assert/strict";
import { getGuideStatus, guideStatusToEnrollmentStatus, withRealGuideStatus } from "./guideProgress.ts";
import type { Enrollment } from "../data/participantDashboard.ts";

test("0 viewed sections out of N → not_started", () => {
  assert.equal(getGuideStatus(5, 0), "not_started");
});

test("1 viewed section out of N (N>1) → in_progress", () => {
  assert.equal(getGuideStatus(5, 1), "in_progress");
});

test("N-1 viewed sections out of N → still in_progress, not completed", () => {
  assert.equal(getGuideStatus(5, 4), "in_progress");
});

test("N viewed sections out of N → completed", () => {
  assert.equal(getGuideStatus(5, 5), "completed");
});

test("a guide with no structured content (0 total sections) has no real status — null, not a guess", () => {
  assert.equal(getGuideStatus(0, 0), null);
});

test("a viewed count above the total (stale/inconsistent data) is clamped, never reads as more than completed", () => {
  assert.equal(getGuideStatus(5, 9), "completed");
});

test("a negative viewed count (defensive) is clamped to not_started, not a crash", () => {
  assert.equal(getGuideStatus(5, -3), "not_started");
});

test("guideStatusToEnrollmentStatus: not_started and in_progress both read as in-progress", () => {
  assert.equal(guideStatusToEnrollmentStatus("not_started"), "in-progress");
  assert.equal(guideStatusToEnrollmentStatus("in_progress"), "in-progress");
});

test("guideStatusToEnrollmentStatus: completed reads as completed", () => {
  assert.equal(guideStatusToEnrollmentStatus("completed"), "completed");
});

function makeEnrollment(overrides: Partial<Enrollment>): Enrollment {
  return {
    contentId: "x",
    kind: "guide",
    progressPercent: 0,
    status: "in-progress",
    purchasedAt: "2026-01-01",
    lastAccessedAt: "2026-01-02",
    ...overrides,
  };
}

const totalSectionsFor = (guideId: string) => (guideId === "structured-guide" ? 5 : 0);

test("withRealGuideStatus never touches program or meditation entries", () => {
  const source: Enrollment[] = [
    makeEnrollment({ contentId: "p1", kind: "program", status: "in-progress", progressPercent: 40 }),
    makeEnrollment({ contentId: "m1", kind: "meditation", status: "completed", progressPercent: 100 }),
  ];
  const result = withRealGuideStatus(source, {}, totalSectionsFor);
  assert.equal(result[0].status, "in-progress");
  assert.equal(result[0].progressPercent, 40);
  assert.equal(result[1].status, "completed");
});

test("withRealGuideStatus corrects a guide to completed once every real section is viewed", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "structured-guide", status: "in-progress" })];
  const result = withRealGuideStatus(source, { "structured-guide": 5 }, totalSectionsFor);
  assert.equal(result[0].status, "completed");
});

test("withRealGuideStatus keeps a guide in-progress at N-1 of N views, even if that guide is genuinely the last unfinished item", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "structured-guide", status: "in-progress" })];
  const result = withRealGuideStatus(source, { "structured-guide": 4 }, totalSectionsFor);
  assert.equal(result[0].status, "in-progress");
});

test("withRealGuideStatus leaves status as in-progress with 0 real views, even if the static demo field said completed", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "structured-guide", status: "completed" })];
  const result = withRealGuideStatus(source, {}, totalSectionsFor);
  assert.equal(result[0].status, "in-progress");
});

test("withRealGuideStatus leaves a plain-PDF guide (0 total sections) untouched — nothing real to derive from", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "plain-pdf-guide", status: "completed" })];
  const result = withRealGuideStatus(source, { "plain-pdf-guide": 3 }, totalSectionsFor);
  assert.equal(result[0].status, "completed");
});

test("withRealGuideStatus doesn't mutate the input array", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "structured-guide", status: "in-progress" })];
  const before = JSON.stringify(source);
  withRealGuideStatus(source, { "structured-guide": 5 }, totalSectionsFor);
  assert.equal(JSON.stringify(source), before);
});

test("withRealGuideStatus also corrects progressPercent to the real viewed/total ratio", () => {
  // dashboardPriority.ts's countOtherUnfinished reads progressPercent as
  // its own "genuinely started" signal — this has to move together with
  // status, or a really-in-progress guide stays invisible to that count.
  const source: Enrollment[] = [
    makeEnrollment({ contentId: "structured-guide", status: "in-progress", progressPercent: 0 }),
  ];
  const result = withRealGuideStatus(source, { "structured-guide": 1 }, totalSectionsFor);
  assert.equal(result[0].progressPercent, 20); // 1 of 5 sections
});
