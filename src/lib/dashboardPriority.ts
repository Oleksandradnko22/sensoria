// Data-driven "next best action" engine for the participant Dashboard
// ("Огляд") — added 2026-09-11 per Sasha's full Dashboard redesign spec.
//
// Her spec asks for a 5-tier priority (active content → last opened →
// last unfinished → highest progress → current plan), computed by a
// real, extensible function rather than hardcoded per-content-type
// `if` branches. The actual data model this app has today
// (data/participantDashboard.ts's `enrollments`) already carries a real
// `lastAccessedAt` per item alongside `status`/`progressPercent` — that
// single field is simultaneously the closest honest signal we have for
// both "active" and "last opened" for every content kind alike, so
// those two tiers collapse into one real sort key here (most recent
// access wins) instead of two separate signals that don't actually
// exist in the data. "Highest progress" becomes a deterministic
// tiebreak for two items accessed at the exact same time. There is no
// "current plan" concept anywhere in the data model — inventing one
// here would be exactly the kind of fabricated state Sasha's spec warns
// against, so it's intentionally left out rather than faked.
//
// Every function below reads `enrollments` — the same static ground
// truth every other participant screen already reads "what has this
// person bought/started" from (see that file's own header comments for
// why this remains prototype-only, not per-real-account, today). None
// of that is new here; what's new is that the DERIVED picking logic is
// a real, generic function instead of another hand-typed answer.

import { enrollments, savedContent, type ContentKind, type Enrollment } from "../data/participantDashboard.ts";
import { programs } from "../data/programs.ts";
import { meditations, type Meditation } from "../data/meditations.ts";
import { guides } from "../data/guides.ts";
import {
  getRelevantCourses,
  getRelevantMeditations,
  getRelevantGuides,
  getAllRelevantCourses,
  getAllRelevantMeditations,
  getAllRelevantGuides,
} from "../utils/relevantContent.ts";
import type { PrimaryStateId } from "../store/funnelStore.ts";
import { excludeOwnedAndDiversify } from "./contentDiversity.ts";

// The single item the "Продовжити" hero block should show — the most
// recently touched thing that isn't finished yet. Null means there's
// genuinely nothing in progress right now (a brand-new, or a
// fully-caught-up, participant) — callers fall back to
// pickEmptyStateAction below, since Dashboard must always offer
// SOMETHING to do next.
export function pickContinueEnrollment(source: Enrollment[] = enrollments): Enrollment | null {
  const candidates = source.filter((e) => e.status === "in-progress");
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const byRecency = new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime();
    if (byRecency !== 0) return byRecency;
    return b.progressPercent - a.progressPercent;
  })[0];
}

// How many OTHER in-progress items exist besides the one already shown
// as the primary action — feeds "Ще N незавершені матеріали →". A 0%
// item is genuinely "Не розпочато" (see accessLabel in
// ParticipantOverview.tsx), not "незавершений" in the sense a person
// means it here — someone who never opened something wouldn't call it
// "unfinished", only something they actually started and left midway.
// Excluding those keeps this number matching what the person actually
// sees when they click through to "У процесі" expecting real partial
// progress on every row.
export function countOtherUnfinished(
  excludeContentId: string,
  source: Enrollment[] = enrollments
): number {
  return source.filter(
    (e) => e.status === "in-progress" && e.progressPercent > 0 && e.contentId !== excludeContentId
  ).length;
}

// Up to `limit` items for the compact "Моє навчання" preview — never
// the full library (Sasha's explicit "не 8-15 карток" call). In-progress
// items surface first (most recently touched first), then completed
// ones — a person who just finished something still wants to see that
// reflected here, not only what's still open. `excludeContentId` keeps
// whatever is already shown as the hero "Продовжити" card from also
// appearing a second time immediately below it.
export function pickLearningPreview(
  limit = 3,
  excludeContentId: string | null = null,
  source: Enrollment[] = enrollments
): Enrollment[] {
  const rank = (e: Enrollment) => (e.status === "in-progress" ? 0 : 1);
  return [...source]
    .filter((e) => e.contentId !== excludeContentId)
    .sort((a, b) => {
      const byRank = rank(a) - rank(b);
      if (byRank !== 0) return byRank;
      return new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime();
    })
    .slice(0, limit);
}

