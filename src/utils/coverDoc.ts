// Document model of the built-in cover editor (a small Canva): a background, a decoration and a list of layers
// (text, photo, shape) in canvas pixels (1200×675). Everything here is pure, so it is tested without a browser.
import { COVER_H, COVER_W } from "./coverTemplates.ts";

export type Deco = "none" | "waves" | "orbits" | "blobs" | "bands";
export type FontId = "sans" | "serif" | "display" | "friendly" | "script";
export type Background = { kind: "gradient"; palette: readonly [string, string] } | { kind: "solid"; color: string };

type Base = { id: string; x: number; y: number; w: number; h: number; rotation: number; opacity: number };
export type TextEl = Base & { type: "text"; text: string; fontSize: number; color: string; bold: boolean; italic: boolean; align: "left" | "center" | "right"; family: FontId; shadow: boolean };
// Crop = how much of the photo is cut off on each side, as a fraction of the photo (0..1).
export type PhotoCrop = { l: number; t: number; r: number; b: number };
export type PhotoLook = "none" | "bw";
// The picture of a photo layer: an <img> or, for big photos, a smaller copy drawn on a canvas.
export type PhotoSource = HTMLImageElement | HTMLCanvasElement;
export type ImageEl = Base & { type: "image"; src: string; nw: number; nh: number; mask?: "rect" | "round" | "circle"; bg?: boolean; blur?: number; tint?: string; crop?: PhotoCrop; flip?: boolean; look?: PhotoLook; dim?: number };
export type ShapeEl = Base & { type: "shape"; shape: "rect" | "round" | "circle"; fill: string; radius: number };
export type StickerEl = Base & { type: "sticker"; kind: string; color: string; strokeWidth: number; filled: boolean }; // a vector element from utils/coverStickers.ts
export type CoverEl = TextEl | ImageEl | ShapeEl | StickerEl;
export type CoverDoc = { background: Background; deco: Deco; elements: CoverEl[] };

export type Size = { w: number; h: number };
export type SizeOf = (el: CoverEl) => Size; // text height depends on wrapping, so the renderer supplies it
export type Pt = { x: number; y: number };

export const FONTS: { id: FontId; label: string; stack: string }[] = [
  // Only fonts that ship with Windows, macOS and Android/iOS AND have Cyrillic, so the cover looks the same everywhere.
  { id: "sans", label: "Сучасний", stack: '"Helvetica Neue", Arial, "Segoe UI", system-ui, sans-serif' },
  { id: "serif", label: "Класичний", stack: 'Georgia, "Times New Roman", serif' },
  { id: "display", label: "Плакатний", stack: '"Arial Black", Impact, "Helvetica Neue", Arial, sans-serif' },
  { id: "friendly", label: "Дружній", stack: '"Trebuchet MS", Verdana, sans-serif' },
  { id: "script", label: "Друкарський", stack: '"Courier New", Courier, monospace' },
];

let counter = 0;
export const uid = () => `el${Date.now().toString(36)}${(counter += 1).toString(36)}`;

export const sizeOfPlain: SizeOf = (el) => ({ w: el.w, h: el.h });

export function newText(kind: "title" | "subtitle" | "body", text?: string): TextEl {
  const preset = { title: { size: 72, bold: true, text: "Заголовок" }, subtitle: { size: 38, bold: false, text: "Підзаголовок" }, body: { size: 28, bold: false, text: "Ваш текст" } }[kind];
  return { id: uid(), type: "text", x: 320, y: 280, w: 560, h: preset.size * 1.15, rotation: 0, opacity: 1, text: text ?? preset.text, fontSize: preset.size, color: "#ffffff", bold: preset.bold, italic: false, align: "center", family: "sans", shadow: true };
}

export function newShape(shape: ShapeEl["shape"]): ShapeEl {
  return { id: uid(), type: "shape", shape, x: COVER_W / 2 - 120, y: COVER_H / 2 - 120, w: 240, h: shape === "rect" ? 160 : 240, rotation: 0, opacity: 0.9, fill: "#ffffff", radius: shape === "round" ? 40 : 0 };
}

export function newSticker(kind: string, over: Partial<StickerEl> = {}): StickerEl {
  return { id: uid(), type: "sticker", kind, x: COVER_W / 2 - 80, y: COVER_H / 2 - 80, w: 160, h: 160, rotation: 0, opacity: 1, color: "#ffffff", strokeWidth: 1.6, filled: false, ...over };
}

export function newImage(src: string, nw: number, nh: number, cover = false): ImageEl {
  const scale = cover ? Math.max(COVER_W / nw, COVER_H / nh) : Math.min(1, 640 / nw, 440 / nh);
  const w = nw * scale, h = nh * scale;
  return { id: uid(), type: "image", src, nw, nh, x: (COVER_W - w) / 2, y: (COVER_H - h) / 2, w, h, rotation: 0, opacity: 1, ...(cover ? { bg: true } : {}) };
}

