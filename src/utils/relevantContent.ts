import type { PrimaryStateId } from "../store/funnelStore.ts";
import { programs, type Program } from "../data/programs.ts";
import { meditations } from "../data/meditations.ts";
import { guides } from "../data/guides.ts";
import { isFreePrice, type PriceInput } from "./price.ts";
import { isHighRisk } from "./riskTopics.ts";
import { categoryLabels } from "../data/categoryLabels.ts";

// Recommendations by the assessment (version 2, 21.11.2026) — one rule for every place that recommends:
// - only REAL matches: the chosen state (3) > the second chosen state (2) > a topic the assessment found elevated (1);
//   nothing unrelated is added to fill a list (an honest short list beats a padded one);
// - the real catalog: meditations and guides are the arrays updated in place from the database (publicMaterials.ts),
//   programs are the pool App.tsx sets once the published ones are read (setRecommendationPrograms);
//   the database itself only returns published materials that are on sale (RLS, complaints-migration.sql);
// - «gentle» (a very pronounced state or a strong impact on life): free materials first, deep topics that are better
//   gone through with a specialist (risk topics) last;
// - ties keep the authored order.

let programPool: Program[] = programs;
/** App.tsx: demo (if shown) + published programs, so recommendations see what the catalog sees. */
export function setRecommendationPrograms(list: Program[]) {
  programPool = list;
}

// The two signal categories of questionnaire version 1 → the states they stand for.
const PATTERN_STATES: Record<string, PrimaryStateId[]> = {
  emotionalBalance: ["stress", "anxiety"],
  innerPressure: ["selfEsteem", "burnout"],
};
export function patternTags(categories: readonly string[]): string[] {
  return [...new Set(categories.flatMap((c) => PATTERN_STATES[c] ?? [c]))];
}

export type MatchContext = {
  /** supporting-pattern categories from the assessment (either version) */
  extraTags?: readonly string[];
  /** a very pronounced state or a strong impact on life */
  gentle?: boolean;
};

type Rankable = { tags: string[]; price?: PriceInput; title?: string; description?: string; durationMinutes?: number };

export function matchScore(item: { tags: string[] }, primary: PrimaryStateId, secondary: PrimaryStateId | null, extra: readonly string[]): number {
  if (item.tags.includes(primary)) return 3;
  if (secondary && item.tags.includes(secondary)) return 2;
  return patternTags(extra).some((t) => item.tags.includes(t)) ? 1 : 0;
}

/** Real matches only, best first. */
export function rankMatches<T extends Rankable>(
  items: readonly T[],
  primary: PrimaryStateId,
  secondary: PrimaryStateId | null,
  ctx: MatchContext = {}
): T[] {
  const extra = ctx.extraTags ?? [];
  const gentle = !!ctx.gentle;
  return items
    .map((item, index) => ({
      item,
      index,
      score: matchScore(item, primary, secondary, extra),
      free: gentle && isFreePrice(item.price) ? 1 : 0,
      risky: gentle && isHighRisk(item) ? 1 : 0,
      minutes: gentle ? item.durationMinutes ?? Number.MAX_SAFE_INTEGER : 0,
    }))
    .filter((e) => e.score > 0)
    .sort((a, b) => a.risky - b.risky || b.free - a.free || b.score - a.score || a.minutes - b.minutes || a.index - b.index)
    .map((e) => e.item);
}

/** gentle mode for a fresh result (FunnelInsight.safety) or a saved one (SavedAssessment.details.safety) */
export function needsGentle(x: unknown): boolean {
  if (!x || typeof x !== "object") return false;
  const o = x as { safety?: unknown; details?: { safety?: unknown } | null };
  return o.safety === true || o.details?.safety === true;
}

const label = (id: string) => (categoryLabels[id as keyof typeof categoryLabels] ?? id).toLowerCase();

/** «Чому підібрано» — one line for the whole selection. */
export function selectionReason(primary: PrimaryStateId, secondary: PrimaryStateId | null, extra: readonly string[] = []): string {
  const chosen = secondary ? `«${label(primary)}» і «${label(secondary)}»` : `«${label(primary)}»`;
  const more = patternTags(extra).filter((t) => t !== primary && t !== secondary);
  const tail = more.length ? `, а також ${more.map((t) => `«${label(t)}»`).join(" і ")}, що теж помітно у відповідях` : "";
  return `Підібрано за станом ${chosen}${tail}. Лише матеріали з цими темами, без випадкових.`;
}

export function getRelevantCourses(primaryState: PrimaryStateId, secondaryState: PrimaryStateId | null, limit = 5, ctx: MatchContext = {}) {
  return rankMatches(programPool, primaryState, secondaryState, ctx).slice(0, limit);
}

export function getRelevantMeditations(primaryState: PrimaryStateId, secondaryState: PrimaryStateId | null, limit = 5, ctx: MatchContext = {}) {
  return rankMatches(meditations, primaryState, secondaryState, ctx).slice(0, limit);
}

export function getRelevantGuides(primaryState: PrimaryStateId, secondaryState: PrimaryStateId | null, limit = 5, ctx: MatchContext = {}) {
  return rankMatches(guides, primaryState, secondaryState, ctx).slice(0, limit);
}

export function getAllRelevantCourses(primaryState: PrimaryStateId, secondaryState: PrimaryStateId | null, extraTags: readonly string[] = [], gentle = false) {
  return rankMatches(programPool, primaryState, secondaryState, { extraTags, gentle });
}

export function getAllRelevantMeditations(primaryState: PrimaryStateId, secondaryState: PrimaryStateId | null, extraTags: readonly string[] = [], gentle = false) {
  return rankMatches(meditations, primaryState, secondaryState, { extraTags, gentle });
}

export function getAllRelevantGuides(primaryState: PrimaryStateId, secondaryState: PrimaryStateId | null, extraTags: readonly string[] = [], gentle = false) {
  return rankMatches(guides, primaryState, secondaryState, { extraTags, gentle });
}

// "Рекомендуємо почати з цього" — the single best item of each format (never three courses: the mix must vary).
export function getFeaturedMix(primaryState: PrimaryStateId, secondaryState: PrimaryStateId | null, ctx: MatchContext = {}) {
  return {
    course: getRelevantCourses(primaryState, secondaryState, 1, ctx)[0],
    meditation: getRelevantMeditations(primaryState, secondaryState, 1, ctx)[0],
    guide: getRelevantGuides(primaryState, secondaryState, 1, ctx)[0],
  };
}