// When nothing is in progress, Dashboard still needs a real next
// action (Sasha: "Dashboard завжди повинен мати next action"). With a
// real assessment result, this reuses the exact same relevance engine
// as the rest of the app (utils/relevantContent.ts) rather than a
// second scoring system — the single best-matching meditation, per her
// own worked example ("Швидке заземлення"). Without an assessment yet,
// falls back to the single shortest real meditation in the catalog — a
// genuine "почати з малого" pick derived from real duration data, not a
// hand-picked id.
export function pickEmptyStateMeditation(
  insight: { primaryState: PrimaryStateId; secondaryState: PrimaryStateId | null } | null
): Meditation | null {
  if (insight) {
    const top = getRelevantMeditations(insight.primaryState, insight.secondaryState, 1)[0];
    if (top) return top;
  }
  if (meditations.length === 0) return null;
  return [...meditations].sort((a, b) => a.durationMinutes - b.durationMinutes)[0];
}

export type FeaturedPick = {
  course?: (typeof programs)[number];
  meditation?: Meditation;
  guide?: (typeof guides)[number];
};

// Shared by pickFeaturedExcludingOwned and pickTopMatchesExcludingOwned
// below — "what does this person already own, per content type" as one
// lookup instead of separate copies of the same Set constructions.
//
// `programActivityIds` (2026-09-21, MVP product decision — real program
// activity excludes, saved-only does not, no entitlement system exists)
// — when supplied, REPLACES `source` entirely for the "program" key
// only; guide/meditation always derive from `source`, unchanged. This
// is deliberately not a merge: the whole point is that a real caller
// (ParticipantOverview/ParticipantEmotionalProfile, via
// context/ProgramParticipationContext.tsx) can hand this the id set of
// programs with real content_progress activity — which, by that
// context's own contract, already excludes saved-only programs (a
// saved-only LearningItem never gets an `.enrollment`) — instead of the
// single hardcoded static `enrollments` array that has no relationship
// to what the signed-in participant actually did. Omitting the
// parameter (every existing caller before this change, and guides/
// meditations today) keeps the exact old behavior: program ownership
// derived from `source` like every other kind. Exported so this can be
// unit-tested directly, independent of the real catalog/relevance scan
// pickFeaturedExcludingOwned/pickTopMatchesExcludingOwned also do.
export function buildOwnedByKind(
  source: Enrollment[],
  programActivityIds?: Iterable<string>
): Record<ContentKind, Set<string>> {
  return {
    program:
      programActivityIds !== undefined
        ? new Set(programActivityIds)
        : new Set(source.filter((e) => e.kind === "program").map((e) => e.contentId)),
    meditation: new Set(source.filter((e) => e.kind === "meditation").map((e) => e.contentId)),
    guide: new Set(source.filter((e) => e.kind === "guide").map((e) => e.contentId)),
  };
}

