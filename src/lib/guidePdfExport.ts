// Builds the downloadable PDF of a structured guide (2026-10-06) as
// FLATTENED PAGE IMAGES with the watermark baked into the pixels.
//
// Pipeline: StaticBlock[] → load the guide's pictures → page layout
// (utils/guidePdfLayout.ts) → each page drawn on a canvas → three layers of
// marking painted into that canvas:
//   1. a visible diagonal watermark with the reader's email (under AND over
//      the text);
//   2. small marks carrying this download's code at positions that differ
//      per page;
//   3. an INVISIBLE spread-spectrum mark keyed to this download's random
//      token (utils/invisibleMark.ts) — it survives screenshots and
//      re-compression and identifies the download, via the server's export
//      log (lib/guidePdfExports.ts), even when the visible marks are gone.
// → JPEG → image-only PDF (utils/imagePdf.ts). The file has no text layer,
// no vector layer and no separate watermark object.
//
// Honest limits: this runs in the reader's browser, so it hardens the FILE
// but not the pipeline (a determined person can still screenshot the
// on-screen preview, which only carries the visible overlay). Server-side
// rendering would close that too.
import type { StaticBlock } from "../data/guideStatic";
import {
  layoutGuidePdf,
  PAGE_H,
  PAGE_W,
  type Cmd,
  type ImageSizes,
  type Measure,
} from "../utils/guidePdfLayout";
import { buildImagePdf, type ImagePage } from "../utils/imagePdf";
import { PAGE_BASE, tokenCode } from "../utils/invisibleMark";
import { canvasToJpeg, drawBrand, fontOf, jitterFor, stampPage, type Viewer } from "./pdfStamp";

// Canvas pixels per PDF point — ~160 dpi, sharp for reading, modest size.
// (The invisible mark's 8-px cells line up with JPEG's 8×8 blocks.)
const SCALE = 2.4;

// Pictures of the guide, loaded for drawing. CORS must allow it (Supabase
// Storage public buckets do): without it the canvas would be tainted and
// could not be exported, so such an image is simply left out and its
// caption is printed instead (the layout does that for sizes it lacks).
async function loadImages(blocks: StaticBlock[]): Promise<{ sizes: ImageSizes; elements: Map<string, HTMLImageElement> }> {
  const urls = Array.from(new Set(blocks.flatMap((b) => (b.kind === "image" ? [b.url] : []))));
  const sizes: ImageSizes = {};
  const elements = new Map<string, HTMLImageElement>();
  await Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              sizes[url] = { w: img.naturalWidth, h: img.naturalHeight };
              elements.set(url, img);
            }
            resolve();
          };
          img.onerror = () => resolve();
          img.src = url;
        })
    )
  );
  return { sizes, elements };
}

function drawCommands(ctx: CanvasRenderingContext2D, commands: Cmd[], images: Map<string, HTMLImageElement>) {
  for (const c of commands) {
    if (c.t === "text") {
      ctx.font = fontOf(c.size, !!c.bold);
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, c.x, c.y);
    } else if (c.t === "line") {
      ctx.strokeStyle = c.color;
      ctx.lineWidth = c.lw;
      ctx.beginPath();
      ctx.moveTo(c.x1, c.y1);
      ctx.lineTo(c.x2, c.y2);
      ctx.stroke();
    } else if (c.t === "image") {
      const img = images.get(c.url);
      if (img) ctx.drawImage(img, c.x, c.y, c.w, c.h);
    } else {
      ctx.beginPath();
      if (c.r && "roundRect" in ctx) (ctx as CanvasRenderingContext2D).roundRect(c.x, c.y, c.w, c.h, c.r);
      else ctx.rect(c.x, c.y, c.w, c.h);
      if (c.fill) {
        ctx.fillStyle = c.fill;
        ctx.fill();
      }
      if (c.stroke) {
        ctx.strokeStyle = c.stroke;
        ctx.lineWidth = c.lw ?? 1;
        ctx.stroke();
      }
    }
  }
}

