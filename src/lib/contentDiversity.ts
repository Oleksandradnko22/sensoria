// Marketplace-fairness helper for recommendation lists (2026-09-15, per
// Sasha's explicit "diversity rule" spec — "якщо є 6 медитацій автора A
// і 2 автора B, не показувати перші 3 автоматично від автора A").
//
// Deliberately its own dependency-free module (no imports at all) —
// same reasoning as lib/guideProgress.ts: `node --experimental-strip-types
// --test` needs every relative VALUE import in a test's transitive graph
// to carry an explicit `.ts` extension, and this app's `data/*.ts` layer
// doesn't follow that convention (it's written for Vite/tsc's "bundler"
// resolution). Keeping this a small, generic, import-free pure function
// means it can be unit-tested in complete isolation from the catalog
// data, and reused anywhere else a "diversify by some key" need comes up
// later (author diversity today, could be publisher/category tomorrow).

// Caps a relevance-sorted list to `limit`, preferring not to let one
// key (an author, typically) fill every slot when an item with a
// not-yet-seen key exists further down the same list. Relevance order
// still wins first: this is a stable two-pass selection, not a re-sort
// — first take each not-yet-seen key's best (i.e. most relevant) item
// in order, then fill any remaining slots from the already-seen keys in
// their original relevance order. When there simply aren't enough
// distinct keys to fill `limit` (or `key` returns null for every item,
// meaning this content type has no such concept — e.g. meditations have
// no author field anywhere in this app), it degrades to plain relevance
// order, exactly as before — diversity is a preference among comparable
// matches, never a reason to withhold a real one.
export function pickDiverseTop<T>(items: T[], limit: number, key: (item: T) => string | null): T[] {
  const picked: T[] = [];
  const deferred: T[] = [];
  const usedKeys = new Set<string>();
  for (const item of items) {
    const k = key(item);
    if (k !== null && usedKeys.has(k)) {
      deferred.push(item);
      continue;
    }
    picked.push(item);
    if (k !== null) usedKeys.add(k);
  }
  return [...picked, ...deferred].slice(0, limit);
}

// The exact "Що може допомогти зараз" recommendation pipeline
// (2026-09-16 technical audit, item RECOMMENDATIONS) — filter out
// anything the person already owns, cap to `limit`, then diversify —
// as one pure, generic, import-free function instead of that sequence
// being hand-repeated inline once per content type inside
// lib/dashboardPriority.ts's pickTopMatchesExcludingOwned. Extracted
// purely so the exclude→diversify→cap pipeline itself is independently
// unit-testable with synthetic data (no real catalog/enrollment data,
// no Node ESM resolution issues) — dashboardPriority.ts's own relevance
// scan and ownership-Set construction are untouched by this, this only
// factors out what happens to a list AFTER those two are already known.
export function excludeOwnedAndDiversify<T>(
  items: T[],
  ownedIds: ReadonlySet<string>,
  limit: number,
  idOf: (item: T) => string,
  key: (item: T) => string | null
): T[] {
  const notOwned = items.filter((item) => !ownedIds.has(idOf(item)));
  return pickDiverseTop(notOwned, limit, key);
}