// Same "Підібрано для вас" mix as getFeaturedMix (utils/relevantContent.ts)
// — one of each content type, most relevant first — but with anything
// the person already owns filtered out first. Per Sasha's explicit
// access/purchase rule: "не змішувати придбаний і рекомендований
// контент" — a recommendation tile for something already enrolled
// would blur exactly that distinction. Reuses the existing relevance
// scan (asks for a few extra candidates, takes the first not-owned one)
// instead of duplicating its scoring logic.
//
// `programActivityIds` (optional, 2026-09-21) — see buildOwnedByKind's
// own comment; pass the real program-participation id set here to
// exclude by real activity instead of the static demo `enrollments`
// array. Guides/meditations are unaffected either way — omit this
// param and program ownership falls back to `source`, same as before.
//
// Candidate order (2026-09-21 bug fix, per the post-migration recom-
// mendation audit's Section 6/BUG #2 finding): this used to ask
// getRelevantCourses/Meditations/Guides for a fixed pool of 5, THEN
// exclude owned ids from that pool via `.find()` — so if 5+ of the
// top-ranked items happened to be owned, the slot came back empty even
// though an eligible item existed further down the (still fully
// relevance-sorted) list. getRelevantX's own padding/ordering logic
// lives entirely in relevantContent.ts's sortByRelevance, which always
// sorts the FULL catalog and only slices at the very end — so passing
// Infinity as the limit here just skips that final slice and hands
// back the whole relevance-ordered list, unsliced. Excluding owned ids
// and taking the first remaining item now happens over that complete
// list instead of a truncated pool. Scoring, ordering, and the padding
// behavior itself (still the same sortByRelevance) are untouched;
// relevantContent.ts was not modified.
export function pickFeaturedExcludingOwned(
  primaryState: PrimaryStateId,
  secondaryState: PrimaryStateId | null,
  source: Enrollment[] = enrollments,
  programActivityIds?: Iterable<string>
): FeaturedPick {
  const ownedByKind = buildOwnedByKind(source, programActivityIds);
  return {
    course: getRelevantCourses(primaryState, secondaryState, Infinity).find((c) => !ownedByKind.program.has(c.id)),
    meditation: getRelevantMeditations(primaryState, secondaryState, Infinity).find(
      (m) => !ownedByKind.meditation.has(m.id)
    ),
    guide: getRelevantGuides(primaryState, secondaryState, Infinity).find((g) => !ownedByKind.guide.has(g.id)),
  };
}

export type TopMatches = {
  courses: (typeof programs)[number][];
  meditations: Meditation[];
  guides: (typeof guides)[number][];
};

// "Що може допомогти зараз" — up to `limitPerType` real, owned-excluded
// matches per content type (2026-09-15 redesign), author-diversified
// within each type. Built on the exact same relevance scan and
// ownership-exclusion as everywhere else on this page — this adds a cap
// and the diversity pass on top, it doesn't re-derive relevance or
// ownership itself.
//
// `programActivityIds` (optional, 2026-09-21) — same real-activity
// override as pickFeaturedExcludingOwned above; see buildOwnedByKind's
// own comment. Omit to keep program ownership derived from `source`,
// same as guides/meditations always are.
export function pickTopMatchesExcludingOwned(
  primaryState: PrimaryStateId,
  secondaryState: PrimaryStateId | null,
  limitPerType = 3,
  source: Enrollment[] = enrollments,
  programActivityIds?: Iterable<string>
): TopMatches {
  const ownedByKind = buildOwnedByKind(source, programActivityIds);
  const courses = getAllRelevantCourses(primaryState, secondaryState);
  const meds = getAllRelevantMeditations(primaryState, secondaryState);
  const gds = getAllRelevantGuides(primaryState, secondaryState);
  // Exclude-owned + diversify + cap is now one shared, independently
  // tested pipeline (2026-09-16 audit) — see contentDiversity.ts's
  // excludeOwnedAndDiversify for why this was extracted.
  return {
    courses: excludeOwnedAndDiversify(courses, ownedByKind.program, limitPerType, (c) => c.id, (c) => c.author),
    // Meditations have no author concept anywhere in the app today (see
    // MeditationCard.tsx's own comment — "no author" is a deliberate,
    // existing product decision, not a gap this function should paper
    // over) — `() => null` means every item is treated as its own
    // "author," so this is plain relevance order, same as before.
    meditations: excludeOwnedAndDiversify(meds, ownedByKind.meditation, limitPerType, (m) => m.id, () => null),
    guides: excludeOwnedAndDiversify(gds, ownedByKind.guide, limitPerType, (g) => g.id, (g) => g.author),
  };
}

// A saved-only (bookmarked, never purchased/started) item still counts
// as real personal signal worth knowing about elsewhere ("Збережене"
// tab) — but per Sasha's explicit "не всю бібліотеку, лише релевантне"
// state-check, Dashboard itself never needs to enumerate it. Exported
// only so callers can cheaply check "does this person have ANY saved
// content at all" without importing participantDashboard directly.
export function hasSavedContent(): boolean {
  return savedContent.length > 0;
}
