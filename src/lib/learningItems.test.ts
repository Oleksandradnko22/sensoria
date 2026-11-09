import { test } from "node:test";
import assert from "node:assert/strict";
import { combineByType } from "./learningItems.ts";
import type { Enrollment, SavedItem } from "../data/participantDashboard.ts";

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

test("an owned (enrolled) program is returned with its real status, not as saved", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "p1", kind: "program", status: "in-progress" })];
  const result = combineByType("program", new Set(), source, []);
  assert.deepEqual(
    result.map((i) => [i.contentId, i.status]),
    [["p1", "in-progress"]]
  );
});

// Programs read real saved state from realSavedIds (lib/programSaves.ts),
// never from the static savedItems array — same 2026-09-21 fix that
// generalized the guide-only branch below to cover programs too.
test("a saved-only program (no enrollment at all) is returned with status saved", () => {
  const result = combineByType("program", new Set(["p2"]), [], []);
  assert.deepEqual(
    result.map((i) => [i.contentId, i.status]),
    [["p2", "saved"]]
  );
});

test("owned + saved for the SAME content id never produces two rows — ownership wins, no duplicate", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "p1", kind: "program", status: "completed" })];
  const result = combineByType("program", new Set(["p1"]), source, []);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, "completed");
});

test("in-progress + saved (different items) both appear, each with its own real status", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "p1", kind: "program", status: "in-progress" })];
  const result = combineByType("program", new Set(["p2"]), source, []);
  assert.deepEqual(
    result.map((i) => [i.contentId, i.status]).sort(),
    [
      ["p1", "in-progress"],
      ["p2", "saved"],
    ]
  );
});

test("a saved program's static savedItems entry is ignored — programs never read savedItems anymore", () => {
  const saved: SavedItem[] = [{ contentId: "p3", kind: "program" }];
  const result = combineByType("program", new Set(), [], saved);
  assert.deepEqual(result, []);
});

test("a program that's both enrolled and separately saved (realSavedIds) still produces one row with its real enrollment status", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "p1", kind: "program", status: "in-progress" })];
  const result = combineByType("program", new Set(["p1"]), source, []);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, "in-progress");
});

// Explicit independence checks (Issue 1, requirement #6): saved/
// enrolled/started/completed never influence each other through this
// function — saving an already-completed program still shows its real
// "completed" status (not "saved"), and a program with no enrollment at
// all reads as "saved", never "not_started"/anything progress-shaped.
test("saving an already-completed program does not downgrade its status to saved", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "p1", kind: "program", status: "completed" })];
  const result = combineByType("program", new Set(["p1"]), source, []);
  assert.equal(result[0].status, "completed");
});

test("saving an already-in-progress program does not downgrade its status to saved", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "p1", kind: "program", status: "in-progress" })];
  const result = combineByType("program", new Set(["p1"]), source, []);
  assert.equal(result[0].status, "in-progress");
});

test("guides read saved state from realSavedGuideIds, never from the savedItems array", () => {
  const saved: SavedItem[] = [{ contentId: "should-be-ignored", kind: "guide" }];
  const result = combineByType("guide", new Set(["g1"]), [], saved);
  assert.deepEqual(
    result.map((i) => i.contentId),
    ["g1"]
  );
});

test("a guide that's both enrolled and separately bookmarked (realSavedGuideIds) still produces one row with its real enrollment status", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "g1", kind: "guide", status: "completed" })];
  const result = combineByType("guide", new Set(["g1"]), source, []);
  assert.equal(result.length, 1);
  assert.equal(result[0].status, "completed");
});

test("no relevant content at all returns an empty list, never undefined/throws", () => {
  const result = combineByType("meditation", new Set(), [], []);
  assert.deepEqual(result, []);
});

test("only wrong-kind entries in enrollments/saved are excluded — never leaks across content kinds", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "m1", kind: "meditation", status: "in-progress" })];
  const saved: SavedItem[] = [{ contentId: "g1", kind: "guide" }];
  const result = combineByType("program", new Set(), source, saved);
  assert.deepEqual(result, []);
});

test("filters correctly by kind independently — meditations don't see program's saved/owned rows", () => {
  const source: Enrollment[] = [
    makeEnrollment({ contentId: "p1", kind: "program", status: "in-progress" }),
    makeEnrollment({ contentId: "m1", kind: "meditation", status: "completed" }),
  ];
  const programResult = combineByType("program", new Set(), source, []);
  const meditationResult = combineByType("meditation", new Set(), source, []);
  assert.deepEqual(programResult.map((i) => i.contentId), ["p1"]);
  assert.deepEqual(meditationResult.map((i) => i.contentId), ["m1"]);
});

// "Збережені" (Issue 1, requirement #10): unsaving a program removes it
// from the list, exactly mirroring the id being dropped from
// realSavedIds — this is what a real unsave (lib/programSaves.ts's
// removeSavedProgram, followed by dropping the id from the component's
// own Set) looks like from combineByType's point of view.
test("removing an id from realSavedIds (unsaving) makes the program disappear — no enrollment left to fall back to", () => {
  const beforeUnsave = combineByType("program", new Set(["p1"]), [], []);
  assert.deepEqual(beforeUnsave.map((i) => i.contentId), ["p1"]);
  const afterUnsave = combineByType("program", new Set(), [], []);
  assert.deepEqual(afterUnsave, []);
});

test("does not mutate the source enrollments or savedItems arrays", () => {
  const source: Enrollment[] = [makeEnrollment({ contentId: "p1", kind: "program", status: "in-progress" })];
  const saved: SavedItem[] = [{ contentId: "p2", kind: "program" }];
  const sourceBefore = JSON.stringify(source);
  const savedBefore = JSON.stringify(saved);
  combineByType("program", new Set(), source, saved);
  assert.equal(JSON.stringify(source), sourceBefore);
  assert.equal(JSON.stringify(saved), savedBefore);
});
