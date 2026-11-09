import { test } from "node:test";
import assert from "node:assert/strict";
import { answersFromRows, checkKey } from "./guideAnswerMapping.ts";
import type { GuideContent } from "../data/guideContent.ts";

const content: GuideContent = [
  { id: "h", type: "heading", text: "H" },
  { id: "c", type: "checklist", prompt: "p", items: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "d", label: "D" }] },
  { id: "s1", type: "scale", phase: "before", prompt: "p", min: 0, max: 10 },
  { id: "s2", type: "scale", phase: "after", compareWith: "s1", prompt: "p", min: 0, max: 10 },
  { id: "t", type: "rich_text", text: "x" },
];

test("rows land on the blocks at their position, sorted, with row ids kept for un-checking", () => {
  const { answers, checkRowIds } = answersFromRows(
    content,
    [
      { id: "r2", blockIndex: 1, itemIndex: 2 },
      { id: "r0", blockIndex: 1, itemIndex: 0 },
    ],
    [
      { blockIndex: 2, phase: "before", score: 8 },
      { blockIndex: 3, phase: "after", score: 5 },
    ]
  );
  assert.deepEqual(answers.selections.c, [0, 2]);
  assert.equal(checkRowIds[checkKey("c", 2)], "r2");
  assert.equal(answers.scales.s1, 8);
  assert.equal(answers.scales.s2, 5);
});

test("stale rows are skipped: wrong block type, out-of-range item, phase mismatch, score outside the scale", () => {
  const { answers } = answersFromRows(
    content,
    [
      { id: "x", blockIndex: 4, itemIndex: 0 }, // rich_text
      { id: "y", blockIndex: 1, itemIndex: 9 }, // no such item
      { id: "z", blockIndex: 99, itemIndex: 0 }, // no such block
    ],
    [
      { blockIndex: 2, phase: "after", score: 5 }, // s1 is a "before" scale
      { blockIndex: 3, phase: "after", score: 11 }, // outside 0–10
    ]
  );
  assert.deepEqual(answers.selections, {});
  assert.deepEqual(answers.scales, {});
});

test("two calls never share state", () => {
  const a = answersFromRows(content, [{ id: "r", blockIndex: 1, itemIndex: 0 }], []);
  const b = answersFromRows(content, [], []);
  assert.deepEqual(b.answers.selections, {});
  assert.deepEqual(a.answers.selections.c, [0]);
});

test("rows with a block id follow the block when content is reordered; old position rows still work", () => {
  const reordered: GuideContent = [content[0], content[2], content[1], content[3], content[4]];
  const { answers, checkRowIds } = answersFromRows(
    reordered,
    [{ id: "r", blockId: "c", blockIndex: null, itemIndex: 1 }],
    [{ blockId: "s1", blockIndex: null, phase: "before", score: 7 }]
  );
  assert.deepEqual(answers.selections.c, [1]);
  assert.equal(checkRowIds[checkKey("c", 1)], "r");
  assert.equal(answers.scales.s1, 7);
  const legacy = answersFromRows(content, [{ id: "o", blockIndex: 1, itemIndex: 0 }], []);
  assert.deepEqual(legacy.answers.selections.c, [0]);
});
