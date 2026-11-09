import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeProgress } from "./mergeProgress.ts";
import type { ItemProgressMap } from "../data/contentTypes.ts";

// 2026-09-29 technical audit: this pure function is the ONLY thing that
// decides whether a stale local device can clobber a newer server
// state (or vice versa) when a program is opened — see
// contentProgressSync.ts's merge-on-open effect in ProgramExperience.tsx.
// It had no dedicated test file despite being exactly the kind of "real
// bug lives here" surface the rest of the progress engine is already
// covered for. Rank order per mergeProgress.ts: not_started(0) <
// in_progress(1) < skipped(2) < completed(3).

test("merge: higher-rank status on the server side wins over a lower-rank local status", () => {
  const local: ItemProgressMap = { i1: "not_started" };
  const server: ItemProgressMap = { i1: "completed" };
  assert.deepEqual(mergeProgress(local, server), { i1: "completed" });
});

test("merge: higher-rank status on the local side wins over a lower-rank (stale) server status", () => {
  // e.g. this device already completed the item; the server fetch is a
  // slightly-stale snapshot that only saw in_progress. Local must not
  // regress.
  const local: ItemProgressMap = { i1: "completed" };
  const server: ItemProgressMap = { i1: "in_progress" };
  assert.deepEqual(mergeProgress(local, server), { i1: "completed" });
});

test("merge: in_progress never overwrites completed regardless of which side it comes from", () => {
  assert.equal(mergeProgress({ i1: "completed" }, { i1: "in_progress" }).i1, "completed");
  assert.equal(mergeProgress({ i1: "in_progress" }, { i1: "completed" }).i1, "completed");
});

test("merge: skipped ranks above in_progress/not_started but below completed", () => {
  assert.equal(mergeProgress({ i1: "in_progress" }, { i1: "skipped" }).i1, "skipped");
  assert.equal(mergeProgress({ i1: "skipped" }, { i1: "in_progress" }).i1, "skipped");
  assert.equal(mergeProgress({ i1: "skipped" }, { i1: "completed" }).i1, "completed");
  assert.equal(mergeProgress({ i1: "completed" }, { i1: "skipped" }).i1, "completed");
});

test("merge: an item only one side has ever touched survives the merge untouched", () => {
  const local: ItemProgressMap = { i1: "completed" };
  const server: ItemProgressMap = { i2: "in_progress" };
  assert.deepEqual(mergeProgress(local, server), { i1: "completed", i2: "in_progress" });
});

test("merge: is a union over the whole item set, not just keys present on one side", () => {
  const local: ItemProgressMap = { i1: "completed", i2: "not_started" };
  const server: ItemProgressMap = { i2: "in_progress", i3: "completed" };
  assert.deepEqual(mergeProgress(local, server), {
    i1: "completed",
    i2: "in_progress",
    i3: "completed",
  });
});

test("merge: merging a map with an identical copy of itself is a no-op (idempotent)", () => {
  const progress: ItemProgressMap = { i1: "completed", i2: "in_progress", i3: "not_started" };
  assert.deepEqual(mergeProgress(progress, progress), progress);
});

test("merge: both maps empty produces an empty map", () => {
  assert.deepEqual(mergeProgress({}, {}), {});
});

test("merge: an empty incoming side never erases existing progress", () => {
  const local: ItemProgressMap = { i1: "completed", i2: "in_progress" };
  assert.deepEqual(mergeProgress(local, {}), local);
});

test("merge: an empty local side simply adopts the incoming side wholesale", () => {
  const server: ItemProgressMap = { i1: "completed", i2: "in_progress" };
  assert.deepEqual(mergeProgress({}, server), server);
});

test("merge: does not mutate either input map", () => {
  const local: ItemProgressMap = { i1: "not_started" };
  const server: ItemProgressMap = { i1: "completed" };
  const localSnapshot = { ...local };
  const serverSnapshot = { ...server };
  mergeProgress(local, server);
  assert.deepEqual(local, localSnapshot);
  assert.deepEqual(server, serverSnapshot);
});
