import { test } from "node:test";
import assert from "node:assert/strict";
import { computeProgress, getNextItem, isItemLocked, safePercent } from "./contentProgress.ts";
import type { ContentModule, ItemProgressMap } from "../data/contentTypes.ts";

const modules: ContentModule[] = [
  {
    id: "m1",
    title: "Module 1",
    description: "",
    items: [
      { id: "i1", title: "Item 1", type: "text", isRequired: true },
      { id: "i2", title: "Item 2", type: "text", isRequired: true },
    ],
  },
  {
    id: "m2",
    title: "Module 2",
    description: "",
    items: [{ id: "i3", title: "Item 3", type: "text", isRequired: true }],
  },
];

test("a skipped required item unlocks what comes after it", () => {
  const progress = { i1: "skipped" as const };
  assert.equal(isItemLocked(modules, progress, 0, 1), false);
});

test("a not_started required item still locks what comes after it", () => {
  const progress = {};
  assert.equal(isItemLocked(modules, progress, 0, 1), true);
});

test("getNextItem skips past a resolved (skipped) item to the next unresolved one", () => {
  const progress = { i1: "skipped" as const };
  const next = getNextItem(modules, progress);
  assert.deepEqual(next, { moduleIndex: 0, itemIndex: 1, itemId: "i2", isRequired: true });
});

test("computeProgress counts a skipped item toward completedRequiredItems/percent/isCompleted", () => {
  const progress = { i1: "skipped" as const, i2: "completed" as const, i3: "completed" as const };
  const summary = computeProgress(modules, progress);
  assert.equal(summary.completedRequiredItems, 3);
  assert.equal(summary.requiredItems, 3);
  assert.equal(summary.isCompleted, true);
});

test("computeProgress moves past a skipped item to find the next current position", () => {
  const progress = { i1: "skipped" as const };
  const summary = computeProgress(modules, progress);
  assert.equal(summary.currentModuleIndex, 0);
  assert.equal(summary.currentItemIndex, 1);
});

// safePercent — 2026-09-16 technical audit, finding #1: a bare
// Math.round((done/total)*100) can read 100 while done < total (e.g.
// 199/200 = 99.5% rounds up), silently contradicting an isCompleted/
// moduleDone check computed from the exact same counts. These tests
// pin the invariant that broke: 100 only ever appears in lockstep with
// done >= total.
test("safePercent: 0 of 0 reads 0, not NaN", () => {
  assert.equal(safePercent(0, 0), 0);
});

test("safePercent: 0 of N reads 0", () => {
  assert.equal(safePercent(0, 10), 0);
});

test("safePercent: a normal partial ratio rounds as expected", () => {
  assert.equal(safePercent(5, 10), 50);
  assert.equal(safePercent(9, 10), 90);
});

test("safePercent: 199 of 200 never rounds up to 100 — the exact bug this fix closes", () => {
  assert.equal(safePercent(199, 200), 99);
});

test("safePercent: done === total always reads exactly 100", () => {
  assert.equal(safePercent(200, 200), 100);
  assert.equal(safePercent(1, 1), 100);
});

test("safePercent: done > total (malformed input) still clamps to 100, never over", () => {
  assert.equal(safePercent(12, 10), 100);
});

test("safePercent: negative done reads 0, never negative", () => {
  assert.equal(safePercent(-3, 10), 0);
});

// computeProgress itself, at the same 199/200 boundary that broke
// safePercent above — the field consumers actually read.
function makeLargeModule(total: number): ContentModule {
  const items = Array.from({ length: total }, (_, i) => ({
    id: `item-${i}`,
    title: `Item ${i}`,
    type: "text" as const,
    isRequired: true,
  }));
  return { id: "big", title: "Big module", description: "", items };
}

