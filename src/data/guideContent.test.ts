import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blockIndexOf,
  getGuideSectionCount,
  groupIntoSections,
  isInteractiveBlock,
  paginateSections,
  validateGuideContent,
  type GuideContent,
} from "./guideContent.ts";
import { getGuideOutline, resolveGuidePdf } from "./guidePdf.ts";
import { getGuideSource, guides } from "./guides.ts";
import { anxietyHitsContent } from "./guideContents/anxietyHitsContent.ts";

const small: GuideContent = [
  { id: "t0", type: "rich_text", text: "Вступ без заголовка" },
  { id: "h1", type: "heading", text: "Один", summary: "Про перше" },
  { id: "t1", type: "rich_text", text: "a" },
  { id: "h2", type: "heading", text: "Два" },
  { id: "c1", type: "checklist", prompt: "p", items: [{ id: "x", label: "X" }] },
];

test("sections: each heading opens one, text before the first heading is still a section", () => {
  const sections = groupIntoSections(small);
  assert.equal(sections.length, 3);
  assert.equal(sections[0].heading, null);
  assert.deepEqual(sections.map((s) => s.number), ["01", "02", "03"]);
  assert.equal(sections[2].blocks[0].blockIndex, 4);
});

test("sections: empty content has none; heading-less content is exactly one", () => {
  assert.equal(groupIntoSections(undefined).length, 0);
  assert.equal(groupIntoSections([{ id: "a", type: "divider" }]).length, 1);
});

test("blockIndexOf is the position in the flat array (the persisted block_index)", () => {
  assert.equal(blockIndexOf(small, "c1"), 4);
  assert.equal(blockIndexOf(small, "missing"), -1);
});

test("validate: catches duplicate ids, empty choices, bad ranges and dangling compareWith", () => {
  const problems = validateGuideContent([
    { id: "a", type: "divider" },
    { id: "a", type: "divider" },
    { id: "c", type: "checklist", prompt: "p", items: [] },
    { id: "p", type: "action_plan", prompt: "p", max: 5, items: [{ id: "i", label: "I" }] },
    { id: "s", type: "scale", prompt: "p", min: 5, max: 5, compareWith: "ghost" },
    { id: "t", type: "timer_practice", title: "t", phases: [], doneText: "d" },
    { id: "d", type: "decision_tree", prompt: "p", branches: [] },
  ]);
  assert.ok(problems.some((p) => p.includes("duplicate block id")));
  assert.ok(problems.some((p) => p.includes("has no items")));
  assert.ok(problems.some((p) => p.includes("max is out of range")));
  assert.ok(problems.some((p) => p.includes("scale range")));
  assert.ok(problems.some((p) => p.includes("missing block")));
  assert.ok(problems.some((p) => p.includes("no phases")));
  assert.ok(problems.some((p) => p.includes("no branches")));
});

test("section count: structured wins, legacy falls back, uploaded PDF has none", () => {
  assert.equal(getGuideSectionCount({ guideContent: small }), 3);
  assert.equal(getGuideSectionCount({ content: [{ type: "heading", text: "h" }, { type: "heading", text: "h2" }] }), 2);
  assert.equal(getGuideSectionCount({}), 0);
});

// ---- the real demo guide ------------------------------------------------
const demo = guides.find((g) => g.id === "what-to-do-when-anxiety-hits")!;

test("demo guide: is structured, content is sound, has the 10 planned sections in order", () => {
  assert.equal(getGuideSource(demo), "sensoria_structured");
  assert.deepEqual(validateGuideContent(anxietyHitsContent), []);
  const titles = groupIntoSections(anxietyHitsContent).map((s) => s.heading?.text);
  assert.deepEqual(titles, [
    "Спочатку перевірте себе",
    "Що зараз відбувається",
    "Знайдіть свою реакцію",
    "Спробуйте зараз",
    "Що змінилося?",
    "Якщо тривога повертається",
    "Що може допомогти далі",
    "Ваше спостереження",
    "Маленький план",
    "Завершення",
  ]);
});

test("demo guide: the 60-second practice really adds up to 60 seconds", () => {
  const practice = anxietyHitsContent.find((b) => b.type === "timer_practice");
  assert.ok(practice && practice.type === "timer_practice");
  assert.equal(practice.phases.reduce((s, p) => s + p.seconds, 0), 60);
});

test("demo guide: the 'after' scale compares against a real 'before' scale", () => {
  const after = anxietyHitsContent.find((b) => b.id === "s-after");
  assert.ok(after && after.type === "scale");
  const before = anxietyHitsContent.find((b) => b.id === after.compareWith);
  assert.ok(before && before.type === "scale" && before.phase === "before");
});

test("demo guide: the preview outline is derived from its headings, with summaries", () => {
  const outline = getGuideOutline(demo);
  assert.equal(outline.length, 10);
  assert.ok(outline.every((item) => item.summary && item.summary.length > 0));
});

