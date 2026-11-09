// Split out from contentProgressSync.ts so this pure function can be
// unit-tested without pulling in supabaseClient (Node's test runner,
// unlike Vite, doesn't resolve the codebase's extension-less relative
// imports transitively through a real Supabase client module).

import type { ItemProgressMap, ItemProgressStatus } from "../data/contentTypes.ts";

// Higher status wins per item — a device that's behind (e.g. an old
// tab that never saw a later "completed") should never drag an item
// backwards on merge. Union of both maps' keys, not just one side's,
// so an item only one side knows about still survives the merge.
// "skipped" ranks above in_progress/not_started (it's a deliberate,
// resolved outcome — see ItemProgressStatus in contentTypes.ts) but
// below "completed", since actually completing something afterward is
// the truer outcome if the two ever disagree.
const RANK: Record<ItemProgressStatus, number> = { not_started: 0, in_progress: 1, skipped: 2, completed: 3 };

export function mergeProgress(a: ItemProgressMap, b: ItemProgressMap): ItemProgressMap {
  const merged: ItemProgressMap = { ...a };
  for (const [itemId, status] of Object.entries(b)) {
    const current = merged[itemId];
    if (!current || RANK[status] > RANK[current]) {
      merged[itemId] = status;
    }
  }
  return merged;
}