// ---- geometry ----
const rad = (deg: number) => (deg * Math.PI) / 180;
export const rotatePoint = (p: Pt, deg: number): Pt => {
  const a = rad(deg), c = Math.cos(a), s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

export const centerOf = (el: CoverEl, size: Size): Pt => ({ x: el.x + size.w / 2, y: el.y + size.h / 2 });

// A point in the element's own frame (origin at its centre, unrotated).
export function toLocal(el: CoverEl, size: Size, pt: Pt): Pt {
  const c = centerOf(el, size);
  return rotatePoint({ x: pt.x - c.x, y: pt.y - c.y }, -el.rotation);
}

export function hitTest(el: CoverEl, size: Size, pt: Pt): boolean {
  const l = toLocal(el, size, pt);
  if (Math.abs(l.x) > size.w / 2 || Math.abs(l.y) > size.h / 2) return false;
  // Round shapes: the corners of their box are empty, so clicking there must not select them.
  const round = (el.type === "shape" && el.shape === "circle") || (el.type === "image" && el.mask === "circle");
  if (round) {
    const r = Math.min(size.w, size.h) / 2;
    return l.x * l.x + l.y * l.y <= r * r;
  }
  return true;
}

/** Size of a picture scaled down to fit `max` px on its longer side (never enlarged). */
export function fitWithin(nw: number, nh: number, max: number): { w: number; h: number; scaled: boolean } {
  const k = Math.min(1, max / Math.max(nw, nh));
  return { w: Math.max(1, Math.round(nw * k)), h: Math.max(1, Math.round(nh * k)), scaled: k < 1 };
}

/** What a layer list shows for each layer (topmost first). */
export function layerLabel(el: CoverEl): string {
  if (el.type === "text") return `Текст: ${el.text.trim().slice(0, 24) || "порожній"}`;
  if (el.type === "image") return el.bg ? "Фонове фото" : "Фото";
  if (el.type === "sticker") return "Елемент";
  return "Фігура";
}

// The topmost layer under the point (the last one in the list is drawn last, so it is on top).
export function topHit(doc: CoverDoc, sizeOf: SizeOf, pt: Pt): CoverEl | null {
  for (let i = doc.elements.length - 1; i >= 0; i -= 1) {
    const el = doc.elements[i];
    if (hitTest(el, sizeOf(el), pt)) return el;
  }
  return null;
}

// Crop of a frame with the given width/height ratio, centred on the cover (how the cover is shown in that frame).
export function cropRect(ratio: number): { x: number; y: number; w: number; h: number } {
  const w = ratio >= COVER_W / COVER_H ? COVER_W : COVER_H * ratio;
  const h = ratio >= COVER_W / COVER_H ? COVER_W / ratio : COVER_H;
  return { x: (COVER_W - w) / 2, y: (COVER_H - h) / 2, w, h };
}

// Snap an element's centre to the cover's centre lines.
export function snapToCenter(x: number, y: number, size: Size, threshold = 8): { x: number; y: number; guideX: boolean; guideY: boolean } {
  let guideX = false, guideY = false;
  if (Math.abs(x + size.w / 2 - COVER_W / 2) < threshold) { x = COVER_W / 2 - size.w / 2; guideX = true; }
  if (Math.abs(y + size.h / 2 - COVER_H / 2) < threshold) { y = COVER_H / 2 - size.h / 2; guideY = true; }
  return { x, y, guideX, guideY };
}

// ---- editing ----
export const updateEl = (doc: CoverDoc, id: string, patch: Partial<CoverEl>): CoverDoc => ({
  ...doc,
  elements: doc.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as CoverEl) : e)),
});
// ---- photo crop (drag the edges like in Canva; the photo itself stays where it is) ----
const NO_CROP: PhotoCrop = { l: 0, t: 0, r: 0, b: 0 };
export const cropOf = (el: ImageEl): PhotoCrop => el.crop ?? NO_CROP;
const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
type CropEdge = "n" | "s" | "e" | "w";

/** Move one edge of the crop frame by `delta` (in frame pixels, along the frame's own axes). The photo does not move:
 * the frame grows or shrinks over it, never beyond the photo. Returns the new crop, size and how far the frame's
 * top-left corner moved (left/top). */
export function cropEdge(el: ImageEl, edge: CropEdge, delta: number, minSize = 40): { crop: PhotoCrop; w: number; h: number; left: number; top: number } {
  const c = cropOf(el);
  const horizontal = edge === "e" || edge === "w";
  const lead = edge === "w" || edge === "n"; // leading edges move the top-left corner
  const size = horizontal ? el.w : el.h;
  const nat = horizontal ? el.nw : el.nh;
  const span = horizontal ? 1 - c.l - c.r : 1 - c.t - c.b;
  const px = size / (span * nat); // frame pixels per photo pixel
  const key: keyof PhotoCrop = horizontal ? ((edge === "w") !== !!el.flip ? "l" : "r") : edge === "n" ? "t" : "b";
  const room = c[key] * nat * px; // how far this edge may still move outwards
  const d = lead ? clampN(delta, -room, size - minSize) : clampN(delta, -(size - minSize), room);
  const next = { ...c, [key]: Math.max(0, c[key] + (lead ? d : -d) / (px * nat)) };
  return {
    crop: next,
    w: horizontal ? el.w + (lead ? -d : d) : el.w,
    h: horizontal ? el.h : el.h + (lead ? -d : d),
    left: horizontal && lead ? d : 0,
    top: !horizontal && lead ? d : 0,
  };
}