test("computeProgress: percent cannot read 100 while isCompleted is false, even at a rounding-prone ratio", () => {
  const total = 200;
  const completed = 199;
  const bigModules = [makeLargeModule(total)];
  const progress: ItemProgressMap = {};
  for (let i = 0; i < completed; i++) progress[`item-${i}`] = "completed";
  const summary = computeProgress(bigModules, progress);
  assert.equal(summary.completedRequiredItems, 199);
  assert.equal(summary.requiredItems, 200);
  assert.equal(summary.isCompleted, false);
  assert.notEqual(summary.percent, 100);
  assert.equal(summary.percent, 99);
});

test("computeProgress: percent reads exactly 100 once every required item is actually resolved", () => {
  const total = 200;
  const bigModules = [makeLargeModule(total)];
  const progress: ItemProgressMap = {};
  for (let i = 0; i < total; i++) progress[`item-${i}`] = "completed";
  const summary = computeProgress(bigModules, progress);
  assert.equal(summary.isCompleted, true);
  assert.equal(summary.percent, 100);
});

// Required-only current/continue semantics — 2026-09-16 technical fix.
// PRODUCT DECISION: required content defines the program path, optional
// content is bonus. An unresolved optional item must never determine
// currentModuleIndex/currentItemIndex or become getNextItem's target —
// only computeProgress's own isCompleted/percent were required-only
// before this fix; "current" used to be the one place still matching
// "first unresolved item of any kind". These tests pin the corrected
// behavior at the exact edge cases from the spec (A–G).
const modulesWithOptional: ContentModule[] = [
  {
    id: "m1",
    title: "Module 1",
    description: "",
    items: [
      { id: "r1", title: "Required 1", type: "text", isRequired: true },
      { id: "r2", title: "Required 2", type: "text", isRequired: true },
      { id: "o1", title: "Optional 1", type: "text", isRequired: false },
    ],
  },
  {
    id: "m2",
    title: "Module 2",
    description: "",
    items: [{ id: "r3", title: "Required 3", type: "text", isRequired: true }],
  },
];

// A. Required 0/3, Optional 0/2 (across the two modules) → current is
// the first required item, never the optional one even though nothing
// is resolved yet.
test("edge A: with nothing resolved, current is the first required item, not the optional one", () => {
  const summary = computeProgress(modulesWithOptional, {});
  assert.equal(summary.currentModuleIndex, 0);
  assert.equal(summary.currentItemIndex, 0);
  const next = getNextItem(modulesWithOptional, {});
  assert.equal(next?.itemId, "r1");
  assert.equal(next?.isRequired, true);
});

// B. Required 2/3 (r1 done), Optional 0/2 → current is the remaining
// required item (r2), not o1, even though o1 comes right after r1 in
// module order for some other unresolved-required item elsewhere.
test("edge B: current is the next remaining required item, never the optional one in between", () => {
  const progress: ItemProgressMap = { r1: "completed" };
  const summary = computeProgress(modulesWithOptional, progress);
  assert.equal(summary.currentModuleIndex, 0);
  assert.equal(summary.currentItemIndex, 1);
  const next = getNextItem(modulesWithOptional, progress);
  assert.equal(next?.itemId, "r2");
});

// C + D. Module 1's required items are both done (o1 still untouched);
// module 2 has its own unresolved required item. current must skip
// straight to module 2 — an untouched optional item in an otherwise
// required-complete module must never keep that module "current".
test("edge C+D: a required-complete module is skipped over — current moves to the next module's required item", () => {
  const progress: ItemProgressMap = { r1: "completed", r2: "completed" };
  const summary = computeProgress(modulesWithOptional, progress);
  assert.equal(summary.currentModuleIndex, 1);
  assert.equal(summary.currentItemIndex, 0);
  const next = getNextItem(modulesWithOptional, progress);
  assert.equal(next?.itemId, "r3");
  assert.notEqual(next?.itemId, "o1");
});

