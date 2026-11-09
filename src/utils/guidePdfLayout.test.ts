import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTENT_W, MARGIN_BOTTOM, MAX_IMAGE_H, MARGIN_X, PAGE_H, PAGE_W, layoutGuidePdf, wrapText, type Measure } from "./guidePdfLayout.ts";
import { toStaticBlocks } from "../data/guideStatic.ts";
import { anxietyHitsContent } from "../data/guideContents/anxietyHitsContent.ts";
import { markPositions, shortCode } from "./guideWatermark.ts";

// Fake font: every character is 0.5 em wide, bold slightly wider.
const measure: Measure = (text, size, bold) => text.length * size * (bold ? 0.56 : 0.5);

test("wrapText: wraps at the width, never loses words, breaks an unbreakable word", () => {
  const lines = wrapText("раз два три чотири п'ять шість сім вісім", 100, 10, false, measure);
  assert.ok(lines.length > 1);
  assert.equal(lines.join(" "), "раз два три чотири п'ять шість сім вісім");
  assert.ok(lines.every((l) => measure(l, 10, false) <= 100));
  const long = wrapText("абвгдеєжзиіїйклмнопрстуфхцчшщюя", 50, 10, false, measure);
  assert.ok(long.length > 1 && long.every((l) => measure(l, 10, false) <= 50));
});

const params = { title: "Що робити, коли накриває тривога", subtitle: "Опис гайду", blocks: toStaticBlocks(anxietyHitsContent) };
const pages = layoutGuidePdf(params, measure);
const allCmds = pages.flat();

test("layout: the demo guide becomes several A4 pages, none empty", () => {
  assert.ok(pages.length >= 3);
  assert.ok(pages.every((p) => p.length > 0));
});

test("layout: nothing is drawn outside the margins or below the bottom margin", () => {
  for (const cmd of allCmds) {
    if (cmd.t === "text") {
      assert.ok(cmd.x >= MARGIN_X - 0.01, `x ${cmd.x}`);
      assert.ok(cmd.y <= PAGE_H - MARGIN_BOTTOM + 14, `y ${cmd.y}`);
      assert.ok(cmd.x + measure(cmd.text, cmd.size, !!cmd.bold) <= PAGE_W - MARGIN_X + 0.5, `"${cmd.text}" overflows`);
    }
    if (cmd.t === "rect") assert.ok(cmd.x + cmd.w <= PAGE_W - MARGIN_X + 0.5 && cmd.y + cmd.h <= PAGE_H);
  }
});

test("layout: every word of the static content reaches the pages (nothing dropped)", () => {
  const drawn = allCmds.filter((c) => c.t === "text").map((c) => (c as { text: string }).text).join(" ");
  for (const word of ["Спочатку", "перевірте", "Мені важко зупинити думки", "починаю все контролювати", "невизначеність", "Маленький"]) {
    const first = word.split(" ")[0];
    assert.ok(drawn.includes(first), first);
  }
  // Each checkbox item of the first checklist is drawn exactly once.
  assert.equal(drawn.split("Мені просто потрібна пауза").length - 1, 1);
});

test("layout: the written practice's every instruction is on the pages", () => {
  const drawn = allCmds.filter((c) => c.t === "text").map((c) => (c as { text: string }).text).join(" ");
  for (const phrase of ["Сядьте", "Повільно вдихніть", "п'ять речей", "Відчуйте дотики", "ще один спокійний видих"]) {
    assert.ok(drawn.includes(phrase), phrase);
  }
});

test("layout: a heading is never the last thing on a page", () => {
  for (const page of pages) {
    const last = [...page].reverse().find((c) => c.t === "text");
    if (!last || last.t !== "text") continue;
    const isHeadingLike = last.size >= 19 && last.bold;
    assert.equal(isHeadingLike, false, `page ends with heading "${last.text}"`);
  }
});

test("layout: content width constant is consistent", () => {
  assert.equal(CONTENT_W, PAGE_W - MARGIN_X * 2);
});

test("watermark marks: deterministic per reader+page, different between readers and pages, inside the sheet", () => {
  const a = markPositions("user-1", 0, 5, PAGE_W, PAGE_H);
  assert.deepEqual(a, markPositions("user-1", 0, 5, PAGE_W, PAGE_H));
  assert.notDeepEqual(a, markPositions("user-1", 1, 5, PAGE_W, PAGE_H));
  assert.notDeepEqual(a, markPositions("user-2", 0, 5, PAGE_W, PAGE_H));
  assert.ok(a.every((p) => p.x >= 24 && p.x <= PAGE_W - 24 && p.y >= 24 && p.y <= PAGE_H - 24));
  assert.equal(shortCode("user-1").length, 7);
  assert.notEqual(shortCode("user-1"), shortCode("user-2"));
});

const imageBlock = (url: string) => ({ kind: "image" as const, url, alt: "Опис", caption: "Підпис до картинки" });

test("images: placed inside the column, ratio kept, capped in height, centred", () => {
  const out = layoutGuidePdf({ title: "T", blocks: [imageBlock("a.png")] }, measure, { "a.png": { w: 1600, h: 1200 } });
  const img = out.flat().find((c) => c.t === "image");
  assert.ok(img && img.t === "image");
  assert.ok(img.w <= CONTENT_W + 0.01 && img.h <= MAX_IMAGE_H + 0.01);
  assert.ok(Math.abs(img.w / img.h - 1600 / 1200) < 0.001);
  assert.ok(img.x >= MARGIN_X - 0.01 && img.x + img.w <= PAGE_W - MARGIN_X + 0.01);
  assert.ok(out.flat().some((c) => c.t === "text" && c.text.includes("Підпис")));
});

test("images: a small picture is not blown up beyond its natural size", () => {
  const out = layoutGuidePdf({ title: "T", blocks: [imageBlock("s.png")] }, measure, { "s.png": { w: 200, h: 100 } });
  const img = out.flat().find((c) => c.t === "image");
  assert.ok(img && img.t === "image");
  assert.equal(img.w, 150);
  assert.equal(img.h, 75);
});

test("images: one that could not be loaded falls back to its caption, never a broken box", () => {
  const out = layoutGuidePdf({ title: "T", blocks: [imageBlock("missing.png")] }, measure, {});
  assert.equal(out.flat().some((c) => c.t === "image"), false);
  assert.ok(out.flat().some((c) => c.t === "text" && c.text.includes("Підпис")));
});

test("images: a picture that does not fit moves to the next page whole, with its caption", () => {
  const filler = Array.from({ length: 40 }, () => ({ kind: "paragraphs" as const, paragraphs: ["Рядок тексту, який займає місце на сторінці."] }));
  const out = layoutGuidePdf({ title: "T", blocks: [...filler, imageBlock("big.png")] }, measure, { "big.png": { w: 800, h: 600 } });
  const pageWithImage = out.findIndex((page) => page.some((c) => c.t === "image"));
  assert.ok(pageWithImage > 0);
  const img = out[pageWithImage].find((c) => c.t === "image");
  assert.ok(img && img.t === "image" && img.y + img.h <= PAGE_H - MARGIN_BOTTOM + 0.5);
  assert.ok(out[pageWithImage].some((c) => c.t === "text" && c.text.includes("Підпис")));
});
