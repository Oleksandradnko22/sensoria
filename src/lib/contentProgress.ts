// Pure progress-engine functions — no UI, no fetching, no storage.
// Operates purely on (modules, progressMap) so the exact same code
// works for a 1-module program, a 10-module program, a module-less
// guide (pass its items as a single synthetic module — see
// flattenModules below), and for any mix of required/optional items.
// Nothing here assumes a fixed module/item count.
//
// Program vs guide UX differ (module/item vs section numbering, badge
// icons, CTA copy) — that lives in the consuming components. This file
// is the one shared engine underneath both, per Sasha's instruction not
// to build parallel mechanics for things that are genuinely the same
// underlying problem.

import type { ContentModule, ItemProgressMap, ItemProgressStatus, ProgramProgressSummary, ProgramState } from "../data/contentTypes.ts";

export type FlatItemRef = {
  moduleIndex: number;
  itemIndex: number;
  itemId: string;
  isRequired: boolean;
};

// Flattens modules -> items into a single ordered list, keeping track
// of which module/index each item came from. This is the one place
// that understands "module structure" — everything else just walks
// this flat list in order.
export function flattenModules(modules: ContentModule[]): FlatItemRef[] {
  const flat: FlatItemRef[] = [];
  modules.forEach((m, moduleIndex) => {
    m.items.forEach((item, itemIndex) => {
      flat.push({ moduleIndex, itemIndex, itemId: item.id, isRequired: item.isRequired });
    });
  });
  return flat;
}

function statusOf(progress: ItemProgressMap, itemId: string): ItemProgressStatus {
  return progress[itemId] ?? "not_started";
}

// "completed" or "skipped" both count as "nothing left to do here" —
// for sequencing (locking, "what's next") AND for the program-level %/
// isCompleted (see computeProgress below). See ItemProgressStatus in
// contentTypes.ts for why "skipped" exists as its own status rather
// than being folded into "completed" itself: per-item displays still
// distinguish them (a skipped item shows "— Пропущено", not "✓
// Завершено"), only the aggregate tally treats them as equivalent.
export function isResolved(status: ItemProgressStatus): boolean {
  return status === "completed" || status === "skipped";
}

// The one shared "what's still required and unresolved, in order"
// pointer — computeProgress's currentModuleIndex/currentItemIndex AND
// getNextItem both resolve to this exact same item, never two
// separately hand-rolled versions of "current" (2026-09-16 technical
// fix — REQUIRED CONTENT DEFINES THE PROGRAM PATH, optional content is
// bonus and must never block or redirect it). Required-only is the
// ONLY change from the previous "first unresolved item of any kind"
// definition: an untouched optional item is simply skipped over when
// looking for what's current, exactly like it already was for locking
// (isItemLocked above) and for isCompleted below — those two were
// already required-only; this brings "current" in line with them
// instead of being the one place still using a different rule.
// Naturally returns undefined once every required item is resolved,
// even if optional items remain untouched — there is no required
// content left to point at, by design (see isRequired's own contract
// in contentTypes.ts: it's the one and only definition of "required"
// this engine uses, not re-derived here).
function findCurrentRequired(flat: FlatItemRef[], progress: ItemProgressMap): FlatItemRef | undefined {
  return flat.find((f) => f.isRequired && !isResolved(statusOf(progress, f.itemId)));
}

// "Has the participant done ANYTHING here at all" — 2026-09-21 state-
// semantics fix. Deliberately checks EVERY item, required AND optional:
// an optional item being opened is still real participant activity
// (they did something), even though it must never affect percent/
// isCompleted/current — those stay required-only, untouched by this
// function. `statusOf` already treats an absent key as "not_started",
// so this is exactly "does any item have a real, non-default status."
function hasAnyActivity(flat: FlatItemRef[], progress: ItemProgressMap): boolean {
  return flat.some((f) => statusOf(progress, f.itemId) !== "not_started");
}

