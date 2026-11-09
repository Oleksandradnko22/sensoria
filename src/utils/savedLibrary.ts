// Search + sort for the participant's saved library. Pure, no data access:
// the page builds each item's searchable fields from real data and calls
// these.

export type SavedSortMode = "recent" | "az" | "za";

export const SAVED_SORT_OPTIONS: { key: SavedSortMode; label: string }[] = [
  { key: "recent", label: "Останні збережені" },
  { key: "az", label: "Назва А–Я" },
  { key: "za", label: "Назва Я–А" },
];

// Lower-case, unify the apostrophe variants Ukrainian text is typed with,
// collapse whitespace.
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’ʼ`´‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Every word of the query must appear somewhere in the item's fields
// (order and field don't matter). An empty query matches everything.
export function matchesSearch(fields: (string | null | undefined)[], query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const haystack = normalizeSearch(fields.filter((f): f is string => !!f).join(" "));
  return q.split(" ").every((word) => haystack.includes(word));
}

const time = (iso: string) => {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : -Infinity;
};

// Stable. "recent": newest saved first (unparseable dates last); "az"/"za":
// by title, Ukrainian collation.
export function sortSaved<T extends { at: string; title: string }>(items: T[], mode: SavedSortMode): T[] {
  const collator = new Intl.Collator("uk", { sensitivity: "base", numeric: true });
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      let diff = 0;
      if (mode === "recent") {
        const ta = time(a.item.at);
        const tb = time(b.item.at);
        diff = ta === tb ? 0 : tb > ta ? 1 : -1;
      } else {
        diff = collator.compare(a.item.title, b.item.title);
        if (mode === "za") diff = -diff;
      }
      return diff || a.index - b.index;
    })
    .map((x) => x.item);
}