// E. Every required item across the whole program is resolved; the
// optional item is untouched → program completed, 100%, and there is
// NO current required item / continue target left (not o1).
test("edge E: all required complete + optional untouched => program completed, no continue target to optional content", () => {
  const progress: ItemProgressMap = { r1: "completed", r2: "completed", r3: "completed" };
  const summary = computeProgress(modulesWithOptional, progress);
  assert.equal(summary.isCompleted, true);
  assert.equal(summary.percent, 100);
  assert.equal(summary.currentModuleIndex, -1);
  assert.equal(summary.currentItemIndex, -1);
  assert.equal(getNextItem(modulesWithOptional, progress), null);
});

// F. Required all complete AND optional also completed → still
// completed, same 100% — optional completion never changes the
// percentage or the completion definition.
test("edge F: required complete + optional also completed => still completed, percent unaffected by optional", () => {
  const progress: ItemProgressMap = {
    r1: "completed",
    r2: "completed",
    r3: "completed",
    o1: "completed",
  };
  const summary = computeProgress(modulesWithOptional, progress);
  assert.equal(summary.isCompleted, true);
  assert.equal(summary.percent, 100);
});

// G. Optional completed but required incomplete → program remains
// incomplete, and current still points at required content (never at
// the already-done optional item).
test("edge G: optional completed + required incomplete => program incomplete, current still points to required content", () => {
  const progress: ItemProgressMap = { o1: "completed" };
  const summary = computeProgress(modulesWithOptional, progress);
  assert.equal(summary.isCompleted, false);
  assert.equal(summary.currentModuleIndex, 0);
  assert.equal(summary.currentItemIndex, 0);
  const next = getNextItem(modulesWithOptional, progress);
  assert.equal(next?.itemId, "r1");
  assert.equal(next?.isRequired, true);
});

test("getNextItem never returns an unresolved optional item, even when it's the only unresolved item left", () => {
  const progress: ItemProgressMap = { r1: "completed", r2: "completed", r3: "completed" };
  // o1 is the only unresolved item in the whole program at this point.
  const next = getNextItem(modulesWithOptional, progress);
  assert.equal(next, null);
});

// ── State semantics (2026-09-21) ────────────────────────────────────
// `summary.state` is a SEPARATE axis from `summary.percent` — whether
// the participant has started, not how far they've gotten. percent
// only moves once a required item is resolved (completed/skipped), by
// design; state must still read IN_PROGRESS the moment ANY item (even
// an optional one, even just opened/`in_progress`) shows real activity,
// as long as the program isn't fully COMPLETED. isCompleted/percent/
// current-position logic themselves are entirely unchanged by this —
// deriveState only reads their already-computed isCompleted value plus
// a fresh scan of the same progress map, never the reverse.

// 1. Empty progress → NOT_STARTED, 0%.
test("state: empty progress reads NOT_STARTED at 0%", () => {
  const summary = computeProgress(modules, {});
  assert.equal(summary.state, "not_started");
  assert.equal(summary.percent, 0);
});

// 2. First required item `in_progress` → IN_PROGRESS, still 0% — the
// exact case the bug report was about: clicking "Почати" marks the
// first required item in_progress, which alone never moves percent.
test("state: first required item in_progress reads IN_PROGRESS while percent stays genuinely 0", () => {
  const progress: ItemProgressMap = { i1: "in_progress" };
  const summary = computeProgress(modules, progress);
  assert.equal(summary.state, "in_progress");
  assert.equal(summary.percent, 0);
});

// 3. One required item actually completed → IN_PROGRESS, percent > 0.
test("state: one required item completed reads IN_PROGRESS with percent above 0", () => {
  const progress: ItemProgressMap = { i1: "completed" };
  const summary = computeProgress(modules, progress);
  assert.equal(summary.state, "in_progress");
  assert.ok(summary.percent > 0);
});

