// Marks one rendered page and turns it into JPEG bytes (2026-10-06). Shared by
// EVERY protected PDF in the product — the structured guide's PDF version
// (lib/guidePdfExport.ts) and any uploaded / program-material PDF rendered
// from its original file (lib/protectedDownload.ts) — so all of them carry the
// same quiet marking (deliberately low-key, per Sasha):
//   1. a pale "SENSORIA" wordmark in the background;
//   2. a small pale footer line with the reader and this download's code;
//   3. the INVISIBLE spread-spectrum mark (utils/invisibleMark.ts) built from
//      the server-issued, secret-keyed seed — the real identifier.
// The page is flattened to JPEG afterwards, so none of it is a removable
// layer.
import { embedMark, PAGE_BASE, tokenCode } from "../utils/invisibleMark";
import { watermarkLabel } from "../utils/guideWatermark";

export const FONT = '"Inter","Helvetica Neue",Helvetica,Arial,sans-serif';
export const JPEG_QUALITY = 0.94;

export type Viewer = { id: string; name?: string; email?: string };

export function fontOf(size: number, bold: boolean): string {
  return `${bold ? 700 : 400} ${size}px ${FONT}`;
}

// A quiet "SENSORIA" wordmark repeated diagonally across the sheet, in pale
// grey. Multiply-blended so it only tints the paper and barely touches text:
// it reads as part of the background, not as a stamp over the content.
export function drawBrand(
  ctx: CanvasRenderingContext2D,
  ptW: number,
  ptH: number,
  jitterX: number,
  jitterY: number
) {
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.translate(ptW / 2, ptH / 2);
  ctx.rotate((-28 * Math.PI) / 180);
  ctx.font = fontOf(30, true);
  ctx.fillStyle = "rgb(246,247,250)";
  const tileW = ctx.measureText("S E N S O R I A").width + 150;
  const rowH = 190;
  const span = Math.hypot(ptW, ptH);
  let row = 0;
  for (let y = -span; y < span; y += rowH, row += 1) {
    const stagger = (row % 2) * (tileW / 2);
    for (let x = -span - tileW + stagger + jitterX; x < span; x += tileW) {
      ctx.fillText("S E N S O R I A", x, y + jitterY);
    }
  }
  ctx.restore();
}

export function jitterFor(token: number) {
  const code = tokenCode(token);
  return { x: (parseInt(code.slice(0, 3), 36) % 50) - 25, y: (parseInt(code.slice(3, 5), 36) % 30) - 15 };
}

export type StampOptions = {
  viewer: Viewer;
  token: number;
  seed: number;
  pageIndex: number;
  pageCount: number;
  // Page size in points; the canvas is ptW*scale × ptH*scale pixels.
  ptWidth: number;
  ptHeight: number;
  // true for pages rendered from someone else's PDF (white paper): lowers
  // white to the off-white the invisible mark needs. Guide pages are drawn
  // on that off-white already.
  levelWhite: boolean;
  // Draw the visible tiles ON TOP (always) and, when the page is ours, also
  // under the text (the caller does that before drawing content).
};

// Marks the already-drawn page canvas in place.
export function stampPage(canvas: HTMLCanvasElement, opts: StampOptions): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas недоступний у цьому браузері.");
  const scale = canvas.width / opts.ptWidth;
  const code = tokenCode(opts.token);
  const label = watermarkLabel(opts.viewer);
  const jitter = jitterFor(opts.token);

  if (opts.levelWhite) {
    // Map 0..255 → 0..PAGE_BASE so there is head-room for the mark.
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const k = PAGE_BASE / 255;
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = img.data[i] * k;
      img.data[i + 1] = img.data[i + 1] * k;
      img.data[i + 2] = img.data[i + 2] * k;
    }
    ctx.putImageData(img, 0, 0);
  }

  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.textBaseline = "alphabetic";
  // Someone else's PDF is already flattened, so the wordmark can only go on
  // top (multiply-blended, see drawBrand); our own pages draw it underneath.
  if (opts.levelWhite) drawBrand(ctx, opts.ptWidth, opts.ptHeight, jitter.x, jitter.y);

  // Footer: the one visible line of identity, small and pale.
  ctx.font = fontOf(7.5, false);
  ctx.fillStyle = "#b4b9c4";
  ctx.fillText(`${label} · ${code}`, 52, opts.ptHeight - 30);
  const num = `${opts.pageIndex + 1} / ${opts.pageCount}`;
  ctx.fillText(num, opts.ptWidth - 52 - ctx.measureText(num).width, opts.ptHeight - 30);
  ctx.restore();

  // Invisible mark: last, on the final pixels, so nothing paints over it.
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  embedMark(data.data, canvas.width, canvas.height, opts.seed);
  ctx.putImageData(data, 0, 0);
}

export function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) return reject(new Error("Не вдалося створити зображення сторінки."));
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

export function saveBlobAs(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Delayed revoke — Safari can drop the save if the URL goes away first.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