/** Slide the photo inside the frame (dx, dy in frame pixels, positive = photo moves right/down). */
export function cropPan(el: ImageEl, dx: number, dy: number): PhotoCrop {
  const c = cropOf(el);
  const pxX = el.w / ((1 - c.l - c.r) * el.nw), pxY = el.h / ((1 - c.t - c.b) * el.nh);
  const mx = (el.flip ? -dx : dx) / (pxX * el.nw), my = dy / (pxY * el.nh);
  const mxC = clampN(mx, -c.r, c.l), myC = clampN(my, -c.b, c.t);
  return { l: c.l - mxC, r: c.r + mxC, t: c.t - myC, b: c.b + myC };
}

/** Zoom the photo inside the frame (factor > 1 = closer), keeping the frame and its centre. */
export function cropZoom(el: ImageEl, factor: number): PhotoCrop {
  const c = cropOf(el);
  const fw = 1 - c.l - c.r, fh = 1 - c.t - c.b;
  const f = clampN(1 / factor, 0.05 / Math.min(fw, fh), 1 / Math.max(fw, fh)); // closer = a smaller window of the photo
  const nfw = fw * f, nfh = fh * f;
  const l = clampN(c.l + fw / 2 - nfw / 2, 0, 1 - nfw), t = clampN(c.t + fh / 2 - nfh / 2, 0, 1 - nfh);
  return { l, t, r: 1 - nfw - l, b: 1 - nfh - t };
}

/** Crop to a frame ratio (w/h) around the visible centre; keeps the frame width and centre. Used for the true circle. */
export function cropToRatio(el: ImageEl, ratio: number): { crop: PhotoCrop; h: number; top: number } {
  const c = cropOf(el);
  const pw = (1 - c.l - c.r) * el.nw, ph = (1 - c.t - c.b) * el.nh; // visible part in photo pixels
  const w = Math.min(pw, ph * ratio), h = w / ratio;
  const fw = w / el.nw, fh = h / el.nh;
  const l = c.l + (1 - c.l - c.r - fw) / 2, t = c.t + (1 - c.t - c.b - fh) / 2;
  const frameH = el.w / ratio;
  return { crop: { l, t, r: 1 - fw - l, b: 1 - fh - t }, h: frameH, top: (el.h - frameH) / 2 };
}

export const removeEl = (doc: CoverDoc, id: string): CoverDoc => ({ ...doc, elements: doc.elements.filter((e) => e.id !== id) });
export const addEl = (doc: CoverDoc, el: CoverEl): CoverDoc => ({ ...doc, elements: [...doc.elements, el] });
export function duplicateEl(doc: CoverDoc, id: string): { doc: CoverDoc; id: string | null } {
  const el = doc.elements.find((e) => e.id === id);
  if (!el) return { doc, id: null };
  const copy = { ...el, id: uid(), x: el.x + 24, y: el.y + 24 } as CoverEl;
  return { doc: addEl(doc, copy), id: copy.id };
}
// dir: "up" = one step towards the front, "down" = towards the back, "front" / "back" = all the way.
export function reorderEl(doc: CoverDoc, id: string, dir: "up" | "down" | "front" | "back"): CoverDoc {
  const i = doc.elements.findIndex((e) => e.id === id);
  if (i < 0) return doc;
  const list = [...doc.elements];
  const [el] = list.splice(i, 1);
  const to = dir === "up" ? Math.min(list.length, i + 1) : dir === "down" ? Math.max(0, i - 1) : dir === "front" ? list.length : 0;
  list.splice(to, 0, el);
  return { ...doc, elements: list };
}

// ---- undo / redo ----
export type History = { past: CoverDoc[]; future: CoverDoc[] };
export const EMPTY_HISTORY: History = { past: [], future: [] };
export const commit = (h: History, before: CoverDoc): History => ({ past: [...h.past.slice(-49), before], future: [] });
export function undo(h: History, current: CoverDoc): { history: History; doc: CoverDoc } | null {
  if (!h.past.length) return null;
  return { history: { past: h.past.slice(0, -1), future: [current, ...h.future] }, doc: h.past[h.past.length - 1] };
}
export function redo(h: History, current: CoverDoc): { history: History; doc: CoverDoc } | null {
  if (!h.future.length) return null;
  return { history: { past: [...h.past, current], future: h.future.slice(1) }, doc: h.future[0] };
}
