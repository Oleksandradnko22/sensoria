// Context-aware recommendations that come from what someone actually
// DOES on Sensoria, not just their one-time assessment result
// (utils/relevantContent.ts's tag-based catalog matching) — per
// Sasha's explicit product spec: "рекомендації формуються не тільки з
// каталогу, а й з поведінки користувача." Two behavioral triggers,
// matching her own two worked examples exactly:
//
//  - finishing a program → the single best-matching guide by tag
//    overlap with that program, shown as "Спробуйте цей гайд далі" on
//    the program's own completion screen (ProgramExperience.tsx).
//  - repeatedly opening meditations that share a tag → that tag's
//    best-matching guide, shown as an ambient "Може бути корисно" card
//    (ParticipantOverview.tsx). Uses meditationSessionStore's real,
//    live-updating sessionCount per meditation (a session someone
//    STARTED, not only ones they finished — a repeated pattern shows
//    up before anyone ever completes a single session).
//
// Both stay deliberately simple for now: one behavioral signal → one
// recommended guide, no cross-type recommendations (a meditation habit
// could just as easily point at a program) and no weighting beyond raw
// tag-overlap/session counts. Easy to broaden later — the point right
// now is that the mechanism is real, not that it's exhaustive.

import { guides, type Guide } from "../data/guides.ts";
import { meditations } from "../data/meditations.ts";
import { getAllSessionHistory } from "./meditationSessionStore.ts";

function bestGuideForTags(tags: string[], excludeGuideIds: Set<string>): Guide | undefined {
  let best: Guide | undefined;
  let bestScore = 0;
  for (const guide of guides) {
    if (excludeGuideIds.has(guide.id)) continue;
    const score = guide.tags.filter((t) => tags.includes(t)).length;
    if (score > bestScore) {
      bestScore = score;
      best = guide;
    }
  }
  return best;
}

// "Спробуйте цей гайд далі" — Sasha's own worked example: finishing
// «Усвідомленість у житті» surfaces a guide sharing its tags. Excludes
// anything already saved (lib/guideSaves.ts) — recommending something
// someone already keeps around isn't useful.
export function recommendGuideAfterProgram(
  programTags: string[],
  excludeGuideIds: Set<string> = new Set()
): Guide | undefined {
  return bestGuideForTags(programTags, excludeGuideIds);
}

// Minimum combined session count before a pattern counts as "часто" —
// a single listen is curiosity, not a pattern (2026-09-09, per Sasha's
// own framing: "часто відкриває"). Deliberately low — this is a demo
// with few real meditations to build up real counts against, not a
// production-scale threshold.
const MIN_SESSIONS_FOR_PATTERN = 3;

export type BehaviorGuideRecommendation = { guide: Guide; tag: string };

// "Може бути корисно" — the tag behind whichever meditations someone
// has actually opened the most (utils/meditationSessionStore.ts's real
// sessionCount, not their one-time assessment tags), matched to the
// best guide sharing it. Returns null below the repeat threshold, or
// once there's nothing left to recommend — no forced suggestion just
// to fill space.
export function recommendGuideFromMeditationBehavior(
  excludeGuideIds: Set<string> = new Set()
): BehaviorGuideRecommendation | null {
  const history = getAllSessionHistory();
  const tagCounts = new Map<string, number>();
  for (const meditation of meditations) {
    const count = history[meditation.id]?.sessionCount ?? 0;
    if (count <= 0) continue;
    for (const tag of meditation.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + count);
    }
  }

  let topTag: string | null = null;
  let topCount = 0;
  for (const [tag, count] of tagCounts) {
    if (count > topCount) {
      topCount = count;
      topTag = tag;
    }
  }
  if (!topTag || topCount < MIN_SESSIONS_FOR_PATTERN) return null;

  const guide = bestGuideForTags([topTag], excludeGuideIds);
  if (!guide) return null;
  return { guide, tag: topTag };
}
