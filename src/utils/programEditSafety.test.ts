import { test } from "node:test";
import assert from "node:assert/strict";
import { affectedLessonIds, analyzeEdit, countParticipantsAffected, describeImpact, hasImpact } from "./programEditSafety.ts";
import type { AuthoredContent, AuthoredItem } from "../data/authorDashboard.ts";

const it = (id: string, over: Partial<AuthoredItem> = {}): AuthoredItem => ({ id, title: `L${id}`, type: "text", isRequired: true, ...over });
const prog = (modules: AuthoredContent["modules"]): AuthoredContent => ({
  id: "c", type: "program", title: "P", status: "published", price: "0", participants: 0, revenue: 0,
  rating: null, reviewsCount: 0, createdAt: "x", updatedAt: "x", modules,
});
const before = prog([
  { id: "m1", title: "M1", lessons: 2, duration: "", items: [it("a"), it("b")] },
  { id: "m2", title: "M2", lessons: 1, duration: "", items: [it("c")] },
]);

test("no change, reorder or rewording: no impact (ids are kept)", () => {
  const after = prog([
    { id: "m2", title: "M2 нова назва", lessons: 1, duration: "", items: [it("c", { title: "інша назва" })] },
    { id: "m1", title: "M1", lessons: 2, duration: "", items: [it("b"), it("a")] },
  ]);
  assert.equal(hasImpact(analyzeEdit(before, after)), false);
});

test("removing a lesson is reported", () => {
  const after = prog([
    { id: "m1", title: "M1", lessons: 1, duration: "", items: [it("a")] },
    { id: "m2", title: "M2", lessons: 1, duration: "", items: [it("c")] },
  ]);
  const i = analyzeEdit(before, after);
  assert.deepEqual(i.removedLessons, [{ id: "b", title: "Lb" }]);
  assert.deepEqual(affectedLessonIds(i), ["b"]);
});

test("removing a module reports it once, with its lessons, not each lesson again", () => {
  const after = prog([{ id: "m1", title: "M1", lessons: 2, duration: "", items: [it("a"), it("b")] }]);
  const i = analyzeEdit(before, after);
  assert.equal(i.removedModules.length, 1);
  assert.deepEqual(i.removedModules[0].lessonIds, ["c"]);
  assert.equal(i.removedLessons.length, 0);
});

test("a lesson replaced by a new one (no id) counts as a removal of the old one", () => {
  const after = prog([
    { id: "m1", title: "M1", lessons: 2, duration: "", items: [it("a"), { title: "Нова", type: "text", isRequired: true }] },
    { id: "m2", title: "M2", lessons: 1, duration: "", items: [it("c")] },
  ]);
  assert.deepEqual(analyzeEdit(before, after).removedLessons.map((l) => l.id), ["b"]);
});

test("flipping required/optional is reported; a derived type change alone is not an impact", () => {
  const after = prog([
    { id: "m1", title: "M1", lessons: 2, duration: "", items: [it("a", { isRequired: false }), it("b", { type: "video" })] },
    { id: "m2", title: "M2", lessons: 1, duration: "", items: [it("c")] },
  ]);
  const i = analyzeEdit(before, after);
  assert.deepEqual(i.requiredFlips, [{ id: "a", title: "La", nowRequired: false }]);
  assert.deepEqual(i.typeChanges, [{ id: "b", title: "Lb", from: "text", to: "video" }]);
  const onlyType = analyzeEdit(before, prog([{ id: "m1", title: "M1", lessons: 2, duration: "", items: [it("a"), it("b", { type: "video" })] }, { id: "m2", title: "M2", lessons: 1, duration: "", items: [it("c")] }]));
  assert.equal(hasImpact(onlyType), false);
});

test("a brand-new program (nothing before) has no impact", () => {
  assert.equal(hasImpact(analyzeEdit(null, before)), false);
});

test("participants affected: only those with a real status on an affected lesson", () => {
  const maps = [{ a: "completed" }, { a: "not_started" }, { z: "completed" }, { b: "in_progress", a: "skipped" }];
  assert.equal(countParticipantsAffected(maps, ["a", "b"]), 2);
  assert.equal(countParticipantsAffected([], ["a"]), 0);
});

test("the confirmation text names the change and the number of people", () => {
  const after = prog([{ id: "m1", title: "M1", lessons: 2, duration: "", items: [it("a")] }]);
  const lines = describeImpact(analyzeEdit(before, after), 3);
  assert.ok(lines.some((l) => l.includes("«M2»")));
  assert.ok(lines.some((l) => l.includes("«Lb»")));
  assert.ok(lines.some((l) => l.includes("3 учасників") || l.includes("3 учасника")));
  assert.equal(describeImpact(analyzeEdit(before, before), 5).length, 1); // only the people line; no change lines
});
