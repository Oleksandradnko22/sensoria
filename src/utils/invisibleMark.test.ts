import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AMPLITUDE,
  MATCH_Z,
  PAGE_BASE,
  embedMark,
  identifyMark,
  lumaFromRgba,
  newExportToken,
  resizeLuma,
  tokenCode,
} from "./invisibleMark.ts";

const W = 640;
const H = 904; // ~ A4 ratio

// A fake "page": off-white sheet with dark text-like bars and a diagonal
// pattern (like the visible watermark) so the mark competes with content.
function makePage(): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      let v = PAGE_BASE;
      if (y % 40 > 28 && x > 40 && x < W - 40 && (x * 7 + y * 3) % 11 < 7) v = 40; // "text"
      if ((x + y) % 97 < 3) v = 232; // faint diagonal tiles
      const i = (y * W + x) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

// Deterministic pseudo-noise so the tests are repeatable.
function addNoise(luma: Float32Array, amount: number): Float32Array {
  let s = 12345;
  const out = new Float32Array(luma.length);
  for (let i = 0; i < luma.length; i += 1) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    out[i] = luma[i] + ((s / 4294967296) - 0.5) * 2 * amount;
  }
  return out;
}

const TOKEN = 0x1a2b3c4d;
const OTHERS = [111111, 222222, 0xdeadbeef, 424242, 987654321];

test("tokens: random, non-zero, and tokenCode is a fixed-width upper-case code", () => {
  const a = newExportToken();
  const b = newExportToken();
  assert.ok(a > 0 && b > 0 && a !== b);
  assert.match(tokenCode(255), /^[0-9A-Z]{7}$/);
});

test("embedding changes brightness by at most the amplitude and never clips on the off-white page", () => {
  const original = makePage();
  const marked = new Uint8ClampedArray(original);
  embedMark(marked, W, H, TOKEN);
  let maxDiff = 0;
  for (let i = 0; i < marked.length; i += 4) maxDiff = Math.max(maxDiff, Math.abs(marked[i] - original[i]));
  assert.equal(maxDiff, AMPLITUDE);
  assert.ok(PAGE_BASE + AMPLITUDE <= 255);
});

test("the right token is found among candidates, wrong tokens are not", () => {
  const page = makePage();
  embedMark(page, W, H, TOKEN);
  const luma = lumaFromRgba(page, W, H);
  const match = identifyMark(luma, W, H, [...OTHERS, TOKEN]);
  assert.ok(match, "should match");
  assert.equal(match.seed, TOKEN);
  assert.ok(match.z > MATCH_Z * 2, `z=${match.z}`);
});

test("an unmarked page matches nobody", () => {
  const luma = lumaFromRgba(makePage(), W, H);
  assert.equal(identifyMark(luma, W, H, [...OTHERS, TOKEN]), null);
});

test("survives noise (like re-compression) and a brightness shift", () => {
  const page = makePage();
  embedMark(page, W, H, TOKEN);
  const noisy = addNoise(lumaFromRgba(page, W, H), 6).map((v) => v * 0.93 + 9);
  const match = identifyMark(noisy, W, H, [...OTHERS, TOKEN]);
  assert.equal(match?.seed, TOKEN);
});

test("survives a screenshot-like round trip: downscale to 60 %, then resize back to the canonical size", () => {
  const page = makePage();
  embedMark(page, W, H, TOKEN);
  const luma = lumaFromRgba(page, W, H);
  const sw = Math.round(W * 0.6);
  const sh = Math.round(H * 0.6);
  const small = addNoise(resizeLuma(luma, W, H, sw, sh), 3);
  const restored = resizeLuma(small, sw, sh, W, H);
  const match = identifyMark(restored, W, H, [...OTHERS, TOKEN]);
  assert.equal(match?.seed, TOKEN);
});

test("two downloads of the same page carry different, distinguishable marks", () => {
  const a = makePage();
  const b = makePage();
  embedMark(a, W, H, 1001);
  embedMark(b, W, H, 2002);
  const la = lumaFromRgba(a, W, H);
  const lb = lumaFromRgba(b, W, H);
  assert.equal(identifyMark(la, W, H, [1001, 2002])?.seed, 1001);
  assert.equal(identifyMark(lb, W, H, [1001, 2002])?.seed, 2002);
});
