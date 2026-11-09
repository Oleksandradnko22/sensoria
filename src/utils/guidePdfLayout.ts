// Page layout of a guide's static blocks, as plain drawing commands
// (2026-10-06). Pure: the only thing it needs from the outside is a function
// that measures text width, so it runs (and is tested) without a browser.
//
// Why it exists: the downloadable PDF of a Sensoria guide is built as
// FLATTENED PAGE IMAGES (lib/guidePdfExport.ts) — the watermark is baked into
// the pixels, and the file has no text layer or removable overlay. To
// get pixels we have to lay the document out ourselves, because browser
// print / HTML-to-image tricks either keep live text (removable watermark)
// or are blocked by Safari. This module does that layout in PDF points
// (1/72 inch, A4), page by page.
//
// Mirrors what GuideStaticRenderer shows on screen, block for block; the
// input is the same StaticBlock list from data/guideStatic.ts.

import type { StaticBlock } from "../data/guideStatic.ts";

export const PAGE_W = 595;
export const PAGE_H = 842;
export const MARGIN_X = 52;
export const MARGIN_TOP = 58;
export const MARGIN_BOTTOM = 62;
export const CONTENT_W = PAGE_W - MARGIN_X * 2;

export type Cmd =
  | { t: "text"; x: number; y: number; text: string; size: number; bold?: boolean; color: string }
  | { t: "rect"; x: number; y: number; w: number; h: number; stroke?: string; fill?: string; lw?: number; r?: number }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; color: string; lw: number }
  // A picture from a guide's `media` block, placed at its final size.
  | { t: "image"; url: string; x: number; y: number; w: number; h: number };

// Natural pixel size of each image url that could be loaded. An image that
// is missing from this map (failed to load, blocked by CORS) is printed as
// its caption instead — the page never carries a broken box.
export type ImageSizes = Record<string, { w: number; h: number }>;

// A picture never takes more than this much of a page's height.
export const MAX_IMAGE_H = 330;

export type PdfPage = Cmd[];

// Width in points of `text` at `size` pt.
export type Measure = (text: string, size: number, bold: boolean) => number;

const INK = "#1f2430";
const MUTED = "#6b7280";
const FAINT = "#9ca3af";
const RULE = "#d1d5db";

// Greedy word wrap; a word longer than a line is broken by characters.
export function wrapText(text: string, maxWidth: number, size: number, bold: boolean, measure: Measure): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    const push = () => {
      if (line) lines.push(line);
      line = "";
    };
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, size, bold) <= maxWidth) {
        line = candidate;
        continue;
      }
      push();
      if (measure(word, size, bold) <= maxWidth) {
        line = word;
        continue;
      }
      let chunk = "";
      for (const ch of word) {
        if (measure(chunk + ch, size, bold) > maxWidth && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      line = chunk;
    }
    push();
    if (words.length === 0) lines.push("");
  }
  return lines;
}

class Layout {
  pages: PdfPage[] = [[]];
  y = MARGIN_TOP;
  private measure: Measure;
  constructor(measure: Measure) {
    this.measure = measure;
  }

  get page(): PdfPage {
    return this.pages[this.pages.length - 1];
  }
  get bottom(): number {
    return PAGE_H - MARGIN_BOTTOM;
  }
  atTop(): boolean {
    return this.y === MARGIN_TOP;
  }
  newPage() {
    this.pages.push([]);
    this.y = MARGIN_TOP;
  }
  // Make room for `height`; break to a new page when it does not fit
  // (unless we're already at the top — then it just has to overflow).
  need(height: number) {
    if (this.y + height > this.bottom && !this.atTop()) this.newPage();
  }
  gap(h: number) {
    // Spacing is never carried to the top of a fresh page.
    if (!this.atTop()) this.y += h;
  }
  lines(text: string, opts: { size: number; bold?: boolean; color?: string; x?: number; width?: number; lh?: number }) {
    const x = opts.x ?? MARGIN_X;
    const width = opts.width ?? CONTENT_W - (x - MARGIN_X);
    const lh = opts.lh ?? opts.size * 1.45;
    for (const line of wrapText(text, width, opts.size, !!opts.bold, this.measure)) {
      this.need(lh);
      if (line) {
        this.page.push({ t: "text", x, y: this.y + opts.size, text: line, size: opts.size, bold: opts.bold, color: opts.color ?? INK });
      }
      this.y += lh;
    }
  }
  height(text: string, size: number, width: number, bold = false, lh = size * 1.45): number {
    return wrapText(text, width, size, bold, this.measure).length * lh;
  }
}

