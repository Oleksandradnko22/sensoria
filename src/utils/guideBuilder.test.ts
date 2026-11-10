import test from "node:test";
import assert from "node:assert/strict";
import type { GuideBlockType } from "../data/guideContent.ts";
import { BUILDER_BLOCKS, imageVisibilityProblem, mediaUrls, moveSection, removeSection, sectionRanges, blockProblems, duplicate, guideBlocksProblems, insertAt, move, newBlock, removeAt, starterBlocks, wordCount } from "./guideBuilder.ts";

test("every block type of the model can be added and starts incomplete (except the free ones)", () => {
  const types = BUILDER_BLOCKS.map((b) => b.type);
  assert.equal(new Set(types).size, types.length);
  const free: GuideBlockType[] = ["divider"];
  types.forEach((t) => {
    const block = newBlock(t);
    assert.equal(block.type, t);
    assert.ok(block.id);
    assert.equal(blockProblems(block).length === 0, free.includes(t), t);
  });
});

test("block ids are unique, also inside a duplicate", () => {
  const a = newBlock("checklist");
  const b = duplicate(a);
  assert.notEqual(a.id, b.id);
  const ids = (x: unknown) => ((x as { items: { id: string }[] }).items).map((i) => i.id);
  assert.equal(ids(a).filter((i) => ids(b).includes(i)).length, 0);
});

test("insert, remove and move keep the list intact", () => {
  const a = newBlock("heading"), b = newBlock("rich_text"), c = newBlock("divider");
  const list = insertAt(insertAt([a], 1, b), 1, c);
  assert.deepEqual(list.map((x) => x.id), [a.id, c.id, b.id]);
  assert.deepEqual(move(list, 0, -1).map((x) => x.id), list.map((x) => x.id));
  assert.deepEqual(move(list, 0, 1).map((x) => x.id), [c.id, a.id, b.id]);
  assert.deepEqual(removeAt(list, 1).map((x) => x.id), [a.id, b.id]);
});

test("a filled block has no problems", () => {
  const h = newBlock("heading");
  assert.ok(blockProblems(h).length > 0);
  assert.deepEqual(blockProblems({ ...h, text: "Дихання" }), []);
  const scale = newBlock("scale");
  assert.deepEqual(blockProblems({ ...scale, prompt: "Тривога зараз?" } as typeof scale), []);
  assert.ok(blockProblems({ ...scale, prompt: "x", min: 5, max: 5 } as typeof scale).length > 0);
});

test("guide-level problems: empty, no section, too short, unfilled", () => {
  assert.equal(guideBlocksProblems(undefined).length, 1);
  assert.ok(guideBlocksProblems([newBlock("rich_text"), newBlock("rich_text"), newBlock("rich_text")]).some((m) => m.includes("розділ")));
  assert.ok(guideBlocksProblems(starterBlocks()).length > 0);
  const ok = [{ ...newBlock("heading"), text: "Один" }, { ...newBlock("rich_text"), text: "Текст" }, { ...newBlock("reflection"), prompt: "Що?" }];
  assert.deepEqual(guideBlocksProblems(ok as never), []);
});

test("word count adds up the written fields", () => {
  const blocks = [{ ...newBlock("heading"), text: "Один два" }, { ...newBlock("rich_text"), text: "три чотири п'ять" }];
  assert.equal(wordCount(blocks as never), 5);
});

test("sections: ranges, moving and removing whole sections", () => {
  const h1 = newBlock("heading"), t1 = newBlock("rich_text"), h2 = newBlock("heading"), t2 = newBlock("rich_text"), t3 = newBlock("divider");
  const list = [h1, t1, h2, t2, t3];
  assert.deepEqual(sectionRanges(list), [{ start: 0, end: 2, heading: true }, { start: 2, end: 5, heading: true }]);
  assert.deepEqual(moveSection(list, 1, -1).map((b) => b.id), [h2.id, t2.id, t3.id, h1.id, t1.id]);
  assert.deepEqual(moveSection(list, 0, -1).map((b) => b.id), list.map((b) => b.id));
  assert.deepEqual(removeSection(list, 0).map((b) => b.id), [h2.id, t2.id, t3.id]);
  // old content before the first heading is its own range
  assert.equal(sectionRanges([t1, h2])[0].heading, false);
});

test("a guide has to start with a section; a new guide starts with exactly one", () => {
  assert.equal(starterBlocks().length, 1);
  const bad = [newBlock("rich_text"), { ...newBlock("heading"), text: "x" }, newBlock("rich_text")];
  assert.ok(guideBlocksProblems(bad as never).some((m) => m.includes("починатися з розділу")));
});

test("a gift needs a meditation; its words count; a recommendation block is no longer offered", () => {
  const gift = newBlock("gift");
  assert.ok(blockProblems(gift).length > 0);
  assert.deepEqual(blockProblems({ ...gift, meditationId: "quick-grounding", meditationTitle: "Швидке заземлення" } as typeof gift), []);
  assert.ok(!BUILDER_BLOCKS.some((b) => (b.type as string) === "recommendation"));
});

test("pictures: a paid guide needs private ones, a free guide public ones", () => {
  assert.equal(imageVisibilityProblem("https://x/public/a.png", 0), null);
  assert.equal(imageVisibilityProblem("paid:author/guide/a.png", 100), null);
  assert.ok(imageVisibilityProblem("https://x/public/a.png", 100)?.includes("платний"));
  assert.ok(imageVisibilityProblem("paid:author/guide/a.png", 0)?.includes("безкоштовний"));
  assert.equal(imageVisibilityProblem("", 100), null);
  assert.equal(imageVisibilityProblem("https://x/a.png", undefined), null);
  const img = { ...newBlock("media"), url: "https://x/a.png", alt: "фото" } as ReturnType<typeof newBlock>;
  assert.deepEqual(blockProblems(img), []);
  assert.ok(blockProblems(img, 100).length > 0);
  assert.deepEqual(mediaUrls([img, newBlock("divider")]), ["https://x/a.png"]);
});
