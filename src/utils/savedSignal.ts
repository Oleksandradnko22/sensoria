// "Something in the saved library changed" — a tiny in-memory signal so the
// Saved page can skip re-reading five tables every time its tab is shown and
// still never miss a change made elsewhere (a fragment saved in a guide, a
// lesson bookmarked in the player, …). Fired by the add/remove functions in
// lib/{guideSaves,guideFragments,guideNotes,savedPractices,bookmarks}.
let version = 0;
const listeners = new Set<() => void>();

export function notifySavedChanged(): void {
  version++;
  listeners.forEach((l) => l());
}

export function getSavedVersion(): number {
  return version;
}

export function subscribeSaved(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