export function layoutGuidePdf(
  params: { title: string; subtitle?: string; blocks: StaticBlock[] },
  measure: Measure,
  imageSizes: ImageSizes = {}
): PdfPage[] {
  const L = new Layout(measure);

  // Cover header.
  L.page.push({ t: "text", x: MARGIN_X, y: L.y + 8, text: "S E N S O R I A", size: 8, bold: true, color: FAINT });
  L.y += 20;
  L.lines(params.title, { size: 26, bold: true, lh: 31 });
  if (params.subtitle) {
    L.y += 4;
    L.lines(params.subtitle, { size: 11.5, color: MUTED, lh: 17 });
  }
  L.y += 10;
  L.page.push({ t: "line", x1: MARGIN_X, y1: L.y, x2: PAGE_W - MARGIN_X, y2: L.y, color: RULE, lw: 0.8 });
  L.y += 6;

  for (const block of params.blocks) {
    switch (block.kind) {
      case "heading": {
        L.gap(26);
        // Keep a heading together with what follows it.
        L.need(70);
        L.page.push({ t: "text", x: MARGIN_X, y: L.y + 8, text: block.number, size: 9, bold: true, color: FAINT });
        L.y += 14;
        L.lines(block.text, { size: 19, bold: true, lh: 24 });
        if (block.summary) L.lines(block.summary, { size: 10.5, color: MUTED, lh: 15 });
        L.y += 8;
        break;
      }
      case "paragraphs":
        for (const p of block.paragraphs) {
          L.lines(p, { size: 11, color: "#2b303b", lh: 16.5 });
          L.y += 7;
        }
        break;
      case "callout": {
        const x = MARGIN_X + 14;
        const w = CONTENT_W - 14;
        const h = (block.title ? 17 : 0) + L.height(block.text, 10.5, w, false, 15.5);
        L.need(h + 4);
        L.page.push({ t: "line", x1: MARGIN_X + 3, y1: L.y + 2, x2: MARGIN_X + 3, y2: L.y + h, color: "#9ca3af", lw: 2 });
        if (block.title) L.lines(block.title, { size: 11, bold: true, x, width: w, lh: 17 });
        L.lines(block.text, { size: 10.5, color: "#3f4552", x, width: w, lh: 15.5 });
        L.y += 8;
        break;
      }
      case "flow": {
        if (block.title) L.lines(block.title, { size: 11.5, bold: true });
        block.steps.forEach((step, i) => {
          const text = `${i < block.steps.length - 1 ? "↓" : "•"}  ${step.label}${step.text ? ` — ${step.text}` : ""}`;
          L.lines(text, { size: 10.5, color: "#3f4552", lh: 16, x: MARGIN_X + 4, width: CONTENT_W - 4 });
        });
        if (block.caption) L.lines(block.caption, { size: 9.5, color: MUTED, lh: 14 });
        L.y += 8;
        break;
      }
      case "checkboxes": {
        const itemW = CONTENT_W - 22;
        const total =
          L.height(block.prompt, 11.5, CONTENT_W, true, 16) +
          (block.instructions ? 14 : 0) +
          Math.min(block.items.length, 3) * 20;
        L.need(total);
        L.lines(block.prompt, { size: 11.5, bold: true, lh: 16 });
        if (block.instructions) L.lines(block.instructions, { size: 9.5, color: MUTED, lh: 14 });
        L.y += 4;
        for (const item of block.items) {
          const h = L.height(item, 10.5, itemW, false, 15);
          L.need(h + 5);
          L.page.push({ t: "rect", x: MARGIN_X + 1, y: L.y + 2, w: 10, h: 10, stroke: INK, lw: 1, r: 2 });
          L.lines(item, { size: 10.5, x: MARGIN_X + 22, width: itemW, lh: 15 });
          L.y += 5;
        }
        L.y += 4;
        break;
      }
      case "number_scale": {
        L.need(L.height(block.prompt, 11.5, CONTENT_W, true, 16) + 14 + 22 + 16);
        L.lines(block.prompt, { size: 11.5, bold: true, lh: 16 });
        L.lines(block.instructions, { size: 9.5, color: MUTED, lh: 14 });
        L.y += 5;
        const n = block.values.length;
        const gap = 4;
        const bw = (CONTENT_W - gap * (n - 1)) / n;
        block.values.forEach((value, i) => {
          const x = MARGIN_X + i * (bw + gap);
          L.page.push({ t: "rect", x, y: L.y, w: bw, h: 22, stroke: INK, lw: 1, r: 4 });
          const label = String(value);
          const tw = measure(label, 10.5, false);
          L.page.push({ t: "text", x: x + (bw - tw) / 2, y: L.y + 15, text: label, size: 10.5, color: INK });
        });
        L.y += 22 + 4;
        if (block.lowLabel || block.highLabel) {
          if (block.lowLabel) L.page.push({ t: "text", x: MARGIN_X, y: L.y + 9, text: block.lowLabel, size: 9, color: MUTED });
          if (block.highLabel) {
            const tw = measure(block.highLabel, 9, false);
            L.page.push({ t: "text", x: PAGE_W - MARGIN_X - tw, y: L.y + 9, text: block.highLabel, size: 9, color: MUTED });
          }
          L.y += 14;
        }
        L.y += 8;
        break;
      }
      case "writing_area": {
        L.need(L.height(block.prompt, 11.5, CONTENT_W, true, 16) + 3 * 26);
        L.lines(block.prompt, { size: 11.5, bold: true, lh: 16 });
        for (let i = 0; i < block.lines; i += 1) {
          L.need(26);
          L.y += 26;
          L.page.push({ t: "line", x1: MARGIN_X, y1: L.y, x2: PAGE_W - MARGIN_X, y2: L.y, color: RULE, lw: 0.8 });
        }
        L.y += 8;
        break;
      }
      case "instructions": {
        L.need(60);
        L.lines(block.title, { size: 11.5, bold: true, lh: 16 });
        if (block.intro) L.lines(block.intro, { size: 10, color: MUTED, lh: 14.5 });
        L.y += 3;
        block.steps.forEach((step, i) => {
          const x = MARGIN_X + 22;
          L.need(L.height(step, 10.5, CONTENT_W - 22, false, 15.5));
          L.page.push({ t: "text", x: MARGIN_X + 2, y: L.y + 10.5, text: `${i + 1}.`, size: 10.5, bold: true, color: MUTED });
          L.lines(step, { size: 10.5, x, width: CONTENT_W - 22, lh: 15.5 });
          L.y += 3;
        });
        L.lines(block.doneText, { size: 10, color: MUTED, lh: 15 });
        L.y += 8;
        break;
      }
      case "tree": {
        L.need(L.height(block.prompt, 11.5, CONTENT_W, true, 16) + 60);
        L.lines(block.prompt, { size: 11.5, bold: true, lh: 16 });
        L.y += 3;
        for (const branch of block.branches) {
          const w = CONTENT_W - 16;
          const h = 15 + L.height(branch.step, 10.5, w, false, 15);
          L.need(h + 6);
          const top = L.y;
          L.lines(`Якщо — ${branch.label}`, { size: 10.5, bold: true, x: MARGIN_X + 14, width: w, lh: 15 });
          L.lines(`→ ${branch.step}`, { size: 10.5, color: "#3f4552", x: MARGIN_X + 14, width: w, lh: 15 });
          L.page.push({ t: "line", x1: MARGIN_X + 3, y1: top + 1, x2: MARGIN_X + 3, y2: L.y - 2, color: RULE, lw: 1.5 });
          L.y += 6;
        }
        L.y += 4;
        break;
      }
      case "image": {
        const size = imageSizes[block.url];
        const caption = block.caption ?? "";
        if (!size || size.w <= 0 || size.h <= 0) {
          // Could not load the picture: keep the content as text.
          L.lines(caption || block.alt, { size: 10, color: MUTED, lh: 14.5 });
          L.y += 6;
          break;
        }
        // Fit inside the text column and the height cap, keep the ratio,
        // never enlarge past the natural size (in points at 1px = 0.75pt).
        const natural = { w: size.w * 0.75, h: size.h * 0.75 };
        const scale = Math.min(1, CONTENT_W / natural.w, MAX_IMAGE_H / natural.h);
        const w = natural.w * scale;
        const h = natural.h * scale;
        const captionH = caption ? L.height(caption, 9.5, CONTENT_W, false, 14) + 4 : 0;
        L.need(h + captionH + 8);
        L.page.push({ t: "image", url: block.url, x: MARGIN_X + (CONTENT_W - w) / 2, y: L.y, w, h });
        L.y += h + 6;
        if (caption) L.lines(caption, { size: 9.5, color: MUTED, lh: 14 });
        L.y += 6;
        break;
      }
      case "divider":
        L.y += 6;
        L.page.push({ t: "line", x1: MARGIN_X, y1: L.y, x2: PAGE_W - MARGIN_X, y2: L.y, color: RULE, lw: 0.8 });
        L.y += 10;
        break;
    }
  }

  return L.pages;
}
