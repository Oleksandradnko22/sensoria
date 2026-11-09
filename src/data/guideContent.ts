// Sensoria's STRUCTURED guide content model (2026-10-06).
//
// Product decision (Sasha): a Guide is a content ENTITY, not "a PDF". It can
// have up to three faces:
//   1. a Sensoria interactive version   (only when built from this model);
//   2. a standard static / PDF-friendly representation of that SAME content;
//   3. an author-uploaded PDF           (a plain PDF — never modified, never
//                                         given invented interactions).
//
// This file is the data contract for faces 1 and 2. A guide's content is an
// ordered list of blocks. Every block is plain data (no functions, no
// JSX) so the same list can be rendered by:
//   - GuideInteractiveRenderer  (components/participant) — web experience;
//   - GuideStaticRenderer       (components/participant) — printable / PDF;
//   - data/guideStatic.ts       — the pure static model both the renderer
//                                 and the tests use.
//
// THE RULE THAT SHAPES THE MODEL: an interactive block must never be able to
// exist without its underlying psychological content. So every interactive
// block carries, as ordinary required fields, everything a static page needs
// (a prompt, the options, the numbered steps of a practice, the branches of a
// tree). The optional `static` override only changes WORDING for paper
// (e.g. "Оцініть свій стан від 0 до 10"); it can never be the only place the
// content lives. guideStatic.ts derives the fallback from the same fields.
//
// Deliberately not a CMS: no nesting, no layout, no styling hooks.
//
// Persistence is by existing tables keyed on (guide id, block index) — see
// lib/guideAnswers.ts. `blockIndex` below always means the position of a block
// in the guide's flat `blocks` array, so reordering existing blocks of a
// published guide would re-map its readers' saved answers; append instead.

import { countGuideSections, type GuideBlock } from "./guideBlocks.ts";

export type GuideSource = "sensoria_structured" | "uploaded_pdf";

// "answered": the block counts as done once the person has responded to it
// (a choice made, a rating given, a note saved, an action chosen). Blocks
// without it never affect a section's state. It's a quiet signal, not
// gamification — nothing here awards or counts anything.
export type BlockCompletion = "answered";

// What a block needs to look right on paper when its web wording would not.
export type StaticOverride = {
  // Replaces `prompt` in the static version.
  prompt?: string;
  // Extra instruction line printed under the prompt ("Оцініть… від 0 до 10").
  instructions?: string;
};

type BlockBase = {
  // Stable, unique within the guide. Used for keys, answers state, and for
  // blocks that refer to one another (`compareWith`).
  id: string;
  completion?: BlockCompletion;
};

// A section starts at each heading; the heading's position gives it its
// number ("01"), and `summary` is the one-line purpose shown on the preview
// page under "Що всередині" — the outline is derived from here, never
// maintained as a second list.
export type HeadingBlock = BlockBase & { type: "heading"; text: string; summary?: string };

// Paragraphs separated by a blank line. Plain text only.
export type RichTextBlock = BlockBase & { type: "rich_text"; text: string };

export type CalloutBlock = BlockBase & {
  type: "callout";
  // calm = soft emphasis; note = a quiet aside; care = "look after yourself"
  // wording (when to seek support) — the only tone that carries a caution.
  tone?: "calm" | "note" | "care";
  title?: string;
  text: string;
};

// A linear explanation: a → b → c → d. Not interactive, and reads the same
// on paper (arrows become text).
export type FlowBlock = BlockBase & {
  type: "flow";
  title?: string;
  steps: { label: string; text?: string }[];
  caption?: string;
};

export type ChecklistItem = {
  id: string;
  label: string;
  // Shown after a SINGLE-selection choice is made (neutral acknowledgement).
  note?: string;
};

// Checklist = pick any (default), or pick one (`selection: "single"`).
export type ChecklistBlock = BlockBase & {
  type: "checklist";
  prompt: string;
  selection?: "multiple" | "single";
  items: ChecklistItem[];
  // Short neutral reflection shown once something is selected: `one` when a
  // single item is selected, `several` for two or more. Never a diagnosis.
  insight?: { one: string; several: string };
  static?: StaticOverride;
};

export type ScaleBlock = BlockBase & {
  type: "scale";
  prompt: string;
  min: number;
  max: number;
  lowLabel?: string;
  highLabel?: string;
  // Persisting a rating needs a phase (lib/guideAnswers.ts); a scale without
  // one lives only for the session.
  phase?: "before" | "after";
  // On an "after" scale: the id of the "before" scale to compare against.
  compareWith?: string;
  static?: StaticOverride;
};

export type ReflectionBlock = BlockBase & {
  type: "reflection";
  prompt: string;
  placeholder?: string;
  // Printed as a blank writing area; this many ruled lines.
  staticLines?: number;
  static?: StaticOverride;
};

