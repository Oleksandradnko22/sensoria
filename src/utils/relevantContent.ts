import type { PrimaryStateId } from "../store/funnelStore.ts";
import { programs } from "../data/programs.ts";
import { meditations } from "../data/meditations.ts";
import { guides } from "../data/guides.ts";

// Shared relevance scoring for every content type on the Library home
// page: a primary-state tag match matters more than a secondary-state
// one, and anything with neither still shows up (sorted to the back)
// rather than being hidden — an empty section would read as broken,
// not curated. `Array.prototype.sort` is not guaranteed stable across
// every engine for large arrays, so we decorate-sort-undecorate on the
// original index to guarantee ties keep their authored order instead of
// shuffling on every render.
function sortByRelevance<T extends { tags: string[] }>(
  items: T[],
  primaryState: PrimaryStateId,
  secondaryState: PrimaryStateId | null
): T[] {
  return items
    .map((item, index) => {
      const score = item.tags.includes(primaryState)
        ? 2
        : secondaryState && item.tags.includes(secondaryState)
        ? 1
        : 0;
      return { item, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

export function getRelevantCourses(
  primaryState: PrimaryStateId,
  secondaryState: PrimaryStateId | null,
  limit = 5
) {
  return sortByRelevance(programs, primaryState, secondaryState).slice(
    0,
    limit
  );
}

export function getRelevantMeditations(
  primaryState: PrimaryStateId,
  secondaryState: PrimaryStateId | null,
  limit = 5
) {
  return sortByRelevance(meditations, primaryState, secondaryState).slice(
    0,
    limit
  );
}

export function getRelevantGuides(
  primaryState: PrimaryStateId,
  secondaryState: PrimaryStateId | null,
  limit = 5
) {
  return sortByRelevance(guides, primaryState, secondaryState).slice(
    0,
    limit
  );
}

// Every REAL match for a state — score > 0 only, no padding with
// unrelated items and no artificial limit (2026-09-11, per Sasha's
// explicit "можливість подивитись всі програми/медитації/гайди, що
// підходять під стан" request for the Emotional Profile page). Same
// scoring rule as sortByRelevance above (primary-state tag outweighs
// secondary), just filtered instead of "always show everything, sorted
// to the back" — that padding is right for the Library home page (an
// empty section reads as broken there), but wrong here: a "matches your
// state" list that quietly includes non-matches would be dishonest.
function filterToRealMatches<T extends { tags: string[] }>(
  items: T[],
  primaryState: PrimaryStateId,
  secondaryState: PrimaryStateId | null
): T[] {
  return items
    .map((item, index) => {
      const score = item.tags.includes(primaryState)
        ? 2
        : secondaryState && item.tags.includes(secondaryState)
        ? 1
        : 0;
      return { item, score, index };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

export function getAllRelevantCourses(
  primaryState: PrimaryStateId,
  secondaryState: PrimaryStateId | null
) {
  return filterToRealMatches(programs, primaryState, secondaryState);
}

export function getAllRelevantMeditations(
  primaryState: PrimaryStateId,
  secondaryState: PrimaryStateId | null
) {
  return filterToRealMatches(meditations, primaryState, secondaryState);
}

export function getAllRelevantGuides(
  primaryState: PrimaryStateId,
  secondaryState: PrimaryStateId | null
) {
  return filterToRealMatches(guides, primaryState, secondaryState);
}

// "Рекомендуємо почати з цього" — one of each content type, each the
// single most relevant item of its kind. Deliberately not "top 3 by
// score across all types" (which could easily land on 3 courses and
// read as a marketplace upsell) — the brief is explicit that this
// section must mix formats.
export function getFeaturedMix(
  primaryState: PrimaryStateId,
  secondaryState: PrimaryStateId | null
) {
  return {
    course: getRelevantCourses(primaryState, secondaryState, 1)[0],
    meditation: getRelevantMeditations(primaryState, secondaryState, 1)[0],
    guide: getRelevantGuides(primaryState, secondaryState, 1)[0],
  };
}