// 4. Optional item `in_progress` while no required activity exists.
// DECISION (per the task's own spec): optional interaction is still
// real participant activity — the person opened something — so state
// reads IN_PROGRESS. This must NEVER leak into completion/current-path
// logic: isCompleted stays false, percent stays 0 (no required item
// touched), and the current/continue target still points at the first
// required item, never at the optional one — exactly the same
// required-only guarantees the "edge A–G" tests above already pin,
// completely unaffected by this new field.
test("state: optional-only activity reads IN_PROGRESS, but never affects completion/percent/current-path", () => {
  const progress: ItemProgressMap = { o1: "in_progress" };
  const summary = computeProgress(modulesWithOptional, progress);
  assert.equal(summary.state, "in_progress");
  assert.equal(summary.isCompleted, false);
  assert.equal(summary.percent, 0);
  // Current position is still the first REQUIRED item, not o1 — same
  // required-only rule findCurrentRequired already enforced before
  // state existed at all.
  assert.equal(summary.currentModuleIndex, 0);
  assert.equal(summary.currentItemIndex, 0);
  const next = getNextItem(modulesWithOptional, progress);
  assert.equal(next?.itemId, "r1");
});

// 5. All required items completed → COMPLETED (optional untouched).
test("state: all required items completed reads COMPLETED regardless of untouched optional content", () => {
  const progress: ItemProgressMap = { r1: "completed", r2: "completed", r3: "completed" };
  const summary = computeProgress(modulesWithOptional, progress);
  assert.equal(summary.state, "completed");
  assert.equal(summary.isCompleted, true);
});

// 6. Existing skipped semantics remain correct — "skipped" is resolved
// activity too (counts toward isCompleted, same as "completed"), and
// is real activity for state purposes just like any other non-default
// status.
test("state: a skipped (not completed) required item still reads IN_PROGRESS, and all-skipped still reads COMPLETED", () => {
  const partiallySkipped = computeProgress(modules, { i1: "skipped" });
  assert.equal(partiallySkipped.state, "in_progress");
  assert.equal(partiallySkipped.isCompleted, false);

  const allSkipped = computeProgress(modules, { i1: "skipped", i2: "skipped", i3: "skipped" });
  assert.equal(allSkipped.state, "completed");
  assert.equal(allSkipped.isCompleted, true);
});

// A genuinely fresh COMPLETED program (isCompleted true) always reads
// state "completed", never "in_progress" — completed takes precedence
// over the activity check, per the required precedence order.
test("state: isCompleted always wins over the activity check, even with optional items still untouched", () => {
  const progress: ItemProgressMap = { r1: "completed", r2: "completed", r3: "completed" };
  const summary = computeProgress(modulesWithOptional, progress);
  assert.equal(summary.state, "completed");
});

// ---- editing a live program: what happens to people's progress ----------

test("progress for a removed lesson is kept in the map but never counted", () => {
  const progress = { i1: "completed" as const, i2: "completed" as const, i3: "completed" as const, gone: "completed" as const };
  const p = computeProgress(modules, progress);
  assert.equal(p.completedRequiredItems, 3);
  assert.equal(p.requiredItems, 3);
  assert.equal(p.percent, 100);
});

test("reordering modules/lessons does not move anyone's progress (it is keyed by lesson id)", () => {
  const reordered: ContentModule[] = [modules[1], { ...modules[0], items: [modules[0].items[1], modules[0].items[0]] }];
  const progress = { i1: "completed" as const };
  assert.equal(computeProgress(modules, progress).completedRequiredItems, 1);
  assert.equal(computeProgress(reordered, progress).completedRequiredItems, 1);
});

test("adding a required lesson to a finished program reopens it (percent drops below 100)", () => {
  const done = { i1: "completed" as const, i2: "completed" as const, i3: "completed" as const };
  assert.equal(computeProgress(modules, done).isCompleted, true);
  const extended: ContentModule[] = [
    ...modules,
    { id: "m3", title: "Module 3", description: "", items: [{ id: "i4", title: "New", type: "text", isRequired: true }] },
  ];
  const p = computeProgress(extended, done);
  assert.equal(p.isCompleted, false);
  assert.equal(p.percent, 75);
});

