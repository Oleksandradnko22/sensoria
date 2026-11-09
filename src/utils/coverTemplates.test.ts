import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_PALETTES, DEFAULT_PALETTE, READY_BACKGROUNDS, fitTitle, paletteFor, wrapLines } from "./coverTemplates.ts";
import { categoryLabels } from "../data/categoryLabels.ts";

const per = (size: number) => (s: string) => [...s].length * size * 0.5; // every character is size/2 wide

test("every program category has a palette", () => {
  for (const id of Object.keys(categoryLabels)) assert.ok(CATEGORY_PALETTES[id], id);
  assert.equal(paletteFor("nope"), DEFAULT_PALETTE);
  assert.equal(paletteFor(null), DEFAULT_PALETTE);
});

test("wrapLines wraps words and breaks a word wider than the line", () => {
  assert.deepEqual(wrapLines("aa bb cc", 50, per(20)), ["aa bb", "cc"]);
  const long = wrapLines("abcdefghijklmnop", 50, per(20));
  assert.ok(long.length > 1);
  assert.equal(long.join(""), "abcdefghijklmnop");
  assert.deepEqual(wrapLines("   ", 100, per(20)), []);
});

test("fitTitle picks the biggest size that fits in 3 lines", () => {
  const short = fitTitle("Тривога", 560, 300, per);
  assert.equal(short.size, 84);
  const long = fitTitle("Робота з тривожністю і спокійний сон щодня для всіх", 560, 300, per);
  assert.ok(long.lines.length <= 3);
  assert.ok(long.lines.length * long.size * 1.15 <= 300 || long.size === 40);
});

test("fitTitle truncates with an ellipsis when nothing fits", () => {
  const out = fitTitle("слово ".repeat(80), 560, 300, per);
  assert.equal(out.size, 40);
  assert.equal(out.lines.length, 3);
  assert.ok(out.lines[2].endsWith("…"));
});

test("ready backgrounds are unique, valid and dark enough for the white title", () => {
  const lum = (c: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  assert.equal(new Set(READY_BACKGROUNDS.map((b) => b.id)).size, READY_BACKGROUNDS.length);
  for (const b of READY_BACKGROUNDS) for (const c of b.palette) {
    assert.match(c, /^#[0-9a-f]{6}$/i);
    assert.ok(lum(c) < 0.2, `${b.id} ${c}`);
  }
});