export type TimerPhase = { seconds: number; text: string };

// A guided practice. `phases` drive the timer (their `text` is what the
// person reads as time passes); the SAME phases become the numbered written
// instructions on paper.
export type TimerPracticeBlock = BlockBase & {
  type: "timer_practice";
  title: string;
  intro?: string;
  phases: TimerPhase[];
  doneText: string;
  static?: StaticOverride;
};

export type DecisionBranch = {
  id: string;
  label: string;
  // The one next step this branch leads to.
  step: string;
};

// One question, a handful of branches, one next step each. Deliberately a
// single level — a "lightweight" tree.
export type DecisionTreeBlock = BlockBase & {
  type: "decision_tree";
  prompt: string;
  branches: DecisionBranch[];
  static?: StaticOverride;
};

// Related Sensoria content. The items are NEVER listed here: they come from
// the existing recommendation logic (utils/guideRelated.ts) at render time.
// `links` only lets the author point at real catalog ids explicitly (an
// author's own link outranks a tag match, same as everywhere else).
export type RecommendationBlock = BlockBase & {
  type: "recommendation";
  prompt?: string;
  limit?: number;
  links?: { meditation?: string; program?: string; guide?: string };
};

export type ActionPlanBlock = BlockBase & {
  type: "action_plan";
  prompt: string;
  // How many small actions a person may choose.
  max: number;
  items: ChecklistItem[];
  static?: StaticOverride;
};

export type MediaBlock = BlockBase & {
  type: "media";
  url: string;
  alt: string;
  caption?: string;
};

export type DividerBlock = BlockBase & { type: "divider" };

export type GuideBlockV2 =
  | HeadingBlock
  | RichTextBlock
  | CalloutBlock
  | FlowBlock
  | ChecklistBlock
  | ScaleBlock
  | ReflectionBlock
  | TimerPracticeBlock
  | DecisionTreeBlock
  | RecommendationBlock
  | ActionPlanBlock
  | MediaBlock
  | DividerBlock;

export type GuideBlockType = GuideBlockV2["type"];

// A guide built in Sensoria: the blocks plus nothing else. Title,
// description, author etc. stay on the Guide itself.
export type GuideContent = GuideBlockV2[];

export const INTERACTIVE_BLOCK_TYPES: readonly GuideBlockType[] = [
  "checklist",
  "scale",
  "reflection",
  "timer_practice",
  "decision_tree",
  "action_plan",
];

export function isInteractiveBlock(block: GuideBlockV2): boolean {
  return INTERACTIVE_BLOCK_TYPES.includes(block.type);
}

// ---------------------------------------------------------------------------
// Sections — a heading and everything up to the next heading.
// ---------------------------------------------------------------------------

export type GuideSection = {
  // Zero-based position — display order only. NEVER used as an identity.
  index: number;
  // Stable identity of the section: the id of its heading block (or
  // LEAD_SECTION_KEY for content before the first heading). This is what
  // guide_section_views records, so reordering or inserting sections never
  // moves anyone's progress.
  key: string;
  // "01", "02", …
  number: string;
  heading: HeadingBlock | null;
  // The blocks after the heading (heading itself excluded).
  blocks: { block: GuideBlockV2; blockIndex: number }[];
};

export const LEAD_SECTION_KEY = "__lead";

export function groupIntoSections(content: GuideContent | undefined): GuideSection[] {
  if (!content || content.length === 0) return [];
  const sections: GuideSection[] = [];
  let current: GuideSection | null = null;
  content.forEach((block, blockIndex) => {
    if (block.type === "heading") {
      current = { index: sections.length, key: block.id, number: "", heading: block, blocks: [] };
      sections.push(current);
      return;
    }
    if (!current) {
      // Content before the first heading still belongs to a section — a
      // guide without any headings is one section, never zero.
      current = { index: sections.length, key: LEAD_SECTION_KEY, number: "", heading: null, blocks: [] };
      sections.push(current);
    }
    current.blocks.push({ block, blockIndex });
  });
  sections.forEach((section, i) => {
    section.number = String(i + 1).padStart(2, "0");
  });
  return sections;
}

// Splits sections into reading pages of `perPage` sections each (the last
// page may be shorter). Never returns zero pages for a non-empty guide.
export function paginateSections(sections: GuideSection[], perPage: number): GuideSection[][] {
  const size = Math.max(1, Math.floor(perPage));
  const pages: GuideSection[][] = [];
  for (let i = 0; i < sections.length; i += size) pages.push(sections.slice(i, i + size));
  return pages;
}

export const SECTIONS_PER_PAGE = 5;

