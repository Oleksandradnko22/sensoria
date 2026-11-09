// "Може бути корисно разом із цим гайдом" (2026-10-06, guide preview
// page) — a compact, honest set of related Sensoria content, so a guide
// leads into the rest of the ecosystem: Guide → Meditation → Program.
//
// No new recommendation engine and nothing invented. Two real signals,
// in this order of trust:
//   1. links the guide's own author already placed (meditationLink /
//      guideLink / programLink blocks in `content`, plus the quick-mode
//      and SOS practice links) — an author's explicit "go here next"
//      beats any inferred match;
//   2. otherwise the best overlap of emotional-topic tags
//      (data/categoryLabels.ts vocabulary, the same one
//      utils/relevantContent.ts and ParticipantLearning's own guide
//      scoring already match on) — an item must share at least one tag,
//      never padded with unrelated content.
// At most one item per kind, shown guide → meditation → program, capped
// at `limit` (3). The guide itself is never included, and an id can't
// appear twice.

import { guides, type Guide } from "../data/guides.ts";
import { meditations } from "../data/meditations.ts";
import { programs } from "../data/programs.ts";

export type RelatedKind = "meditation" | "program" | "guide";

export type RelatedItem = {
  kind: RelatedKind;
  id: string;
  title: string;
  // Quiet secondary line: "4 хв" / "7 днів" / "12 стор.".
  meta: string;
};

type LinkIds = { meditation: string[]; program: string[]; guide: string[] };

function collectAuthorLinks(guide: Guide): LinkIds {
  const found: LinkIds = { meditation: [], program: [], guide: [] };
  const push = (link: { type: string; meditationId?: string; programId?: string; guideId?: string }) => {
    if (link.type === "meditationLink" && link.meditationId) found.meditation.push(link.meditationId);
    if (link.type === "programLink" && link.programId) found.program.push(link.programId);
    if (link.type === "guideLink" && link.guideId) found.guide.push(link.guideId);
  };
  guide.content?.forEach(push);
  // Structured guides: a `recommendation` block may name real catalog ids.
  guide.guideContent?.forEach((block) => {
    if (block.type !== "recommendation" || !block.links) return;
    if (block.links.meditation) found.meditation.push(block.links.meditation);
    if (block.links.program) found.program.push(block.links.program);
    if (block.links.guide) found.guide.push(block.links.guide);
  });
  if (guide.quickMode?.practice) push(guide.quickMode.practice);
  if (guide.sos?.practice) push(guide.sos.practice);
  return found;
}

function overlap(a: string[], b: string[]): number {
  return a.filter((tag) => b.includes(tag)).length;
}

// Best same-topic candidate: highest tag overlap, ties broken by catalog
// order (stable and predictable, same convention as relevantContent.ts).
function bestByTags<T extends { id: string; tags: string[] }>(
  items: T[],
  tags: string[],
  exclude: string
): T | undefined {
  return items
    .map((item, index) => ({ item, index, score: overlap(item.tags, tags) }))
    .filter((entry) => entry.item.id !== exclude && entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.item;
}

export function getRelatedContent(guide: Guide, limit = 3): RelatedItem[] {
  const links = collectAuthorLinks(guide);
  const result: RelatedItem[] = [];

  const otherGuide =
    links.guide.map((id) => guides.find((g) => g.id === id && g.id !== guide.id)).find(Boolean) ??
    bestByTags(guides, guide.tags, guide.id);
  if (otherGuide) {
    result.push({
      kind: "guide",
      id: otherGuide.id,
      title: otherGuide.title,
      meta: `${otherGuide.pages} стор.`,
    });
  }

  const meditation =
    links.meditation.map((id) => meditations.find((m) => m.id === id)).find(Boolean) ??
    bestByTags(meditations, guide.tags, "");
  if (meditation) {
    result.push({ kind: "meditation", id: meditation.id, title: meditation.title, meta: meditation.duration });
  }

  const program =
    links.program.map((id) => programs.find((p) => p.id === id)).find(Boolean) ??
    bestByTags(programs, guide.tags, "");
  if (program) {
    result.push({ kind: "program", id: program.id, title: program.title, meta: program.duration });
  }

  return result.slice(0, limit);
}
