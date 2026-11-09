import { test } from "node:test";
import assert from "node:assert/strict";
import { anxietyHitsContent } from "./anxietyHitsContent.ts";
import { validateGuideContent } from "../guideContent.ts";

// Block ids are IMMUTABLE once a guide is published: every answer, reflection,
// saved fragment and section view points at them. This test is the guard.
//
//  - Reordering or rewording blocks is fine (ids and types stay).
//  - Removing a block: move its id to RETIRED below (history is kept in the
//    database; the id must never be reused for different content).
//  - Replacing a block with something semantically new: NEW id; retire the old.
//  - Changing a published block's TYPE under the same id is a replacement —
//    give it a new id.
// Appending new blocks needs no change here, but add them to PUBLISHED so they
// are protected from now on.
const PUBLISHED: Record<string, string> = {
  "h-check-in": "heading", "t-check-in": "rich_text", "c-now": "checklist",
  "h-what-happens": "heading", "t-what-happens": "rich_text", "f-chain": "flow", "co-not-diagnosis": "callout",
  "h-reaction": "heading", "c-reactions": "checklist",
  "h-try": "heading", "t-try": "rich_text", "s-before": "scale", "p-grounding": "timer_practice",
  "h-changed": "heading", "t-changed": "rich_text", "s-after": "scale",
  "h-returns": "heading", "d-returns": "decision_tree", "co-support": "callout",
  "h-next": "heading", "r-next": "recommendation",
  "h-observation": "heading", "n-observation": "reflection",
  "h-plan": "heading", "a-plan": "action_plan",
  "h-closing": "heading", "t-closing": "rich_text", "co-optional-next": "callout",
};
// Ids removed from the guide on purpose; never reuse them.
const RETIRED: string[] = [];

test("published block ids still exist with the same type, or were retired on purpose", () => {
  const current = new Map(anxietyHitsContent.map((b) => [b.id, b.type as string]));
  for (const [id, type] of Object.entries(PUBLISHED)) {
    if (RETIRED.includes(id)) {
      assert.equal(current.has(id), false, `retired id "${id}" must not come back`);
      continue;
    }
    assert.ok(current.has(id), `published block "${id}" disappeared — retire it explicitly instead`);
    assert.equal(current.get(id), type, `published block "${id}" changed type — give the new block a new id`);
  }
});

test("every current block is registered as published (so it is protected from now on)", () => {
  for (const block of anxietyHitsContent) {
    assert.ok(block.id in PUBLISHED, `new block "${block.id}" — add it to PUBLISHED`);
  }
});

test("block ids are unique and the content is structurally valid", () => {
  assert.deepEqual(validateGuideContent(anxietyHitsContent), []);
});
