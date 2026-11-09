import { test } from "node:test";
import assert from "node:assert/strict";
import { formatFileSize, getGuideOutline, pagesLabel, resolveGuidePdf, sectionsLabel } from "./guidePdf.ts";
import { guides } from "./guides.ts";
import type { GuideBlock } from "./guideBlocks.ts";

const blocks: GuideBlock[] = [
  { type: "heading", text: "Перший розділ" },
  { type: "paragraph", text: "Текст, який НЕ має потрапити в зміст." },
  { type: "heading", text: "Другий розділ" },
];

test("resolveGuidePdf: a guide with only the original fields still resolves", () => {
  const pdf = resolveGuidePdf({ title: "Назва", fileUrl: "https://x/y.pdf", pages: 12 });
  assert.equal(pdf.url, "https://x/y.pdf");
  assert.equal(pdf.pageCount, 12);
  assert.equal(pdf.fileName, "Назва.pdf");
  assert.deepEqual(pdf.previewPages, []);
  assert.equal(pdf.coverImageUrl, undefined);
});

test("resolveGuidePdf: source is inferred — structured content means generated, otherwise uploaded", () => {
  assert.equal(resolveGuidePdf({ title: "t", fileUrl: "u", pages: 1, content: blocks }).source, "generated");
  assert.equal(resolveGuidePdf({ title: "t", fileUrl: "u", pages: 1 }).source, "uploaded");
  assert.equal(resolveGuidePdf({ title: "t", fileUrl: "u", pages: 1, content: [] }).source, "uploaded");
});

test("resolveGuidePdf: explicit pdf metadata always wins over inference and over the original fields", () => {
  const pdf = resolveGuidePdf({
    title: "t",
    fileUrl: "https://old",
    pages: 3,
    content: blocks,
    pdf: {
      source: "uploaded",
      url: "https://new",
      fileName: "custom.pdf",
      pageCount: 20,
      fileSizeBytes: 2048,
      version: "2",
      coverImageUrl: "https://cover.png",
      previewPages: [{ imageUrl: "https://p1.png", label: "Обкладинка" }],
    },
  });
  assert.equal(pdf.source, "uploaded");
  assert.equal(pdf.url, "https://new");
  assert.equal(pdf.fileName, "custom.pdf");
  assert.equal(pdf.pageCount, 20);
  assert.equal(pdf.fileSizeBytes, 2048);
  assert.equal(pdf.version, "2");
  assert.equal(pdf.coverImageUrl, "https://cover.png");
  assert.equal(pdf.previewPages.length, 1);
});

test("resolveGuidePdf: file names never carry characters a download can't have; blank preview pages are dropped", () => {
  const pdf = resolveGuidePdf({
    title: 'SOS: що робити? "зараз"',
    fileUrl: "u",
    pages: 1,
    pdf: { previewPages: [{ imageUrl: "  " }, { imageUrl: "https://ok.png" }] },
  });
  assert.equal(/[\\/:*?"<>|]/.test(pdf.fileName), false);
  assert.ok(pdf.fileName.endsWith(".pdf"));
  assert.deepEqual(pdf.previewPages, [{ imageUrl: "https://ok.png" }]);
});

test("getGuideOutline: an authored outline wins", () => {
  const outline = [{ title: "Авторський", summary: "Опис" }];
  assert.deepEqual(getGuideOutline({ title: "t", fileUrl: "u", pages: 1, content: blocks, outline }), outline);
});

test("getGuideOutline: falls back to content headings — titles only, never body text", () => {
  const outline = getGuideOutline({ title: "t", fileUrl: "u", pages: 1, content: blocks });
  assert.deepEqual(outline, [{ title: "Перший розділ" }, { title: "Другий розділ" }]);
});

test("getGuideOutline: an unstructured uploaded PDF has no known structure", () => {
  assert.deepEqual(getGuideOutline({ title: "t", fileUrl: "u", pages: 1 }), []);
});

test("formatFileSize: KB under a megabyte, one decimal under 10 MB, Ukrainian decimal comma", () => {
  assert.equal(formatFileSize(0), "");
  assert.equal(formatFileSize(-5), "");
  assert.equal(formatFileSize(820 * 1024), "820 КБ");
  assert.equal(formatFileSize(1.5 * 1024 * 1024), "1,5 МБ");
  assert.equal(formatFileSize(24 * 1024 * 1024), "24 МБ");
});

test("pagesLabel: Ukrainian plural forms", () => {
  assert.equal(pagesLabel(1), "1 сторінка");
  assert.equal(pagesLabel(2), "2 сторінки");
  assert.equal(pagesLabel(5), "5 сторінок");
  assert.equal(pagesLabel(11), "11 сторінок");
  assert.equal(pagesLabel(12), "12 сторінок");
  assert.equal(pagesLabel(21), "21 сторінка");
  assert.equal(pagesLabel(24), "24 сторінки");
});

// Real-catalog guards: the page shows `outline` as the guide's structure,
// so it must never drift away from the structure it describes.
test("catalog: an authored outline lines up with the headings of the same guide's content", () => {
  for (const guide of guides) {
    if (!guide.outline || !guide.content) continue;
    const headings = guide.content.filter((b) => b.type === "heading").map((b) => (b as { text: string }).text);
    assert.deepEqual(
      guide.outline.map((item) => item.title),
      headings,
      `outline of "${guide.id}" must match its content headings`
    );
  }
});

test("catalog: no guide ships preview images that point at nothing", () => {
  for (const guide of guides) {
    for (const page of guide.pdf?.previewPages ?? []) {
      assert.ok(page.imageUrl.trim().length > 0, `blank preview page in "${guide.id}"`);
    }
  }
});

test("sectionsLabel: Ukrainian plural forms", () => {
  assert.equal(sectionsLabel(1), "1 розділ");
  assert.equal(sectionsLabel(3), "3 розділи");
  assert.equal(sectionsLabel(10), "10 розділів");
  assert.equal(sectionsLabel(12), "12 розділів");
});