// Which reading page to reopen on: the page of the furthest section the
// person has reached. A guide not started — or already worked through
// completely — opens on the first page.
export function resumePageIndex(sections: GuideSection[], perPage: number, viewedKeys: string[]): number {
  const size = Math.max(1, Math.floor(perPage));
  const viewed = new Set(viewedKeys);
  const valid = sections.filter((section) => viewed.has(section.key)).map((section) => section.index);
  if (valid.length === 0 || valid.length >= sections.length) return 0;
  return Math.floor(Math.max(...valid) / size);
}

// Section keys on the last reading page — what "Завершити" confirms as
// reached (earlier pages are recorded as they were actually seen).
export function lastPageSectionKeys(sections: GuideSection[], perPage: number): string[] {
  const pages = paginateSections(sections, perPage);
  return (pages[pages.length - 1] ?? []).map((s) => s.key);
}

export function countSections(content: GuideContent | undefined): number {
  return groupIntoSections(content).length;
}

// The ONE answer to "how many sections does this guide have" for progress
// everywhere (guide_section_views is keyed by section index): structured
// content counts its headings; a legacy guide falls back to the old
// GuideBlock count; an uploaded PDF has no sections (0).
export function getGuideSectionCount(guide: { guideContent?: GuideContent; content?: GuideBlock[] }): number {
  if (guide.guideContent && guide.guideContent.length > 0) return countSections(guide.guideContent);
  return countGuideSections(guide.content);
}

// Stable keys of every section a guide counts progress against: heading ids
// for a structured guide, "section-N" for a legacy GuideBlock guide (which has
// no ids to use), none for an uploaded PDF.
export function getGuideSectionKeys(guide: { guideContent?: GuideContent; content?: GuideBlock[] }): string[] {
  if (guide.guideContent && guide.guideContent.length > 0) return groupIntoSections(guide.guideContent).map((s) => s.key);
  return Array.from({ length: countGuideSections(guide.content) }, (_, i) => `section-${i}`);
}

// Position of a block in the flat array — the `block_index` column of the
// existing guide_* tables.
export function blockIndexOf(content: GuideContent, blockId: string): number {
  return content.findIndex((block) => block.id === blockId);
}

// Authoring guard (used by tests and by anyone assembling content): empty
// list means the content is structurally sound.
export function validateGuideContent(content: GuideContent): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const block of content) {
    if (!block.id) problems.push("block without id");
    else if (seen.has(block.id)) problems.push(`duplicate block id "${block.id}"`);
    seen.add(block.id);
  }
  const ids = new Set(content.map((b) => b.id));
  for (const block of content) {
    if (block.type === "checklist" || block.type === "action_plan") {
      if (block.items.length === 0) problems.push(`"${block.id}" has no items`);
      if (new Set(block.items.map((i) => i.id)).size !== block.items.length) {
        problems.push(`"${block.id}" has duplicate item ids`);
      }
    }
    if (block.type === "action_plan" && (block.max < 1 || block.max > block.items.length)) {
      problems.push(`"${block.id}" max is out of range`);
    }
    if (block.type === "scale") {
      if (block.max <= block.min) problems.push(`"${block.id}" scale range is empty`);
      if (block.compareWith && !ids.has(block.compareWith)) {
        problems.push(`"${block.id}" compares with a missing block "${block.compareWith}"`);
      }
    }
    if (block.type === "timer_practice") {
      if (block.phases.length === 0) problems.push(`"${block.id}" has no phases`);
      if (block.phases.some((p) => !(p.seconds > 0))) problems.push(`"${block.id}" has a phase without duration`);
    }
    if (block.type === "decision_tree") {
      if (block.branches.length === 0) problems.push(`"${block.id}" has no branches`);
      if (new Set(block.branches.map((b) => b.id)).size !== block.branches.length) {
        problems.push(`"${block.id}" has duplicate branch ids`);
      }
    }
  }
  return problems;
}

// A place inside a structured guide, as saved rows know it: a stable block id
// (fragments saved after the block-identity migration) and/or the position
// (older fragments, and notes, which are keyed by block_index).
export type GuideBlockTarget = { blockId?: string | null; blockIndex?: number | null };

// Resolves a saved target to the block that still exists and the reading page
// it is on — null when the guide no longer contains it.
export function locateBlock(
  content: GuideContent | undefined,
  target: GuideBlockTarget | undefined,
  perPage: number
): { blockId: string; page: number } | null {
  if (!content || content.length === 0 || !target) return null;
  const byId = target.blockId ? content.find((b) => b.id === target.blockId) : undefined;
  const byIndex = target.blockIndex != null ? content[target.blockIndex] : undefined;
  const block = byId ?? byIndex;
  if (!block) return null;
  const size = Math.max(1, Math.floor(perPage));
  for (const section of groupIntoSections(content)) {
    if (section.heading?.id === block.id || section.blocks.some((b) => b.block.id === block.id)) {
      return { blockId: block.id, page: Math.floor(section.index / size) };
    }
  }
  return null;
}
