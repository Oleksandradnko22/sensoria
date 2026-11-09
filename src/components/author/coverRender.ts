// Draws a cover document on a canvas (preview and export use the very same code) and measures text layers.
import { COVER_H, COVER_SAFE, COVER_W, fitTitle, wrapLines, type CoverTemplateId } from "../../utils/coverTemplates";
import { FONTS, cropOf, newText, type CoverDoc, type PhotoSource, type CoverEl, type Deco, type Size, type StickerEl, type TextEl, uid } from "../../utils/coverDoc";
import { stickerDef } from "../../utils/coverStickers";

const white = (a: number) => `rgba(255,255,255,${a})`;
const stack = (el: TextEl) => FONTS.find((f) => f.id === el.family)?.stack ?? FONTS[0].stack;
const fontOf = (el: TextEl, size = el.fontSize) => `${el.italic ? "italic " : ""}${el.bold ? 700 : 400} ${size}px ${stack(el)}`;

let measureCtx: CanvasRenderingContext2D | null = null;
export function measurer(): CanvasRenderingContext2D | null {
  if (!measureCtx && typeof document !== "undefined") measureCtx = document.createElement("canvas").getContext("2d");
  return measureCtx;
}

export function layoutText(el: TextEl, ctx: CanvasRenderingContext2D | null = measurer()): { lines: string[]; lineHeight: number; height: number } {
  const lineHeight = el.fontSize * 1.15;
  if (!ctx) return { lines: [el.text], lineHeight, height: lineHeight };
  ctx.font = fontOf(el);
  const lines = el.text.split("\n").flatMap((p) => (p.trim() ? wrapLines(p, el.w, (s) => ctx.measureText(s).width) : [""]));
  const n = Math.max(1, lines.length);
  return { lines, lineHeight, height: n * lineHeight };
}

export const sizeOfEl = (el: CoverEl): Size => (el.type === "text" ? { w: el.w, h: layoutText(el).height } : { w: el.w, h: el.h });

