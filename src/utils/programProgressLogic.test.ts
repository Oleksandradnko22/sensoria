import { test } from "node:test";
import assert from "node:assert/strict";
import { applyComplete, applyOpen, applySkip, mergeServerProgress } from "./programProgressLogic.ts";
import type { ContentModule, ItemProgressMap } from "../data/contentTypes.ts";

const modules: ContentModule[] = [
  {
    id: "m1",
    title: "M1",
    description: "",
    items: [
      { id: "a", title: "A", type: "text", isRequired: true },
      { id: "b", title: "B", type: "text", isRequired: true },
      { id: "opt", title: "Optional", type: "text", isRequired: false },
    ],
  },
];

test("opening an untouched lesson makes it in_progress", () => {
  assert.deepEqual(applyOpen({}, "a"), { a: "in_progress" });
  assert.deepEqual(applyOpen({ a: "not_started" }, "a"), { a: "in_progress" });
});

test("opening never downgrades and reports no change", () => {
  for (const status of ["in_progress", "completed", "skipped"] as const) {
    assert.equal(applyOpen({ a: status }, "a"), null, status);
  }
});

test("opening keeps the other lessons as they were and does not mutate", () => {
  const before: ItemProgressMap = { a: "completed" };
  const frozen = JSON.stringify(before);
  const next = applyOpen(before, "b");
  assert.deepEqual(next, { a: "completed", b: "in_progress" });
  assert.equal(JSON.stringify(before), frozen);
});

test("completing marks the lesson completed", () => {
  const { next } = applyComplete({ a: "in_progress" }, "a", modules);
  assert.equal(next.a, "completed");
});

test("completing the last required lesson reports the program as completed", () => {
  const first = applyComplete({}, "a", modules);
  assert.equal(first.programCompleted, false);
  const last = applyComplete(first.next, "b", modules);
  assert.equal(last.programCompleted, true);
});

test("an untouched optional lesson does not block program completion", () => {
  const { programCompleted } = applyComplete({ a: "completed" }, "b", modules);
  assert.equal(programCompleted, true);
});

test("completion is computed on the new map, not the old one", () => {
  const old: ItemProgressMap = { a: "completed" };
  const { programCompleted } = applyComplete(old, "b", modules);
  assert.equal(programCompleted, true);
  assert.deepEqual(old, { a: "completed" });
});

test("skipping marks skipped and counts as resolved for completion", () => {
  assert.deepEqual(applySkip({}, "a"), { a: "skipped" });
  const { programCompleted } = applyComplete({ a: "skipped" }, "b", modules);
  assert.equal(programCompleted, true);
});

test("merge: no server copy means no change", () => {
  assert.equal(mergeServerProgress({ a: "completed" }, null), null);
  assert.equal(mergeServerProgress({ a: "completed" }, undefined), null);
});

test("merge: a server copy that changes nothing means no write", () => {
  assert.equal(mergeServerProgress({ a: "completed", b: "in_progress" }, { a: "in_progress" }), null);
  assert.equal(mergeServerProgress({ a: "completed" }, {}), null);
});

test("merge: higher status wins, lessons known to one side survive", () => {
  const merged = mergeServerProgress({ a: "in_progress" }, { a: "completed", b: "skipped" });
  assert.deepEqual(merged, { a: "completed", b: "skipped" });
});

test("merge: a stale server copy never moves a lesson backwards", () => {
  assert.equal(mergeServerProgress({ a: "completed" }, { a: "not_started" }), null);
});