// The one shared "has this participant started, not how far along" —
// 2026-09-21 state-semantics fix. A genuinely fresh program participant
// has never opened ANYTHING in reads NOT_STARTED; once required
// completion is met it's COMPLETED (same isCompleted this file already
// computes); everything else in between — including a required item
// that's merely `in_progress`, at 0% — is IN_PROGRESS. This is the
// exact distinction `percent === 0` cannot make on its own: percent
// only moves once a required item is actually resolved (completed/
// skipped), by design (see percent's own comment in computeProgress),
// so a person who has genuinely started but not yet finished anything
// must not be read as untouched. Precedence is completed > in_progress
// > not_started — deliberately checked in that order below.
function deriveState(isCompleted: boolean, flat: FlatItemRef[], progress: ItemProgressMap): ProgramState {
  if (isCompleted) return "completed";
  if (hasAnyActivity(flat, progress)) return "in_progress";
  return "not_started";
}

// An item is locked when it's sequentially gated behind an earlier
// REQUIRED item that isn't resolved yet. Optional items never gate
// anything and are never themselves locked by their own optionality —
// only order + required-ness matters. `accessMode: "free"` disables
// locking entirely (author-controlled escape hatch — not exposed in
// the editor yet, but the engine already supports it).
export function isItemLocked(
  modules: ContentModule[],
  progress: ItemProgressMap,
  moduleIndex: number,
  itemIndex: number,
  accessMode: "sequential" | "free" = "sequential"
): boolean {
  if (accessMode === "free") return false;
  const flat = flattenModules(modules);
  const target = flat.find((f) => f.moduleIndex === moduleIndex && f.itemIndex === itemIndex);
  if (!target) return false;
  const targetPos = flat.indexOf(target);
  for (let i = 0; i < targetPos; i++) {
    const ref = flat[i];
    if (ref.isRequired && !isResolved(statusOf(progress, ref.itemId))) return true;
  }
  return false;
}

// A module is "locked" when its FIRST item is locked — sequential access
// means you can't be partway into module 3 while module 1 still has
// incomplete required items. Same rule as isItemLocked (above), asked about
// the module as a whole. A module with no items, or an index that doesn't
// exist, is never locked (isItemLocked finds no target item and answers
// false). The one canonical rule: ProgramExperience's module list and
// lib/programProgress.ts's preview-surface wrapper both call this.
export function isModuleLocked(
  modules: ContentModule[],
  progress: ItemProgressMap,
  moduleIndex: number,
  accessMode: "sequential" | "free" = "sequential"
): boolean {
  return isItemLocked(modules, progress, moduleIndex, 0, accessMode);
}

// A module is "done" when it has at least one REQUIRED item and every
// required item is resolved ("completed" or "skipped" — see isResolved).
// Optional items never count either way. A module with no required items
// (empty, or only optional ones), or an index that doesn't exist, is never
// "done" — there is nothing required to have finished. Required-only is the
// same definition computeProgress and the module's own progress bar use, so
// the ✓ and the bar can never disagree. The one canonical rule, shared with
// lib/programProgress.ts's isModuleDone wrapper.
export function isModuleDone(modules: ContentModule[], progress: ItemProgressMap, moduleIndex: number): boolean {
  const mod = modules[moduleIndex];
  if (!mod) return false;
  const required = mod.items.filter((i) => i.isRequired);
  if (required.length === 0) return false;
  return required.every((i) => isResolved(statusOf(progress, i.id)));
}

// Rounds a done/total ratio to a whole percent for any progress bar/
// ring fed by this engine — NOT just computeProgress's own percent
// field. Two invariants matter more than a mathematically "correct"
// round here (2026-09-16 technical audit, finding #1):
//   - it can only ever read 100 when `done >= total` — a plain
//     Math.round can hit 100 while one item is still outstanding
//     (e.g. 199/200 = 99.5% rounds to 100), which would silently
//     contradict an isCompleted/moduleDone check computed from the
//     same counts elsewhere. Never surface "100%" next to something
//     that isn't actually flagged done.
//   - it never goes negative or NaN — `total <= 0` (nothing to divide
//     by) or `done <= 0` both read as a plain 0, not a crash or a
//     meaningless number.
// Exported so any consumer computing its own done/total percent (see
// ProgramExperience.tsx's per-module bar) shares this exact rule
// instead of re-deriving a subtly different one.
export function safePercent(done: number, total: number): number {
  if (!(total > 0) || !(done > 0)) return 0;
  if (done >= total) return 100;
  return Math.min(99, Math.max(0, Math.round((done / total) * 100)));
}