test("flipping a lesson to optional raises everyone's percent (why the editor asks before saving)", () => {
  const progress = { i1: "completed" as const, i2: "completed" as const };
  assert.equal(computeProgress(modules, progress).percent, 67);
  const flipped: ContentModule[] = [modules[0], { ...modules[1], items: [{ ...modules[1].items[0], isRequired: false }] }];
  assert.equal(computeProgress(flipped, progress).percent, 100);
});

// ── canonical module rules (isModuleDone / isModuleLocked) ──────────────
import { isModuleDone, isModuleLocked } from "./contentProgress.ts";

const mixedModules: ContentModule[] = [
  {
    id: "m1",
    title: "M1",
    description: "",
    items: [
      { id: "r1", title: "R1", type: "text", isRequired: true },
      { id: "r2", title: "R2", type: "text", isRequired: true },
      { id: "o1", title: "O1", type: "text", isRequired: false },
    ],
  },
  { id: "m2", title: "M2 optional only", description: "", items: [{ id: "o2", title: "O2", type: "text", isRequired: false }] },
  { id: "m3", title: "M3 empty", description: "", items: [] },
  { id: "m4", title: "M4", description: "", items: [{ id: "r3", title: "R3", type: "text", isRequired: true }] },
];

test("module is done only when every required item is resolved", () => {
  assert.equal(isModuleDone(mixedModules, {}, 0), false);
  assert.equal(isModuleDone(mixedModules, { r1: "completed" }, 0), false);
  assert.equal(isModuleDone(mixedModules, { r1: "completed", r2: "completed" }, 0), true);
});

test("module: skipped counts as resolved, in_progress does not", () => {
  assert.equal(isModuleDone(mixedModules, { r1: "skipped", r2: "completed" }, 0), true);
  assert.equal(isModuleDone(mixedModules, { r1: "completed", r2: "in_progress" }, 0), false);
});

test("module: optional items never decide doneness", () => {
  assert.equal(isModuleDone(mixedModules, { r1: "completed", r2: "completed", o1: "not_started" }, 0), true);
  assert.equal(isModuleDone(mixedModules, { o1: "completed" }, 0), false);
});

test("module with no required items, no items, or a missing index is never done", () => {
  assert.equal(isModuleDone(mixedModules, { o2: "completed" }, 1), false);
  assert.equal(isModuleDone(mixedModules, {}, 2), false);
  assert.equal(isModuleDone(mixedModules, {}, 99), false);
  assert.equal(isModuleDone(mixedModules, {}, -1), false);
});

test("module is locked while an earlier required item is unresolved", () => {
  assert.equal(isModuleLocked(mixedModules, {}, 0), false);
  assert.equal(isModuleLocked(mixedModules, {}, 3), true);
  assert.equal(isModuleLocked(mixedModules, { r1: "completed" }, 3), true);
  assert.equal(isModuleLocked(mixedModules, { r1: "completed", r2: "skipped" }, 3), false);
});

test("module lock: optional items before it never lock it", () => {
  assert.equal(isModuleLocked(mixedModules, { r1: "completed", r2: "completed" }, 1), false);
});

test("module lock: empty module and missing index are never locked", () => {
  assert.equal(isModuleLocked(mixedModules, {}, 2), false);
  assert.equal(isModuleLocked(mixedModules, {}, 99), false);
});

test("module lock: free access mode never locks", () => {
  assert.equal(isModuleLocked(mixedModules, {}, 3, "free"), false);
});

test("module lock equals the first item's lock", () => {
  for (let mi = 0; mi < mixedModules.length; mi++) {
    assert.equal(isModuleLocked(mixedModules, {}, mi), isItemLocked(mixedModules, {}, mi, 0), `module ${mi}`);
  }
});
