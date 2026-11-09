// Invisible, per-download watermark for the flattened guide PDF
// (2026-10-06). Pure pixel math, no browser APIs — embedded and detected on
// plain arrays, so it is unit-tested in node (utils/invisibleMark.test.ts).
//
// Idea (spread spectrum): a page is cut into 8×8-pixel cells. Every download
// gets a 32-bit SEED; the seed drives a pseudo-random ±1 pattern over the
// cells, and each cell's brightness is nudged by ±AMPLITUDE levels following
// that pattern. One cell's nudge is invisible and survives nothing alone —
// but across thousands of cells the pattern is a strong, redundant signal.
// To identify a leaked page, the detector correlates it with the pattern of
// each candidate seed (the server's list of issued seeds); the right seed
// stands out by many standard deviations, the wrong ones do not.
//
// The seed is NOT the public download code: the server derives it as an
// HMAC of the token with a secret that never leaves the database
// (protected-pdf-exports-migration.sql), so nobody can compute or forge the
// pattern of someone else's download.
//
// Survives: JPEG re-compression, a screenshot that is resized back to the
// page's canonical size, mild noise, brightness shifts. Does not survive:
// heavy blur, strong crops/rotation (the detector assumes the canonical
// grid), a page packed wall-to-wall with content (the mark is read from the
// flat cells between and around content; with almost none left it cannot be
// read — the margins of PDF pages and the quiet areas of a screen are
// usually enough), or a person who inspects their OWN download's seed in the browser
// and subtracts that one pattern — client-side embedding cannot prevent
// that; only rendering the pages on a server can.
//
// Pages are rendered on an off-white (not pure white) sheet so there is
// head-room to nudge brightness UP without clipping (see PAGE_BASE).

export const CELL = 8;
export const AMPLITUDE = 1;
// Brightness of the "paper". 255 would clip every positive nudge.
export const PAGE_BASE = 253;
// A candidate counts as a match when its correlation is this many standard
// deviations above chance.
export const MATCH_Z = 6;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The ±1 pattern for a seed over `count` cells.
export function cellSigns(seed: number, count: number): Int8Array {
  const rand = mulberry32(seed ^ 0x5e17a2b9);
  const out = new Int8Array(count);
  for (let i = 0; i < count; i += 1) out[i] = rand() < 0.5 ? -1 : 1;
  return out;
}

function grid(width: number, height: number, cell: number = CELL) {
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  return { cols, rows, count: cols * rows };
}

// Random token for one download. `crypto` exists in browsers and node ≥ 19.
export function newExportToken(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  // Avoid 0 (a degenerate seed).
  return buf[0] || 1;
}

export function tokenCode(token: number): string {
  return token.toString(36).toUpperCase().padStart(7, "0");
}

// Nudge the brightness of an RGBA buffer in place.
export function embedMark(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, seed: number): void {
  const { cols, count } = grid(width, height);
  const p = cellSigns(seed, count);
  for (let y = 0; y < height; y += 1) {
    const rowBase = Math.floor(y / CELL) * cols;
    for (let x = 0; x < width; x += 1) {
      const delta = p[rowBase + Math.floor(x / CELL)] * AMPLITUDE;
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const v = rgba[i + c] + delta;
        rgba[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
}

export function lumaFromRgba(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Float32Array {
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i += 1) {
    luma[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  return luma;
}

// Cells whose pixels vary more than this inside the cell (text edges, images)
// carry no usable signal and only add noise; they are left out of detection.
const FLAT_STD = 4;

// Mean brightness per cell, high-passed (each cell minus the average of its
// four neighbours) so page content does not drown the mark. Only FLAT cells
// whose neighbours are flat too are kept (others are NaN): the mark sits
// quietly in the margins and gaps between content, and that is where it is
// read from.
function cellResidual(luma: ArrayLike<number>, width: number, height: number, cell: number = CELL): Float32Array {
  const { cols, rows, count } = grid(width, height, cell);
  const sum = new Float64Array(count);
  const sumSq = new Float64Array(count);
  const n = new Uint32Array(count);
  for (let y = 0; y < height; y += 1) {
    const rowBase = Math.floor(y / cell) * cols;
    for (let x = 0; x < width; x += 1) {
      const c = rowBase + Math.floor(x / cell);
      const v = luma[y * width + x];
      sum[c] += v;
      sumSq[c] += v * v;
      n[c] += 1;
    }
  }
  const mean = new Float32Array(count);
  const flat = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    if (!n[i]) continue;
    mean[i] = sum[i] / n[i];
    const variance = Math.max(0, sumSq[i] / n[i] - mean[i] * mean[i]);
    flat[i] = Math.sqrt(variance) < FLAT_STD ? 1 : 0;
  }
  const res = new Float32Array(count).fill(NaN);
  for (let r = 1; r < rows - 1; r += 1) {
    for (let c = 1; c < cols - 1; c += 1) {
      const i = r * cols + c;
      if (!flat[i] || !flat[i - 1] || !flat[i + 1] || !flat[i - cols] || !flat[i + cols]) continue;
      res[i] = mean[i] - (mean[i - 1] + mean[i + 1] + mean[i - cols] + mean[i + cols]) / 4;
    }
  }
  return res;
}

// How strongly the page carries `seed`'s pattern, in standard deviations
// above chance (≈ N(0,1) for a wrong seed or an unmarked page).
export function markScore(residual: Float32Array, seed: number): number {
  const count = residual.length;
  const p = cellSigns(seed, count);
  let stat = 0;
  let sq = 0;
  let used = 0;
  for (let i = 0; i < count; i += 1) {
    const r = residual[i];
    if (Number.isNaN(r)) continue;
    stat += r * p[i];
    sq += r * r;
    used += 1;
  }
  if (used < 50) return 0;
  const sigma = Math.sqrt(sq / used);
  return sigma > 0 ? stat / (sigma * Math.sqrt(used)) : 0;
}

export type MarkMatch = { seed: number; z: number };

// Which of the issued seeds (if any) is on this page. `luma` must be at the
// canonical page size; resize a screenshot to it first (resizeLuma).
export function identifyMark(
  luma: ArrayLike<number>,
  width: number,
  height: number,
  candidates: number[],
  // 8 for PDF pages; 16 for the on-screen overlay (components/participant/
  // ContentShield.tsx), where `width`/`height` are the viewport in CSS px.
  cell: number = CELL
): MarkMatch | null {
  const residual = cellResidual(luma, width, height, cell);
  let best: MarkMatch | null = null;
  for (const seed of candidates) {
    const z = markScore(residual, seed);
    if (!best || z > best.z) best = { seed, z };
  }
  return best && best.z >= MATCH_Z ? best : null;
}

// Bilinear resize of a luma plane — to bring a screenshot back to the
// canonical page size before detection.
export function resizeLuma(
  src: ArrayLike<number>,
  sw: number,
  sh: number,
  dw: number,
  dh: number
): Float32Array {
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y += 1) {
    const fy = ((y + 0.5) * sh) / dh - 0.5;
    const y0 = Math.max(0, Math.min(sh - 1, Math.floor(fy)));
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = Math.max(0, Math.min(1, fy - y0));
    for (let x = 0; x < dw; x += 1) {
      const fx = ((x + 0.5) * sw) / dw - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(fx)));
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = Math.max(0, Math.min(1, fx - x0));
      const top = src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx;
      const bot = src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx;
      out[y * dw + x] = top * (1 - ty) + bot * ty;
    }
  }
  return out;
}
