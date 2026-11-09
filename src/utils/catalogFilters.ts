// Search, price, category and sort rules of the programs catalog (moved here
// unchanged from ProgramsCatalogPage so they can be tested; there is ONE
// implementation). Labels for the filter UI live next to the rules.
import { isFreePrice } from "./price.ts";
import { CATALOG_SORT_OPTIONS } from "./catalogSort.ts";

export type CatalogProgram = {
  title: string;
  price: string;
  tags: string[];
  rating?: number;
  addedAt?: string; // when it was added to the catalog ("Нові" sort)
  author?: string;
};

export type PriceFilter = "all" | "free" | "low" | "medium" | "high";
export type SortKey = "default" | "popular" | "rating" | "new" | "cheap" | "expensive";

export type CatalogFilters = {
  search: string;
  price: PriceFilter;
  sort: SortKey;
  categories: string[]; // empty = all
};

export const DEFAULT_FILTERS: CatalogFilters = { search: "", price: "all", sort: "default", categories: [] };

export const CATEGORIES: { id: string; label: string }[] = [
  { id: "all", label: "Всі" },
  { id: "stress", label: "Стрес" },
  { id: "anxiety", label: "Тривожність" },
  { id: "burnout", label: "Вигорання" },
  { id: "relationships", label: "Стосунки" },
  { id: "motivation", label: "Мотивація" },
  { id: "selfEsteem", label: "Самооцінка" },
  { id: "emotionalBalance", label: "Емоційний баланс" },
  { id: "other", label: "Інше" },
];

export const PRICE_OPTIONS: { id: PriceFilter; label: string }[] = [
  { id: "all", label: "Усі ціни" },
  { id: "free", label: "Безкоштовно" },
  { id: "low", label: "До 1000 ₴" },
  { id: "medium", label: "1000–2000 ₴" },
  { id: "high", label: "2000 ₴+" },
];

// the same list as the guides and meditations catalogs (utils/catalogSort.ts)
export const SORT_OPTIONS: { id: SortKey; label: string }[] = CATALOG_SORT_OPTIONS;

// Card label: the first of the program's tags that has a human name.
const TAG_LABELS: Record<string, string> = {
  stress: "Стрес",
  innerPressure: "Внутрішня напруга",
  anxiety: "Тривожність",
  burnout: "Вигорання",
  relationships: "Стосунки",
  motivation: "Мотивація",
  selfEsteem: "Самооцінка",
  emotionalBalance: "Емоційний баланс",
  healthyBalance: "Емоційний баланс",
  awareness: "Усвідомленість",
  recovery: "Відновлення",
};

export function categoryLabelForTags(tags: string[] | undefined): string | null {
  for (const t of tags ?? []) if (TAG_LABELS[t]) return TAG_LABELS[t];
  return null;
}

// Which program tags belong to which filter category. Tags that have no category of
// their own (awareness, recovery, ...) make a program «Інше», so every program can be
// reached by some filter and the card's label always agrees with the filter it sits under.
const CATEGORY_TAGS: Record<string, string[]> = {
  stress: ["stress", "innerPressure"],
  anxiety: ["anxiety"],
  burnout: ["burnout"],
  relationships: ["relationships"],
  motivation: ["motivation"],
  selfEsteem: ["selfEsteem"],
  emotionalBalance: ["emotionalBalance", "healthyBalance"],
};

export function categoriesForTags(tags: readonly string[] | undefined): string[] {
  const out = Object.keys(CATEGORY_TAGS).filter((id) => CATEGORY_TAGS[id].some((t) => (tags ?? []).includes(t)));
  return out.length ? out : ["other"];
}

// Ids coming from outside (a finished program's tags, assessment states) -> filter categories.
// A known category id stays; a raw tag becomes its category; anything unknown is dropped.
export function normalizeCategories(ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const cat = id in CATEGORY_TAGS || id === "other" ? id : Object.keys(CATEGORY_TAGS).find((c) => CATEGORY_TAGS[c].includes(id));
    if (cat && !out.includes(cat)) out.push(cat);
  }
  return out;
}

// Price as a number; anything that is not a finite number counts as 0 (never NaN in a sort).
const priceNum = (price: string): number => {
  const n = Number(price);
  return Number.isFinite(n) ? n : 0;
};

// Newest first; an item without a date goes last (never NaN in a sort).
const dateNum = (d?: string): number => {
  const n = d ? Date.parse(d) : NaN;
  return Number.isFinite(n) ? n : 0;
};

export function toggleCategory(selected: string[], id: string): string[] {
  if (id === "all") return [];
  return selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id];
}

export function filterAndSortPrograms<T extends CatalogProgram>(programs: T[], f: CatalogFilters): T[] {
  let out = [...programs];

  // CATEGORY — matches against `tags` (what real program data has)
  if (f.categories.length > 0) out = out.filter((p) => categoriesForTags(p.tags).some((c) => f.categories.includes(c)));

  // SEARCH — by title or author name (trimmed, case-insensitive)
  const q = f.search.trim().toLowerCase();
  if (q) out = out.filter((p) => p.title.toLowerCase().includes(q) || (p.author ?? "").toLowerCase().includes(q));

  // PRICE
  if (f.price === "free") out = out.filter((p) => isFreePrice(p.price));
  if (f.price === "low") out = out.filter((p) => priceNum(p.price) > 0 && priceNum(p.price) <= 1000);
  if (f.price === "medium") out = out.filter((p) => priceNum(p.price) > 1000 && priceNum(p.price) <= 2000);
  if (f.price === "high") out = out.filter((p) => priceNum(p.price) > 2000);

  // SORT ("default" and "popular" keep the source order: there is no popularity signal yet)
  if (f.sort === "rating") out.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  if (f.sort === "new") out.sort((a, b) => dateNum(b.addedAt) - dateNum(a.addedAt));
  if (f.sort === "cheap") out.sort((a, b) => priceNum(a.price) - priceNum(b.price));
  if (f.sort === "expensive") out.sort((a, b) => priceNum(b.price) - priceNum(a.price));

  return out;
}

export type ActiveChip = { key: string; label: string; clear: { kind: "search" | "price" | "sort" | "category"; id?: string } };

/** Removable chips for everything that differs from the defaults. */
export function activeChips(f: CatalogFilters): ActiveChip[] {
  const chips: ActiveChip[] = [];
  if (f.search.trim()) chips.push({ key: "search", label: `«${f.search.trim()}»`, clear: { kind: "search" } });
  for (const id of f.categories) {
    chips.push({ key: `cat:${id}`, label: CATEGORIES.find((c) => c.id === id)?.label ?? id, clear: { kind: "category", id } });
  }
  if (f.price !== "all") chips.push({ key: "price", label: PRICE_OPTIONS.find((o) => o.id === f.price)?.label ?? f.price, clear: { kind: "price" } });
  if (f.sort !== "default") chips.push({ key: "sort", label: SORT_OPTIONS.find((o) => o.id === f.sort)?.label ?? f.sort, clear: { kind: "sort" } });
  return chips;
}

export function applyClear(f: CatalogFilters, clear: ActiveChip["clear"]): CatalogFilters {
  switch (clear.kind) {
    case "search": return { ...f, search: "" };
    case "price": return { ...f, price: "all" };
    case "sort": return { ...f, sort: "default" };
    case "category": return { ...f, categories: f.categories.filter((c) => c !== clear.id) };
  }
}