test("demo guide: it has interactive blocks of every planned kind", () => {
  const types = new Set(anxietyHitsContent.filter(isInteractiveBlock).map((b) => b.type));
  for (const t of ["checklist", "scale", "reflection", "timer_practice", "decision_tree", "action_plan"]) {
    assert.ok(types.has(t as never), `missing ${t}`);
  }
});

test("source: explicit uploaded_pdf never turns into a structured guide, even with content lying around", () => {
  assert.equal(getGuideSource({ source: "uploaded_pdf", guideContent: small }), "uploaded_pdf");
  assert.equal(getGuideSource({}), "uploaded_pdf");
  const pdf = resolveGuidePdf({ title: "T", fileUrl: "https://x/a.pdf", pages: 3, source: "uploaded_pdf", guideContent: small });
  assert.equal(pdf.source, "uploaded");
  assert.equal(pdf.url, "https://x/a.pdf");
});

test("source: a structured guide resolves as generated and its outline never needs an uploaded file", () => {
  const pdf = resolveGuidePdf(demo);
  assert.equal(pdf.source, "generated");
});

test("pagination: 5 sections per page, remainder on the last page, nothing lost", () => {
  const sections = groupIntoSections(anxietyHitsContent);
  const pages = paginateSections(sections, 5);
  assert.deepEqual(pages.map((p) => p.length), [5, 5]);
  assert.equal(pages[1][0].number, "06");
  assert.deepEqual(paginateSections(sections.slice(0, 7), 5).map((p) => p.length), [5, 2]);
  assert.deepEqual(paginateSections([], 5), []);
  assert.equal(paginateSections(sections, 0).length, sections.length); // clamps to 1 per page
});

import { lastPageSectionKeys, resumePageIndex, type GuideSection } from "./guideContent.ts";

const fakeSections = (n: number): GuideSection[] =>
  Array.from({ length: n }, (_, i) => ({ index: i, key: `k${i}`, number: String(i + 1), heading: null, blocks: [] }));

test("resumePageIndex: not started or fully done opens page 1, else the page of the furthest section", () => {
  const sections = fakeSections(10);
  const keys = (...ids: number[]) => ids.map((i) => `k${i}`);
  assert.equal(resumePageIndex(sections, 5, []), 0);
  assert.equal(resumePageIndex(sections, 5, keys(0, 1, 2)), 0);
  assert.equal(resumePageIndex(sections, 5, keys(0, 1, 5)), 1);
  assert.equal(resumePageIndex(sections, 5, keys(0, 1, 2, 3, 4, 5, 6, 7, 8, 9)), 0);
  assert.equal(resumePageIndex(sections, 5, ["removed-section", "other"]), 0);
});

test("lastPageSectionKeys: the sections on the final reading page", () => {
  assert.deepEqual(lastPageSectionKeys(fakeSections(10), 5), ["k5", "k6", "k7", "k8", "k9"]);
  assert.deepEqual(lastPageSectionKeys(fakeSections(7), 5), ["k5", "k6"]);
  assert.deepEqual(lastPageSectionKeys([], 5), []);
});

test("section keys are heading ids, so reordering sections keeps their identity", () => {
  const a: GuideContent = [
    { id: "h1", type: "heading", text: "A" },
    { id: "t1", type: "rich_text", text: "x" },
    { id: "h2", type: "heading", text: "B" },
  ];
  const reordered: GuideContent = [a[2], a[0], a[1]];
  assert.deepEqual(groupIntoSections(a).map((s) => s.key), ["h1", "h2"]);
  assert.deepEqual(groupIntoSections(reordered).map((s) => s.key), ["h2", "h1"]);
  assert.equal(groupIntoSections([a[1], a[0]])[0].key, "__lead");
});

import { locateBlock } from "./guideContent.ts";

test("locateBlock finds the block and its reading page, by id or by position", () => {
  const mk = (id: string, type: string) => ({ id, type, text: id }) as never;
  const content = [
    mk("h1", "heading"), mk("a", "rich_text"),
    mk("h2", "heading"), mk("b", "rich_text"),
    mk("h3", "heading"), mk("c", "rich_text"),
  ];
  assert.deepEqual(locateBlock(content, { blockId: "a" }, 2), { blockId: "a", page: 0 });
  assert.deepEqual(locateBlock(content, { blockId: "c" }, 2), { blockId: "c", page: 1 });
  assert.deepEqual(locateBlock(content, { blockIndex: 3 }, 1), { blockId: "b", page: 1 });
  // id wins over a stale position; a vanished block resolves to null
  assert.deepEqual(locateBlock(content, { blockId: "a", blockIndex: 5 }, 5), { blockId: "a", page: 0 });
  assert.equal(locateBlock(content, { blockId: "gone" }, 5), null);
  assert.equal(locateBlock(content, undefined, 5), null);
});
