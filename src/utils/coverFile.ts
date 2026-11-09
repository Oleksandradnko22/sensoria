// What the cover section promises the author is checked before anything is uploaded (JPG / PNG only), and the picture is
// prepared for the site: very large originals are scaled down gently (long side 2400 px, JPEG quality 92 — visually the
// same, but far lighter for the catalog), small good ones are left exactly as they are.
export const COVER_MAX_INPUT_BYTES = 25 * 1024 * 1024; // what the author may pick
export const COVER_MAX_STORED_BYTES = 5 * 1024 * 1024; // what is kept on the site after preparation
export const COVER_TYPES = ["image/jpeg", "image/png"] as const;
export const COVER_MIN_WIDTH = 1200;
export const COVER_MIN_HEIGHT = 675;
export const COVER_MAX_SIDE = 2400;
const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024;
const JPEG_QUALITY = 0.92;

export function coverFileProblem(file: { type: string; size: number }): string | null {
  if (!COVER_TYPES.includes(file.type as (typeof COVER_TYPES)[number])) {
    return "Підійде лише зображення JPG або PNG. Інші формати (наприклад, HEIC, GIF чи WebP) спершу збережіть як JPG.";
  }
  if (file.size > COVER_MAX_INPUT_BYTES) {
    return `Файл завеликий (${(file.size / 1024 / 1024).toFixed(1).replace(".", ",")} МБ). Максимум — 25 МБ.`;
  }
  if (file.size === 0) return "Файл порожній. Оберіть інше зображення.";
  return null;
}

/** The size after fitting the longer side into `max` (never enlarges). */
export function fitWithin(width: number, height: number, max = COVER_MAX_SIDE): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const k = max / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** Is it worth re-encoding? Small files with a sensible size stay untouched (no quality loss at all). */
export function needsPreparing(file: { type: string; size: number }, width: number, height: number): boolean {
  if (Math.max(width, height) > COVER_MAX_SIDE) return true;
  return file.size > KEEP_AS_IS_BYTES;
}

export function lowResolutionWarning(width: number, height: number): string | null {
  if (width >= COVER_MIN_WIDTH && height >= COVER_MIN_HEIGHT) return null;
  return `Зображення невелике (${width} × ${height} px). Рекомендуємо від ${COVER_MIN_WIDTH} × ${COVER_MIN_HEIGHT}: інакше обкладинка може виглядати нечітко. Його все одно можна використати.`;
}

export type PreparedCover = { file: File; width: number; height: number; warning: string | null };

async function decode(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return { width: bmp.width, height: bmp.height, draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), close: () => bmp.close() };
    } catch {
      /* fall back to an <img> below */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error("decode")); img.src = url; });
  return { width: img.naturalWidth, height: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), close: () => URL.revokeObjectURL(url) };
}

/** Browser only. Reads the picture, warns about a low resolution, and (when needed) scales it down to a light JPEG. */
export async function prepareCoverImage(file: File): Promise<PreparedCover> {
  const src = await decode(file);
  try {
    const warning = lowResolutionWarning(src.width, src.height);
    if (!needsPreparing(file, src.width, src.height)) return { file, width: src.width, height: src.height, warning };
    const { width, height } = fitWithin(src.width, src.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { file, width: src.width, height: src.height, warning };
    ctx.fillStyle = "#ffffff"; // a PNG with transparency must not turn black
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = "high";
    src.draw(ctx, width, height);
    const blob: Blob | null = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return { file, width: src.width, height: src.height, warning }; // never make it worse
    const name = file.name.replace(/\.[^.]+$/, "") || "cover";
    return { file: new File([blob], `${name}.jpg`, { type: "image/jpeg" }), width, height, warning };
  } finally {
    src.close();
  }
}
