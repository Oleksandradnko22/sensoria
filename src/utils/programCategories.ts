// Categories of a program live in `tags` (ids from data/categoryLabels.ts), next to other tags (AI mark, benefits).
// Rules: 1-3 categories; the FIRST one is the primary category. The small catalog card shows only the primary one
// (utils/catalogFilters.ts -> categoryLabelForTags takes the first labelled tag), while the catalog filter matches
// a program by ANY of its categories.
import { categoryLabels } from "../data/categoryLabels.ts";

export const MAX_PROGRAM_CATEGORIES = 3;

const isCategory = (t: string) => t in categoryLabels;

export function categoryTags(tags: readonly string[] | undefined): string[] {
  return (tags ?? []).filter(isCategory);
}

export function primaryCategory(tags: readonly string[] | undefined): string | null {
  return categoryTags(tags)[0] ?? null;
}

// Add / remove a category. `limit` caps how many categories may be selected (extra ones are ignored).
export function toggleCategoryTag(tags: readonly string[], id: string, limit?: number): string[] {
  if (tags.includes(id)) return tags.filter((t) => t !== id);
  if (limit !== undefined && isCategory(id) && categoryTags(tags).length >= limit) return [...tags];
  return [...tags, id];
}

// Make `id` the primary category: it moves in front of the other categories.
export function makePrimaryCategory(tags: readonly string[], id: string): string[] {
  if (!tags.includes(id) || !isCategory(id)) return [...tags];
  const cats = [id, ...categoryTags(tags).filter((t) => t !== id)];
  return [...cats, ...tags.filter((t) => !isCategory(t))];
}

// Stored order: categories first (primary first), then the other tags — so «first category» is always the primary one.
export function orderTags(tags: readonly string[]): string[] {
  const cats = categoryTags(tags);
  return [...cats, ...tags.filter((t) => !isCategory(t))];
}

export function categoriesProblem(tags: readonly string[] | undefined): string | null {
  const n = categoryTags(tags).length;
  if (n === 0) return "Оберіть хоча б одну категорію: за нею учасники знайдуть програму в каталозі.";
  if (n > MAX_PROGRAM_CATEGORIES) return `Оберіть не більше ${MAX_PROGRAM_CATEGORIES} категорій, зараз ${n}.`;
  return null;
}