function drawDeco(ctx: CanvasRenderingContext2D, d: Deco) {
  const W = COVER_W, H = COVER_H;
  if (d === "waves") {
    [[0.74, 0.12, 40], [0.82, 0.16, 55], [0.9, 0.22, 35]].forEach(([y, a, amp], i) => {
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, H * y);
      ctx.bezierCurveTo(W * 0.25, H * y - amp * (i % 2 ? -1 : 1), W * 0.5, H * y + amp, W * 0.75, H * y - amp * 0.6);
      ctx.bezierCurveTo(W * 0.88, H * y - amp, W * 0.95, H * y, W, H * y - amp * 0.5);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = white(a);
      ctx.fill();
    });
  } else if (d === "orbits") {
    const cx = W / 2, cy = H / 2;
    [250, 340, 440, 560].forEach((r, i) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = white(0.28 - i * 0.05);
      ctx.stroke();
    });
    [[cx + 300, cy - 190, 16], [cx - 380, cy + 150, 24], [cx + 120, cy + 300, 12]].forEach(([x, y, r]) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = white(0.4);
      ctx.fill();
    });
  } else if (d === "blobs") {
    [[W * 0.9, H * 0.12, 300, 0.2], [W * 0.1, H * 0.95, 340, 0.17], [W * 0.78, H * 0.92, 180, 0.2], [W * 0.14, H * 0.1, 140, 0.14]].forEach(([x, y, r, a]) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, white(a));
      g.addColorStop(1, white(0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (d === "bands") {
    [[0.0, 0.1], [0.12, 0.07], [0.78, 0.12], [0.9, 0.08]].forEach(([x0, a]) => {
      ctx.beginPath();
      ctx.moveTo(W * x0 + 160, 0);
      ctx.lineTo(W * x0 + 330, 0);
      ctx.lineTo(W * x0 + 170, H);
      ctx.lineTo(W * x0 + 0, H);
      ctx.closePath();
      ctx.fillStyle = white(a);
      ctx.fill();
    });
  }
}

function drawShape(ctx: CanvasRenderingContext2D, el: Extract<CoverEl, { type: "shape" }>) {
  ctx.fillStyle = el.fill;
  ctx.beginPath();
  if (el.shape === "circle") ctx.ellipse(el.w / 2, el.h / 2, el.w / 2, el.h / 2, 0, 0, Math.PI * 2);
  else ctx.roundRect(0, 0, el.w, el.h, el.shape === "round" ? Math.min(el.radius, el.w / 2, el.h / 2) : 0);
  ctx.fill();
}

// A real blur (three box passes, which closely match a Gaussian) done on a reduced copy of the photo, then cached,
// so dragging or typing on the cover stays fast. Works without ctx.filter, so also in Safari.
const blurCache = new Map<string, HTMLCanvasElement>();
function blurredPhoto(el: Extract<CoverEl, { type: "image" }>, img: PhotoSource, sx: number, sy: number, sw: number, sh: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const q = Math.min(1, 520 / Math.max(el.w, el.h));
  const w = Math.max(2, Math.ceil(el.w * q)), h = Math.max(2, Math.ceil(el.h * q));
  const radius = Math.max(1, Math.round(Math.min(1, el.blur ?? 0) * 0.07 * Math.max(w, h)));
  const key = [el.src, sx.toFixed(1), sy.toFixed(1), sw.toFixed(1), sh.toFixed(1), w, h, radius].join("|");
  const hit = blurCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return null;
  g.imageSmoothingQuality = "high";
  g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h);
  const tmp = new Uint8ClampedArray(data.data.length);
  for (let i = 0; i < 3; i++) {
    boxBlur(data.data, tmp, w, h, radius, true);
    boxBlur(tmp, data.data, w, h, radius, false);
  }
  g.putImageData(data, 0, 0);
  if (blurCache.size >= 6) blurCache.delete(blurCache.keys().next().value as string);
  blurCache.set(key, c);
  return c;
}

// One box-blur pass along rows (horizontal) or columns, edges repeat, O(n) with a sliding sum.
function boxBlur(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number, horizontal: boolean) {
  const len = horizontal ? w : h, lines = horizontal ? h : w;
  const step = horizontal ? 4 : w * 4, lineStep = horizontal ? w * 4 : 4;
  const size = 2 * r + 1;
  for (let l = 0; l < lines; l++) {
    const base = l * lineStep;
    for (let ch = 0; ch < 4; ch++) {
      const at = (i: number) => src[base + Math.min(len - 1, Math.max(0, i)) * step + ch];
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += at(i);
      for (let i = 0; i < len; i++) {
        dst[base + i * step + ch] = sum / size;
        sum += at(i + r + 1) - at(i - r);
      }
    }
  }
}

function photoPath(el: Extract<CoverEl, { type: "image" }>): Path2D {
  const p = new Path2D();
  if (el.mask === "circle") p.arc(el.w / 2, el.h / 2, Math.min(el.w, el.h) / 2, 0, Math.PI * 2); // always a true circle
  else p.roundRect(0, 0, el.w, el.h, el.mask === "round" ? Math.min(el.w, el.h) * 0.12 : 0);
  return p;
}

// Photo: shape (rectangle / rounded / circle), mirror, a colour look, darkening for readable text, frame and shadow.
// Looks use blend modes (not ctx.filter), so they also work in Safari.
function drawPhoto(ctx: CanvasRenderingContext2D, el: Extract<CoverEl, { type: "image" }>, img: PhotoSource, ghost = false) {
  // A see-through photo: paint it (with its look) at full strength on its own layer, then lay that layer over the
  // cover at the chosen opacity. Blending straight onto the cover would wash the picture out towards white.
  if (ctx.globalAlpha < 1 && !ghost && typeof document !== "undefined") {
    const layer = document.createElement("canvas");
    layer.width = Math.max(1, Math.ceil(el.w));
    layer.height = Math.max(1, Math.ceil(el.h));
    const lctx = layer.getContext("2d");
    if (lctx) {
      paintPhoto(lctx, el, img, false);
      ctx.drawImage(layer, 0, 0, el.w, el.h);
      return;
    }
  }
  paintPhoto(ctx, el, img, ghost);
}

function paintPhoto(ctx: CanvasRenderingContext2D, el: Extract<CoverEl, { type: "image" }>, img: PhotoSource, ghost: boolean) {
  const path = photoPath(el);
  const alpha = ctx.globalAlpha;
  if (ghost) {
    // While cropping: the part that is cut off stays faintly visible around the frame.
    const g = cropOf(el);
    const s = el.w / ((1 - g.l - g.r) * el.nw);
    ctx.save();
    if (el.flip) { ctx.translate(el.w, 0); ctx.scale(-1, 1); }
    ctx.globalAlpha = alpha * 0.32;
    ctx.drawImage(img, -g.l * el.nw * s, -g.t * el.nh * s, el.nw * s, el.nh * s);
    ctx.restore();
  }
  ctx.save();
  ctx.clip(path);
  ctx.save();
  if (el.flip) { ctx.translate(el.w, 0); ctx.scale(-1, 1); }
  const c = cropOf(el);
  const sx = c.l * el.nw, sy = c.t * el.nh, sw = (1 - c.l - c.r) * el.nw, sh = (1 - c.t - c.b) * el.nh;
  const blurred = el.blur ? blurredPhoto(el, img, sx, sy, sw, sh) : null;
  if (blurred) {
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(blurred, 0, 0, el.w, el.h);
  } else ctx.drawImage(img, sx, sy, sw, sh, 0, 0, el.w, el.h);
  ctx.restore();
  const blend = (op: GlobalCompositeOperation, color: string | CanvasPattern | CanvasGradient, a: number) => {
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = alpha * a;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, el.w, el.h);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = alpha;
  };
  if (el.look === "bw") blend("saturation", "#808080", 1);
  if (el.tint) blend("multiply", el.tint, 0.85);
  if (el.dim) blend("source-over", "#140f32", Math.min(0.8, el.dim));
  ctx.restore();
}

