// Search, duration, state and sort rules of the meditations catalog. Kept out of the page so
// they can be tested (the guides and programs catalogs do the same).
import { CATALOG_SORT_OPTIONS, type CatalogSortId } from "./catalogSort.ts";

export type MeditationLike = {
  title: string;
  description?: string;
  durationMinutes: number;
  tags: string[];
  // optional, like on guides: a meditation without them simply keeps the catalog order in that sort
  tag?: string;
  publishedAt?: string;
  rating?: number;
};

export type MeditationSortId = CatalogSortId;

// the same list as the programs and guides catalogs
export const MEDITATION_SORT_OPTIONS = CATALOG_SORT_OPTIONS;

export const MEDITATION_DURATION_OPTIONS = ["Будь-яка", "До 5 хв", "5–10 хв", "Понад 10 хв"];

export type MeditationFilters = {
  search: string;
  duration: string; // one of MEDITATION_DURATION_OPTIONS
  states: string[]; // emotional-state tags; empty = no state filter
  sort: MeditationSortId;
};

export const DEFAULT_MEDITATION_FILTERS: MeditationFilters = { search: "", duration: "Будь-яка", states: [], sort: "default" };

export function matchesDuration(minutes: number, selected: string): boolean {
  switch (selected) {
    case "До 5 хв":
      return minutes <= 5;
    case "5–10 хв":
      return minutes > 5 && minutes <= 10;
    case "Понад 10 хв":
      return minutes > 10;
    default:
      return true;
  }
}

export function filterAndSortMeditations<T extends MeditationLike>(items: T[], f: MeditationFilters): T[] {
  const q = f.search.trim().toLowerCase();
  const list = items.filter(
    (m) =>
      (f.states.length === 0 || m.tags.some((t) => f.states.includes(t))) &&
      matchesDuration(m.durationMinutes, f.duration) &&
      (!q || m.title.toLowerCase().includes(q) || (m.description ?? "").toLowerCase().includes(q)),
  );
  // Array.prototype.sort is stable, so equal items keep the catalog order. Every meditation is free, so
  // «Дешеві» and «Дорогі» leave the order as it is.
  const dateOf = (m: MeditationLike) => {
    const n = m.publishedAt ? Date.parse(m.publishedAt) : NaN;
    return Number.isFinite(n) ? n : 0;
  };
  switch (f.sort) {
    case "popular":
      return [...list].sort((a, b) => Number(b.tag === "Популярний") - Number(a.tag === "Популярний"));
    case "rating":
      return [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    case "new":
      return [...list].sort((a, b) => dateOf(b) - dateOf(a));
    default:
      return list;
  }
}
