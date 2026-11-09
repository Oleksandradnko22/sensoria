import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildProgramLearningItems,
  countOtherUnfinishedPrograms,
  deriveProgramActivityState,
  type ProgramActivityRow,
} from "./programParticipation.ts";
import type { ContentModule } from "../data/contentTypes.ts";

// One required + one optional item, same shape used across the
// program-state test suites (contentProgress.test.ts,
// demoProgressStore.test.ts) — kept minimal since this file is only
// testing the assembler layer on top of computeProgress, not
// computeProgress itself.
const modules: ContentModule[] = [
  {
    id: "m1",
    title: "Module 1",
    description: "",
    items: [
      { id: "req1", title: "Required 1", type: "text", isRequired: true },
      { id: "opt1", title: "Optional 1", type: "text", isRequired: false },
    ],
  },
];

const resolveModules = (contentId: string): ContentModule[] | null =>
  contentId === "prog-a" || contentId === "prog-b" ? modules : null;

function activityRow(contentId: string, progress: Record<string, string>, updatedAt = "2026-09-20T10:00:00.000Z"): ProgramActivityRow {
  return { contentId, progress: progress as ProgramActivityRow["progress"], updatedAt };
}

test("no activity + no saves -> empty program Learning list", () => {
  const items = buildProgramLearningItems([], new Set(), resolveModules);
  assert.deepEqual(items, []);
});

test("activity on a program -> program appears", () => {
  const items = buildProgramLearningItems([activityRow("prog-a", { req1: "in_progress" })], new Set(), resolveModules);
  assert.equal(items.length, 1);
  assert.equal(items[0].contentId, "prog-a");
});

test("activity with state in_progress and percent 0 -> status in-progress (IN_PROGRESS + 0% is valid)", () => {
  const items = buildProgramLearningItems([activityRow("prog-a", { req1: "in_progress" })], new Set(), resolveModules);
  assert.equal(items[0].status, "in-progress");
  assert.equal(items[0].enrollment?.progressPercent, 0);
});

test("activity with completed state -> status completed", () => {
  const items = buildProgramLearningItems([activityRow("prog-a", { req1: "completed" })], new Set(), resolveModules);
  assert.equal(items[0].status, "completed");
  assert.equal(items[0].enrollment?.progressPercent, 100);
});

test("saved-only -> appears, status saved, saved flag true", () => {
  const items = buildProgramLearningItems([], new Set(["prog-a"]), resolveModules);
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "saved");
  assert.equal(items[0].saved, true);
  assert.equal(items[0].enrollment, undefined);
});

test("saved-only -> does not appear as in-progress", () => {
  const items = buildProgramLearningItems([], new Set(["prog-a"]), resolveModules);
  assert.notEqual(items[0].status, "in-progress");
});

test("saved-only -> does not appear as completed", () => {
  const items = buildProgramLearningItems([], new Set(["prog-a"]), resolveModules);
  assert.notEqual(items[0].status, "completed");
});

test("started + saved -> exactly one item, status in-progress, saved true", () => {
  const items = buildProgramLearningItems(
    [activityRow("prog-a", { req1: "in_progress" })],
    new Set(["prog-a"]),
    resolveModules
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "in-progress");
  assert.equal(items[0].saved, true);
});

test("completed + saved -> exactly one item, status completed, saved true", () => {
  const items = buildProgramLearningItems(
    [activityRow("prog-a", { req1: "completed" })],
    new Set(["prog-a"]),
    resolveModules
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "completed");
  assert.equal(items[0].saved, true);
});

test("started then unsaved -> remains in-progress, saved false", () => {
  const items = buildProgramLearningItems(
    [activityRow("prog-a", { req1: "in_progress" })],
    new Set(), // no save row anymore
    resolveModules
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "in-progress");
  assert.equal(items[0].saved, false);
});

test("completed then unsaved -> remains completed, saved false", () => {
  const items = buildProgramLearningItems(
    [activityRow("prog-a", { req1: "completed" })],
    new Set(),
    resolveModules
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "completed");
  assert.equal(items[0].saved, false);
});

test("duplicate activity + save source -> exactly one program item", () => {
  const items = buildProgramLearningItems(
    [activityRow("prog-a", { req1: "in_progress" })],
    new Set(["prog-a", "prog-b"]),
    resolveModules
  );
  // prog-a: activity + saved -> one item. prog-b: saved-only -> one item.
  assert.equal(items.length, 2);
  assert.equal(items.filter((i) => i.contentId === "prog-a").length, 1);
});

test("empty/all-not-started progress row -> does not count as activity membership", () => {
  const items = buildProgramLearningItems([activityRow("prog-a", {})], new Set(), resolveModules);
  assert.deepEqual(items, []);
});

test("optional-only activity -> state semantics preserved from computeProgress (in_progress, 0%)", () => {
  const items = buildProgramLearningItems([activityRow("prog-a", { opt1: "completed" })], new Set(), resolveModules);
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "in-progress");
  assert.equal(items[0].enrollment?.progressPercent, 0);
});

test("demo program with real activity absent does not appear just because a caller might pass its id as saved elsewhere", () => {
  // No activity, no save for "prog-a" at all -> assembler produces
  // nothing for it, regardless of any static/demo array the caller
  // might separately have — this function never reads one.
  const items = buildProgramLearningItems([], new Set(), resolveModules);
  assert.deepEqual(items.filter((i) => i.contentId === "prog-a"), []);
});

