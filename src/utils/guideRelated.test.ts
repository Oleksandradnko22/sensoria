import { test } from "node:test";
import assert from "node:assert/strict";
import { getRelatedContent } from "./guideRelated.ts";
import { guides, type Guide } from "../data/guides.ts";

function makeGuide(overrides: Partial<Guide>): Guide {
  return {
    id: "synthetic-guide",
    title: "Synthetic",
    author: "A",
    type: "PDF-гайд",
    pages: 3,
    readMinutes: 2,
    fileUrl: "u",
    price: "0",
    category: "PDF-гайди",
    description: "d",
    tags: [],
    ...overrides,
  };
}

test("related: the real guide leads into its meditation and program, in ecosystem order", () => {
  const guide = guides[0];
  const related = getRelatedContent(guide);
  assert.deepEqual(
    related.map((r) => r.kind),
    ["meditation", "program"]
  );
  assert.equal(related[0].id, "quick-grounding");
  assert.equal(related[1].id, "stress-course");
});

test("related: never includes the guide itself, never duplicates, never exceeds the limit", () => {
  for (const guide of guides) {
    const related = getRelatedContent(guide);
    assert.ok(related.length <= 3);
    assert.equal(related.some((r) => r.kind === "guide" && r.id === guide.id), false);
    const keys = related.map((r) => `${r.kind}:${r.id}`);
    assert.equal(new Set(keys).size, keys.length);
  }
  assert.equal(getRelatedContent(guides[0], 1).length, 1);
});

test("related: an author's own link beats a tag match", () => {
  const guide = makeGuide({
    tags: ["anxiety"],
    content: [{ type: "programLink", programId: "relationships-course" }],
  });
  const program = getRelatedContent(guide).find((r) => r.kind === "program");
  assert.equal(program?.id, "relationships-course");
});

test("related: without author links, falls back to a real shared-tag match", () => {
  const guide = makeGuide({ tags: ["relationships"] });
  const related = getRelatedContent(guide);
  assert.equal(related.find((r) => r.kind === "program")?.id, "relationships-course");
});

test("related: nothing is padded in when nothing shares a topic and nothing is linked", () => {
  assert.deepEqual(getRelatedContent(makeGuide({ tags: ["a-topic-nobody-has"] })), []);
});

test("related: a link to something that doesn't exist is ignored, not shown as a dead tile", () => {
  const guide = makeGuide({
    tags: ["a-topic-nobody-has"],
    content: [
      { type: "meditationLink", meditationId: "does-not-exist" },
      { type: "guideLink", guideId: "also-gone" },
    ],
  });
  assert.deepEqual(getRelatedContent(guide), []);
});
