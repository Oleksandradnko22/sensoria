// Maps what the EXISTING guide tables store (rows keyed by guide + block
// position) back onto the structured guide's blocks (2026-10-06). Pure and
// tolerant on purpose: a row that points at a block that no longer matches
// (content was edited, an index is out of range, the block is another
// type) is skipped instead of crashing or being attributed to the wrong
// block.
//
//   guide_checklist_checks   → checklist / action_plan selections
//   guide_self_assessments   → scale values, matched by block id (or old position) AND phase

import type { GuideContent } from "../data/guideContent.ts";
import { EMPTY_ANSWERS, type GuideAnswers } from "./guideInteraction.ts";

// Rows carry `blockId` once guide-block-id-migration.sql ran; older rows (or
// a database not migrated yet) have only the position, `blockIndex`.
export type CheckRowLike = { id: string; blockId?: string | null; blockIndex?: number | null; itemIndex: number };
export type AssessmentRowLike = {
  blockId?: string | null;
  blockIndex?: number | null;
  phase: "before" | "after";
  score: number;
};

// The block a stored row belongs to: by id when it has one (stable when the
// content is edited), else by its old position.
function blockFor(content: GuideContent, row: { blockId?: string | null; blockIndex?: number | null }) {
  if (row.blockId) return content.find((b) => b.id === row.blockId);
  return row.blockIndex == null ? undefined : content[row.blockIndex];
}

export function checkKey(blockId: string, itemIndex: number): string {
  return `${blockId}:${itemIndex}`;
}

export function answersFromRows(
  content: GuideContent,
  checks: CheckRowLike[],
  assessments: AssessmentRowLike[]
): { answers: GuideAnswers; checkRowIds: Record<string, string> } {
  const answers: GuideAnswers = {
    ...EMPTY_ANSWERS,
    selections: {},
    scales: {},
    reflections: {},
    branches: {},
    practices: {},
  };
  const checkRowIds: Record<string, string> = {};

  for (const row of checks) {
    const block = blockFor(content, row);
    if (!block || (block.type !== "checklist" && block.type !== "action_plan")) continue;
    if (row.itemIndex < 0 || row.itemIndex >= block.items.length) continue;
    const list = answers.selections[block.id] ?? [];
    if (!list.includes(row.itemIndex)) list.push(row.itemIndex);
    answers.selections[block.id] = list.sort((a, b) => a - b);
    checkRowIds[checkKey(block.id, row.itemIndex)] = row.id;
  }

  for (const row of assessments) {
    const block = blockFor(content, row);
    if (!block || block.type !== "scale" || block.phase !== row.phase) continue;
    if (row.score < block.min || row.score > block.max) continue;
    answers.scales[block.id] = row.score;
  }

  return { answers, checkRowIds };
}