test("new real authored program (no local module structure yet): activity present -> appears via raw-map fallback, capped at in_progress", () => {
  const items = buildProgramLearningItems(
    [activityRow("real-prog-1", { itemX: "completed" })],
    new Set(),
    resolveModules // returns null for "real-prog-1" — no structure resolved yet
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].contentId, "real-prog-1");
  // Never over-claims completion without knowing the required-item list.
  assert.equal(items[0].status, "in-progress");
});

test("new real authored program: saved only -> appears correctly", () => {
  const items = buildProgramLearningItems([], new Set(["real-prog-2"]), resolveModules);
  assert.equal(items.length, 1);
  assert.equal(items[0].contentId, "real-prog-2");
  assert.equal(items[0].status, "saved");
  assert.equal(items[0].saved, true);
});

test("raw-map fallback never counts an all-not_started map as activity", () => {
  const items = buildProgramLearningItems(
    [activityRow("real-prog-3", { itemX: "not_started" })],
    new Set(),
    resolveModules
  );
  assert.deepEqual(items, []);
});

// --- deriveProgramActivityState (2026-09-21, Overview/Program Preview/
// Emotional Profile follow-up) — exported directly so every real
// per-program lookup in the app can share this one derivation instead
// of re-deriving its own answer. buildProgramLearningItems' own tests
// above already exercise it indirectly; these test it directly, the
// shape a single-program caller (e.g. ProgramDetailPage) actually
// uses it in.

test("deriveProgramActivityState: resolved modules -> real computeProgress state/percent", () => {
  const result = deriveProgramActivityState("prog-a", { req1: "completed" }, resolveModules);
  assert.equal(result.state, "completed");
  assert.equal(result.percent, 100);
});

test("deriveProgramActivityState: resolved modules, required in progress -> in_progress, 0%", () => {
  const result = deriveProgramActivityState("prog-a", { req1: "in_progress" }, resolveModules);
  assert.equal(result.state, "in_progress");
  assert.equal(result.percent, 0);
});

test("deriveProgramActivityState: no structure resolved yet, some non-not_started value -> in_progress via raw-scan fallback", () => {
  const result = deriveProgramActivityState("real-prog-x", { itemX: "completed" }, resolveModules);
  assert.equal(result.state, "in_progress");
  assert.equal(result.percent, 0);
});

test("deriveProgramActivityState: no structure resolved yet, all not_started -> not_started, never fabricates completion", () => {
  const result = deriveProgramActivityState("real-prog-x", { itemX: "not_started" }, resolveModules);
  assert.equal(result.state, "not_started");
});

test("deriveProgramActivityState: no structure resolved yet, empty map -> not_started", () => {
  const result = deriveProgramActivityState("real-prog-x", {}, resolveModules);
  assert.equal(result.state, "not_started");
});

// --- countOtherUnfinishedPrograms (2026-09-21, Overview follow-up) —
// the program-only equivalent of lib/dashboardPriority.ts's
// countOtherUnfinished, gated on real `status` (never `percent > 0`,
// since a real IN_PROGRESS + 0% program must still count).

test("countOtherUnfinishedPrograms: counts other in-progress programs, excludes the primary", () => {
  const items = buildProgramLearningItems(
    [activityRow("prog-a", { req1: "in_progress" }), activityRow("prog-b", { req1: "in_progress" })],
    new Set(),
    resolveModules
  );
  assert.equal(countOtherUnfinishedPrograms(items, "prog-a"), 1);
});

test("countOtherUnfinishedPrograms: excludeContentId null counts every in-progress program", () => {
  const items = buildProgramLearningItems(
    [activityRow("prog-a", { req1: "in_progress" }), activityRow("prog-b", { req1: "in_progress" })],
    new Set(),
    resolveModules
  );
  assert.equal(countOtherUnfinishedPrograms(items, null), 2);
});

test("countOtherUnfinishedPrograms: a real IN_PROGRESS + 0% program still counts (never percent-gated)", () => {
  const items = buildProgramLearningItems([activityRow("prog-a", { req1: "in_progress" })], new Set(), resolveModules);
  assert.equal(items[0].enrollment?.progressPercent, 0);
  assert.equal(countOtherUnfinishedPrograms(items, null), 1);
});

test("countOtherUnfinishedPrograms: completed programs are excluded", () => {
  const items = buildProgramLearningItems([activityRow("prog-a", { req1: "completed" })], new Set(), resolveModules);
  assert.equal(countOtherUnfinishedPrograms(items, null), 0);
});

test("countOtherUnfinishedPrograms: saved-only programs are excluded", () => {
  const items = buildProgramLearningItems([], new Set(["prog-a"]), resolveModules);
  assert.equal(countOtherUnfinishedPrograms(items, null), 0);
});

test("countOtherUnfinishedPrograms: no items -> 0", () => {
  assert.equal(countOtherUnfinishedPrograms([], null), 0);
});

test("a program added from the cart shows up at 0% and never duplicates real activity", () => {
  const items = buildProgramLearningItems([activityRow("prog-a", { req1: "in_progress" })], new Set(["prog-c"]), resolveModules, new Set(["prog-a", "prog-b", "prog-c"]));
  assert.deepEqual(items.map((i) => [i.contentId, i.status]), [["prog-a", "in-progress"], ["prog-b", "in-progress"], ["prog-c", "in-progress"]]);
  const b = items.find((i) => i.contentId === "prog-b")!;
  assert.equal(b.enrollment?.progressPercent, 0);
  assert.equal(b.saved, false);
  assert.equal(items.find((i) => i.contentId === "prog-c")!.saved, true);
});