// The single source of truth for "how far along is this program" —
// never a hardcoded percentage, always derived from the actual module/
// item data plus whatever's been completed so far.
export function computeProgress(
  modules: ContentModule[],
  progress: ItemProgressMap
): ProgramProgressSummary {
  const flat = flattenModules(modules);
  const totalItems = flat.length;
  const requiredRefs = flat.filter((f) => f.isRequired);
  const requiredItems = requiredRefs.length;
  // Counts "skipped" alongside "completed" (isResolved) — a person who
  // declined a content warning ("Не зараз") can still finish the
  // program; the % and "Ви завершили" moment shouldn't stay permanently
  // out of reach over a lesson they explicitly chose not to open. The
  // item itself still remembers it was only skipped, not actually done
  // (see isDone checks in ProgramExperience.tsx), so nothing here
  // pretends the person watched/read something they didn't — only the
  // program-level tally treats it as resolved.
  const completedRequiredItems = requiredRefs.filter((f) => isResolved(statusOf(progress, f.itemId))).length;
  // safePercent, not a bare Math.round — see its own comment above for
  // why (2026-09-16 audit): guarantees percent can only ever read 100
  // in lockstep with isCompleted below, never ahead of it.
  const percent = safePercent(completedRequiredItems, requiredItems);
  const isCompleted = requiredItems > 0 && completedRequiredItems === requiredItems;

  // Current position = first UNRESOLVED REQUIRED item, in flattened
  // order (see findCurrentRequired above). An untouched optional item
  // never holds this position — required content defines the program
  // path, optional content is bonus and must never determine where
  // "current" points. If every required item is resolved, there's no
  // required position left to resume into, even if optional items
  // still remain — that's fine, they stay reachable through the normal
  // module list, just never as the primary "continue" target.
  const current = findCurrentRequired(flat, progress);

  return {
    totalItems,
    requiredItems,
    completedRequiredItems,
    percent,
    totalModules: modules.length,
    currentModuleIndex: current ? current.moduleIndex : -1,
    currentItemIndex: current ? current.itemIndex : -1,
    isCompleted,
    state: deriveState(isCompleted, flat, progress),
  };
}

// Pure state transition: returns a new map, never mutates the one
// passed in — callers (demoProgressStore, eventually a real Supabase
// write) own persistence.
export function markItemStatus(
  progress: ItemProgressMap,
  itemId: string,
  status: ItemProgressStatus
): ItemProgressMap {
  return { ...progress, [itemId]: status };
}

// Ukrainian duration formatting shared by every place that needs to
// show a summed total (module meta line, program hero meta line) —
// "45 хв" under an hour, "1 год 10 хв" over, never "1 год 0 хв".
export function formatDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return "";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} хв`;
  if (minutes === 0) return `${hours} год`;
  return `${hours} год ${minutes} хв`;
}

export function sumDuration(modules: ContentModule[]): number {
  return modules.reduce(
    (sum, m) => sum + m.items.reduce((s, i) => s + (i.durationMinutes ?? 0), 0),
    0
  );
}

// What to open next after finishing the current item — the next
// UNRESOLVED REQUIRED item, in flattened order, regardless of module
// boundary (same findCurrentRequired predicate computeProgress's own
// currentModuleIndex/currentItemIndex use, so the two can never
// disagree). An unresolved optional item is never returned here —
// null means every required item is resolved (nothing required left
// to advance to), even while optional items remain untouched.
export function getNextItem(modules: ContentModule[], progress: ItemProgressMap): FlatItemRef | null {
  const flat = flattenModules(modules);
  return findCurrentRequired(flat, progress) ?? null;
}