function drawSticker(ctx: CanvasRenderingContext2D, el: StickerEl) {
  const def = stickerDef(el.kind);
  if (!def) return;
  const path = new Path2D(def.d);
  ctx.scale(el.w / 24, el.h / 24);
  ctx.lineWidth = el.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = el.color;
  if (el.filled) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.3;
    ctx.fillStyle = el.color;
    ctx.fill(path);
    ctx.globalAlpha = a;
  }
  ctx.stroke(path);
}

function drawText(ctx: CanvasRenderingContext2D, el: TextEl) {
  const { lines, lineHeight } = layoutText(el, ctx);
  ctx.font = fontOf(el);
  ctx.fillStyle = el.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = el.align;
  if (el.shadow) { ctx.shadowColor = "rgba(20,20,60,0.28)"; ctx.shadowBlur = 18; }
  const x = el.align === "left" ? 0 : el.align === "center" ? el.w / 2 : el.w;
  lines.forEach((l, i) => ctx.fillText(l, x, lineHeight * (i + 0.5)));
}

export function renderDoc(canvas: HTMLCanvasElement, doc: CoverDoc, images: ReadonlyMap<string, PhotoSource>, ghostId: string | null = null) {
  // Resizing resets the canvas, so only do it when the size is wrong.
  if (canvas.width !== COVER_W) canvas.width = COVER_W;
  if (canvas.height !== COVER_H) canvas.height = COVER_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (doc.background.kind === "gradient") {
    const g = ctx.createLinearGradient(0, 0, COVER_W, COVER_H);
    g.addColorStop(0, doc.background.palette[0]);
    g.addColorStop(1, doc.background.palette[1]);
    ctx.fillStyle = g;
  } else ctx.fillStyle = doc.background.color;
  ctx.fillRect(0, 0, COVER_W, COVER_H);
  drawDeco(ctx, doc.deco);

  for (const el of doc.elements) {
    const size = sizeOfEl(el);
    ctx.save();
    ctx.globalAlpha = el.opacity;
    ctx.translate(el.x + size.w / 2, el.y + size.h / 2);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-size.w / 2, -size.h / 2);
    if (el.type === "shape") drawShape(ctx, el);
    else if (el.type === "sticker") drawSticker(ctx, el);
    else if (el.type === "image") {
      const img = images.get(el.src);
      if (img) drawPhoto(ctx, el, img, el.id === ghostId);
    } else drawText(ctx, el);
    ctx.restore();
  }
}

// A ready-made start: the template's decoration and the program title centred in the safe zone.
export function starterDoc(template: CoverTemplateId, palette: readonly [string, string], title: string): CoverDoc {
  const ctx = measurer();
  const text = title.trim() || "Назва програми";
  const base = newText("title", text);
  let size = 72;
  if (ctx) {
    const fit = fitTitle(text, COVER_SAFE.w, COVER_SAFE.h, (s) => (t) => { ctx.font = `700 ${s}px ${FONTS[0].stack}`; return ctx.measureText(t).width; });
    size = fit.size;
  }
  const el: TextEl = { ...base, id: uid(), fontSize: size, x: (COVER_W - COVER_SAFE.w) / 2, w: COVER_SAFE.w };
  const h = layoutText(el, ctx).height;
  return { background: { kind: "gradient", palette }, deco: template, elements: [{ ...el, y: (COVER_H - h) / 2, h }] };
}