// Draws the guide's own page: off-white paper, the pale wordmark UNDER the
// text, then the content. (The rest of the marking is lib/pdfStamp.ts.)
function drawPage(
  ctx: CanvasRenderingContext2D,
  commands: Cmd[],
  images: Map<string, HTMLImageElement>,
  token: number
) {
  ctx.fillStyle = `rgb(${PAGE_BASE},${PAGE_BASE},${PAGE_BASE})`;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  const j = jitterFor(token);
  drawBrand(ctx, PAGE_W, PAGE_H, j.x, j.y);
  drawCommands(ctx, commands, images);
}

export function guidePdfFileName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${cleaned || "guide"}.pdf`;
}

export async function exportGuidePdf(params: {
  title: string;
  subtitle?: string;
  blocks: StaticBlock[];
  viewer: Viewer;
  // This download's mark, issued by the server (lib/pdfMarkIssue.ts) before
  // we got here — a file can never exist without its issuance record.
  token: number;
  seed: number;
}): Promise<Blob> {
  // Make sure the web font is ready, otherwise measuring and drawing would
  // disagree about glyph widths.
  if (document.fonts?.ready) await document.fonts.ready;

  const scratch = document.createElement("canvas").getContext("2d");
  if (!scratch) throw new Error("Canvas недоступний у цьому браузері.");
  const measure: Measure = (text, size, bold) => {
    scratch.font = fontOf(size, bold);
    return scratch.measureText(text).width;
  };

  const { sizes, elements } = await loadImages(params.blocks);
  const pages = layoutGuidePdf({ title: params.title, subtitle: params.subtitle, blocks: params.blocks }, measure, sizes);

  const images: ImagePage[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(PAGE_W * SCALE);
    canvas.height = Math.round(PAGE_H * SCALE);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas недоступний у цьому браузері.");
    ctx.scale(SCALE, SCALE);
    ctx.textBaseline = "alphabetic";
    drawPage(ctx, pages[i], elements, params.token);
    stampPage(canvas, {
      viewer: params.viewer,
      token: params.token,
      seed: params.seed,
      pageIndex: i,
      pageCount: pages.length,
      ptWidth: PAGE_W,
      ptHeight: PAGE_H,
      levelWhite: false,
    });

    images.push({ jpeg: await canvasToJpeg(canvas), pxWidth: canvas.width, pxHeight: canvas.height });
  }

  const bytes = buildImagePdf(images, {
    pageWidth: PAGE_W,
    pageHeight: PAGE_H,
    title: params.title,
    subject: `Копія для ${params.viewer.email || params.viewer.name || params.viewer.id}`,
    producer: `Sensoria · ${tokenCode(params.token)}`,
  });
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

// First pages of the guide as plain images for the preview page ("Подивіться
// всередину"): same layout as the PDF, but WITHOUT any mark and at a modest
// size — only the opening pages are ever shown, never the whole document.
export async function renderGuidePreviewPages(params: {
  title: string;
  subtitle?: string;
  blocks: StaticBlock[];
  count: number;
}): Promise<{ imageUrl: string; label: string }[]> {
  if (document.fonts?.ready) await document.fonts.ready;
  const scratch = document.createElement("canvas").getContext("2d");
  if (!scratch) return [];
  const measure: Measure = (text, size, bold) => {
    scratch.font = fontOf(size, bold);
    return scratch.measureText(text).width;
  };
  const { sizes, elements } = await loadImages(params.blocks);
  const pages = layoutGuidePdf({ title: params.title, subtitle: params.subtitle, blocks: params.blocks }, measure, sizes);
  const scale = 1.6;
  const out: { imageUrl: string; label: string }[] = [];
  for (let i = 0; i < Math.min(params.count, pages.length); i += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(PAGE_W * scale);
    canvas.height = Math.round(PAGE_H * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.scale(scale, scale);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    drawCommands(ctx, pages[i], elements);
    out.push({ imageUrl: canvas.toDataURL("image/jpeg", 0.85), label: i === 0 ? "Початок гайду" : `Сторінка ${i + 1}` });
  }
  return out;
}
