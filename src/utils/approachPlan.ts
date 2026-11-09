// «Підхід і напрями» is assembled from what the author actually wrote — no
// defaults, no placeholders. Every module is optional; this pure function turns
// the saved story + the real catalog counts into a small plan the page renders,
// so the composition rules are testable (components/author/public/AuthorMe.tsx).
//
// Modules (all optional)            source
//   Заголовок (≤100 символів)       story.viewpoint
//   Підзаголовок (≤260)             story.viewpointNote — else the profile «Підхід» copy
//   Як це виглядає на практиці      story.steps (shown with ≥2 complete steps)
//   Що для мене важливо             story.principles
//   Чого очікувати від матеріалів   story.offers
//   Межі моєї роботи                story.notOffers
//   Що я створюю                    real published counts (only categories with content)
// A block the author hid keeps its content but is not shown.
//
// Composition rules (the only layout decisions):
//  1 focal   one soft panel: the heading (bold) and the sub-heading under it, each only when written.
//  2 steps   up to 6; 2 → 2 columns, 3 → 3, 4 → 2×2, 5–6 → 3 per row; <2 complete steps → no sequence.
//  3 lower   principles → tiles (1/2/3 columns, 4 → 2×2); «чого очікувати» + catalog beside each other only when both exist.
//  4 footnote boundaries only when written.
import { visibleBlocks, type AuthorStory, type StoryStep } from "./authorStory.ts";

export type MaterialKind = "program" | "meditation" | "guide";
const KIND_ORDER: MaterialKind[] = ["program", "meditation", "guide"];


export type ApproachPlan = {
  show: boolean;
  text: string; // lead + body, for «is there anything to say» checks
  // heading + sub-heading of the block, as the author wrote them (either may be empty)
  lead: string;
  body: string;
  steps: StoryStep[];
  stepCols: 0 | 2 | 3;
  principles: { text: string; icon: string }[];
  offers: { text: string; icon: string }[];
  notOffers: string[];
  kinds: MaterialKind[];
  lower: "none" | "single" | "split";
  hasValues: boolean;
  // principles as tiles: 1 → one wide tile, 2 → two, 3 → three, 4 → 2×2 (never a half-empty row)
  principleCols: 0 | 1 | 2 | 3;
  // «чого очікувати» + the catalog, beside each other only when both exist
  extras: "none" | "single" | "split";
};

export function approachPlan(
  story: AuthorStory,
  extra: { approach?: string; counts?: Partial<Record<MaterialKind, number>>; canOpen?: boolean }
): ApproachPlan {
  const v = visibleBlocks(story);
  // heading = the statement; sub-heading = its explanation, else the profile «Підхід» copy as a plain paragraph
  const lead = v.viewpoint ? story.viewpoint.trim() : "";
  const body = (lead ? story.viewpointNote.trim() : "") || (extra.approach ?? "").trim();
  const text = [lead, body].filter(Boolean).join(" ");

  const steps = v.how ? v.steps : [];
  // 2 → 2 columns, 3 → 3, 4 → 2×2, 5–6 → 3 per row (never a lone card in a row of four)
  const stepCols = steps.length < 2 ? 0 : steps.length === 2 || steps.length === 4 ? 2 : 3;

  const principles = v.principles ? story.principles.map((text, i) => ({ text, icon: story.principleIcons[i] ?? "" })) : [];
  const offers = v.limits ? story.offers.map((text, i) => ({ text, icon: story.offerIcons[i] ?? "" })) : [];
  const notOffers = v.limits ? story.notOffers : [];
  const kinds = extra.canOpen ? KIND_ORDER.filter((k) => (extra.counts?.[k] ?? 0) > 0) : [];

  const hasValues = principles.length > 0 || offers.length > 0;
  const lower = hasValues && kinds.length > 0 ? "split" : hasValues || kinds.length > 0 ? "single" : "none";

  const principleCols = principles.length === 0 ? 0 : principles.length === 4 ? 2 : (principles.length as 1 | 2 | 3);
  const extras = offers.length > 0 && kinds.length > 0 ? "split" : offers.length > 0 || kinds.length > 0 ? "single" : "none";

  const show = text !== "" || stepCols > 0 || lower !== "none" || notOffers.length > 0;
  return { show, text, lead, body, steps, stepCols, principles, offers, notOffers, kinds, lower, hasValues, principleCols, extras };
}
