// Item-level progress persistence for the demo catalog's programs —
// same pattern as demoReadStore.ts (localStorage, demo ids only, no
// backend yet). Real content's progress will live in a future
// content_item_progress table; this is strictly the mock-stage
// equivalent so completing an item during a session actually sticks
// around instead of resetting the moment you leave "Моє навчання".
//
// Seed values (demoSeedProgress in data/programModules.ts) describe
// "where this demo participant already is" the first time this is ever
// read — after that, real interactions (markItemStatus) take over and
// persist on top of the seed, per content id.
//
// Per-user storage key (2026-09-21 bug fix — Sasha reported opening a
// program she'd genuinely never touched on this account and seeing it
// already 38% done with a module marked complete). Root cause: this
// store used ONE global localStorage key for the whole browser, with no
// concept of which signed-in account the progress belonged to. Once
// ANY account ever touched a demo program on a given browser (a
// previous login, an earlier test pass under a different account),
// that entry sat in localStorage forever and silently applied to
// WHOEVER next opened the same program on that browser — including a
// brand-new account that had done nothing. lib/contentProgressSync.ts's
// mergeProgress (higher-status-wins union) couldn't self-correct this
// either: it only adds real server progress in, it never had a reason
// to remove a local entry the real per-user server row disagreed with,
// so the wrong data was permanently sticky once written. Namespacing
// the storage key by userId means each account only ever reads/writes
// its own bucket — a genuinely new account for a program now correctly
// starts empty, regardless of what any other account did on the same
// browser. `userId: null` (logged-out/preview surfaces — see
// programDetail/ProgramDetailPage.tsx's optional `session`) never touches
// localStorage at all, only ever returns the seed-or-empty default,
// so a logged-out visitor can't read OR write anyone's real progress.

import type { ItemProgressMap } from "../data/contentTypes.ts";
import { demoSeedProgress } from "../data/programModules.ts";

const STORAGE_KEY_PREFIX = "sensoria_demo_item_progress";

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

function loadAll(userId: string): Record<string, ItemProgressMap> {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveAll(userId: string, data: Record<string, ItemProgressMap>): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(data));
  } catch {
    // Storage unavailable (private mode, quota, etc.) — progress just
    // won't survive a remount; not worth surfacing to the user over.
  }
}

// Once a contentId has ANY stored entry (even from a single item being
// touched), that stored map fully replaces the seed for that contentId
// — the seed is only ever a first-run default, never merged item-by-
// item with later real changes.
//
// allowSeed (2026-09-21 correctness fix): every real call site that
// reads a PARTICIPANT'S OWN progress (ParticipantLearning, Overview,
// ProgramDetailPage once enrolled, ProgramExperience itself) only
// ever runs inside the logged-in participant dashboard — a real
// session always exists there. The seed default is a "what would the
// story look like before anyone's touched anything" stand-in, and was
// only ever meant to color the built-in demo narrative, not to be
// handed to an actual signed-in person's own progress read. Before
// this fix, ANY newly-registered real participant who opened
// stress-course/mindfulness-course (the only two seeded ids) for the
// first time — on a fresh browser with no localStorage entry yet —
// would see this seed's fake completed/in-progress state as if it were
// their own, with no way to self-correct even after a real (empty)
// server row confirmed they'd never actually started (see
// ProgramExperience.tsx's fetchServerProgress effect, which only
// merges a real row IN, it never had a reason to clear a fake initial
// value back OUT). Callers pass `false` once they know a real
// participant is asking about their own content; the default stays
// `true` so anything not explicitly touched here keeps its old
// behavior.
export function getItemProgress(
  userId: string | null,
  contentId: string,
  allowSeed: boolean = true
): ItemProgressMap {
  if (userId) {
    const all = loadAll(userId);
    if (all[contentId]) return all[contentId];
  }
  if (!allowSeed) return {};
  return demoSeedProgress[contentId] ?? {};
}

export function setItemProgress(userId: string, contentId: string, next: ItemProgressMap): void {
  const all = loadAll(userId);
  all[contentId] = next;
  saveAll(userId, all);
}
