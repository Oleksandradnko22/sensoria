// Convenience glue for the demo catalog: looks up a program's module/
// item data (data/programModules.ts) + its stored progress
// (utils/demoProgressStore.ts) and runs them through the pure engine
// (lib/contentProgress.ts). Kept as one shared helper so
// ParticipantLearning.tsx, programDetail/ProgramDetailPage.tsx and
// ProgramExperience.tsx all read the exact same computed numbers
// instead of three components each doing their own (and drifting).
//
// Returns null for anything that isn't a demo program with authored
// item data — real (authored) programs and demo programs without a
// programModules entry simply have no item-level experience yet, so
// callers fall back to whatever coarser display they already had
// (progressPercent, or nothing) rather than crashing.

import { programModules } from "../data/programModules.ts";
import { getItemProgress, setItemProgress } from "../utils/demoProgressStore.ts";
import {
  computeProgress,
  isModuleDone as isModuleDoneIn,
  isModuleLocked as isModuleLockedIn,
  markItemStatus,
  type FlatItemRef,
} from "./contentProgress.ts";
import type { ContentModule, ItemProgressStatus, ProgramProgressSummary } from "../data/contentTypes.ts";

export function getProgramModules(contentId: string): ContentModule[] | null {
  return programModules[contentId] ?? null;
}

// `userId` (2026-09-21 bug fix — see utils/demoProgressStore.ts's own
// header for the full root-cause story: its localStorage key used to
// be global to the browser, so one account's progress could bleed into
// another account opening the same demo program later). `null` is only
// ever legitimate for a logged-out/preview read (ProgramDetailPage's
// optional `session`) — every call site inside the signed-in
// participant dashboard has a real userId in scope and must pass it.
//
// allowSeed defaults to true (old behavior) for anything that doesn't
// explicitly pass it; every real call site reading a signed-in
// participant's own progress passes `false` — see
// utils/demoProgressStore.ts's getItemProgress for the full reasoning.
export function getProgramProgress(
  userId: string | null,
  contentId: string,
  allowSeed: boolean = true
): ProgramProgressSummary | null {
  const modules = getProgramModules(contentId);
  if (!modules) return null;
  return computeProgress(modules, getItemProgress(userId, contentId, allowSeed));
}

export function setProgramItemStatus(
  userId: string,
  contentId: string,
  itemId: string,
  status: ItemProgressStatus
): void {
  const current = getItemProgress(userId, contentId);
  setItemProgress(userId, contentId, markItemStatus(current, itemId, status));
}

// "Locked" / "done" for one module of a DEMO program, read from the stored
// progress. The rules themselves live in lib/contentProgress.ts
// (isModuleLocked / isModuleDone — one shared definition); these wrappers only
// look up the program's modules and the person's stored progress. Used by
// preview-only surfaces (like ProgramDetailPage's "Ваш шлях") that show
// module state without letting the participant actually complete anything
// there. A program without module data is neither locked nor done.
export function isModuleLocked(
  userId: string | null,
  contentId: string,
  moduleIndex: number,
  allowSeed: boolean = true
): boolean {
  const modules = getProgramModules(contentId);
  if (!modules) return false;
  return isModuleLockedIn(modules, getItemProgress(userId, contentId, allowSeed), moduleIndex);
}

export function isModuleDone(
  userId: string | null,
  contentId: string,
  moduleIndex: number,
  allowSeed: boolean = true
): boolean {
  const modules = getProgramModules(contentId);
  if (!modules) return false;
  return isModuleDoneIn(modules, getItemProgress(userId, contentId, allowSeed), moduleIndex);
}

// Convenience re-export so components don't need to import from three
// different files just to render "Модуль X, елемент Y".
export type { FlatItemRef };

// The real per-program completion correction (2026-09-16 technical
// audit) lives in lib/programStatus.ts, not here — kept out of this
// file specifically so it stays dependency-free and unit-testable
// (see that file's own header for why). Call it as
// `withRealProgramStatus(source, getProgramProgress)`.
