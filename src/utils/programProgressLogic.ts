// The pure rules behind a participant's progress through a program, taken out
// of ProgramExperience.tsx unchanged in behaviour (2026-10-07) so they can be
// tested on their own. Nothing here touches storage, the server or React —
// useProgramProgress owns that and only calls these to decide the next map.
//
// Contract of every function: never mutates the map it is given.
import type { ContentModule, ItemProgressMap } from "../data/contentTypes.ts";
import { computeProgress, markItemStatus } from "../lib/contentProgress.ts";
import { mergeProgress } from "../lib/mergeProgress.ts";

// Opening an untouched lesson makes it "У процесі" — a real signal, not
// decoration. Returns the new map, or null when there is nothing to change
// (already in progress / completed / skipped), so the caller does not persist
// a no-op. Never downgrades a finished lesson and never marks anything done
// just because it was viewed.
export function applyOpen(progress: ItemProgressMap, itemId: string): ItemProgressMap | null {
  if ((progress[itemId] ?? "not_started") !== "not_started") return null;
  return markItemStatus(progress, itemId, "in_progress");
}

// "Завершити": the lesson becomes "completed". `programCompleted` is computed
// on the NEW map (the screen's own summary is still the old one at that
// moment) — true means nothing required is left and the closing report shows.
export function applyComplete(
  progress: ItemProgressMap,
  itemId: string,
  modules: ContentModule[]
): { next: ItemProgressMap; programCompleted: boolean } {
  const next = markItemStatus(progress, itemId, "completed");
  return { next, programCompleted: computeProgress(modules, next).isCompleted };
}

// "Не зараз" on a content warning: "skipped" satisfies the sequential lock
// (declining never traps the person behind a lesson they chose not to open),
// does not count toward the percentage, and the lesson stays revisitable.
export function applySkip(progress: ItemProgressMap, itemId: string): ItemProgressMap {
  return markItemStatus(progress, itemId, "skipped");
}

// Brings the server copy into what is shown: the higher status per lesson
// wins (a stale fetch can never move anything backwards). Returns null when
// there is no server copy or the merge changes nothing — then nothing is
// written anywhere. Otherwise the merged map, which the caller stores locally
// and pushes back so both sides agree.
export function mergeServerProgress(
  current: ItemProgressMap,
  server: ItemProgressMap | null | undefined
): ItemProgressMap | null {
  if (!server) return null;
  const merged = mergeProgress(current, server);
  return JSON.stringify(merged) === JSON.stringify(current) ? null : merged;
}
