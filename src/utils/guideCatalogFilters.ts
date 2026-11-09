// Search, price, format, state and sort rules of the guides catalog. One implementation, kept out of
// the page so it can be tested (the programs catalog does the same in catalogFilters.ts).
import { isFreePrice, parsePrice } from "./price.ts";
import { CATALOG_SORT_OPTIONS } from "./catalogSort.ts";

export type GuideLike = {
  title: string;
  author?: string;
  price: string;
  tags: string[];
  category: string;
  tag?: string;
  publishedAt?: string;
  rating?: number;
};

export type GuideSortId = "default" | "popular" | "rating" | "new" | "cheap" | "expensive";

export const GUIDE_SORT_OPTIONS: { id: GuideSortId; label: string }[] = CATALOG_SORT_OPTIONS;

export const GUIDE_PRICE_OPTIONS = ["Усі ціни", "Безкоштовно", "До 1000₴", "1000–2000₴", "2000₴+"];
export const GUIDE_FORMAT_OPTIONS = ["Усі", "Чек-листи", "PDF-гайди", "Воркбуки", "Міні-гайди"];

export type GuideFilters = {
  search: string;
  price: string; // one of GUIDE_PRICE_OPTIONS
  format: string; // one of GUIDE_FORMAT_OPTIONS
  states: string[]; // emotional-state tags; empty = no state filter
  sort: GuideSortId;
};

export const DEFAULT_GUIDE_FILTERS: GuideFilters = { search: "", price: "Усі ціни", format: "Усі", states: [], sort: "default" };

// A price that is missing or not a number counts as 0 in a sort (never NaN).
const priceOf = (g: GuideLike) => parsePrice(g.price) ?? 0;

// Newest first; a guide without a date goes last.
const dateOf = (g: GuideLike) => {
  const n = g.publishedAt ? Date.parse(g.publishedAt) : NaN;
  return Number.isFinite(n) ? n : 0;
};

export function matchesGuidePrice(g: GuideLike, selected: string): boolean {
  const p = priceOf(g);
  switch (selected) {
    case "Безкоштовно":
      return isFreePrice(g.price);
    case "До 1000₴":
      return p > 0 && p <= 1000;
    case "1000–2000₴":
      return p > 1000 && p <= 2000;
    case "2000₴+":
      return p > 2000;
    default:
      return true;
  }
}

export function filterAndSortGuides<T extends GuideLike>(guides: T[], f: GuideFilters): T[] {
  const q = f.search.trim().toLowerCase();
  const list = guides.filter(
    (g) =>
      (f.states.length === 0 || g.tags.some((t) => f.states.includes(t))) &&
      // by title or author name, like the programs catalog
      (!q || g.title.toLowerCase().includes(q) || (g.author ?? "").toLowerCase().includes(q)) &&
      matchesGuidePrice(g, f.price) &&
      (f.format === "Усі" || g.category === f.format),
  );
  // "default" keeps the catalog order; "popular" lifts the guides marked «Популярний» (stable for the rest)
  switch (f.sort) {
    case "popular":
      return [...list].sort((a, b) => Number(b.tag === "Популярний") - Number(a.tag === "Популярний"));
    case "rating":
      return [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    case "new":
      return [...list].sort((a, b) => dateOf(b) - dateOf(a));
    case "cheap":
      return [...list].sort((a, b) => priceOf(a) - priceOf(b));
    case "expensive":
      return [...list].sort((a, b) => priceOf(b) - priceOf(a));
    default:
      return list;
  }
}
