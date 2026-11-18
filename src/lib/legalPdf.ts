// «Документи і згоди» → «Завантажити PDF»: the full text of a legal document (every section, not the one-at-a-time
// view of the page) with a note of when this person accepted which edition. Drawn on canvases in the brand style and
// packed by the same PDF writer as receipts and guides (utils/imagePdf.ts), so Cyrillic renders exactly as on screen.
import type { LegalSection } from "../components/legal/LegalLayout";
import { LEGAL, type LegalKey } from "../data/legalOperator";
import { buildImagePdf, type ImagePage } from "../utils/imagePdf";
import { fontOf, saveBlobAs } from "./pdfStamp";

// text pages compress well: a lower JPEG quality keeps the file small without visible loss
const toJpeg = (c: HTMLCanvasElement): Promise<Uint8Array> =>
  new Promise((resolve, reject) => c.toBlob(async (b) => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error("Не вдалося створити PDF."))), "image/jpeg", 0.72));

const PT_W = 595; // A4 in points
const PT_H = 842;
const SCALE = 1.6; // ≈115 dpi: sharp text, a few hundred KB for a long document
const LEFT = 56;
const RIGHT = PT_W - 56;
const TOP = 64;
const BOTTOM = PT_H - 56;

/** {{operatorName}} → its value; anything unknown stays readable. */
export function resolveTokens(text: string): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, k: string) => (k.startsWith("?") ? "" : LEGAL[k as LegalKey] || k));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxW || !line) line = next;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out;
}

export type Acceptance = { acceptedAt: string; version: string; otpVerifiedAt?: string | null };

export async function downloadLegalPdf(p: {
  title: string;
  sections: LegalSection[];
  edition: string;
  effectiveDate?: string;
  acceptance?: Acceptance | null;
  fileName: string;
  /** replaces the «Редакція …» line (e.g. an act number and date) */
  subtitle?: string;
}): Promise<void> {
  const pages: HTMLCanvasElement[] = [];
  let ctx!: CanvasRenderingContext2D;
  let y = 0;

  const newPage = () => {
    const c = document.createElement("canvas");
    c.width = Math.round(PT_W * SCALE);
    c.height = Math.round(PT_H * SCALE);
    const x = c.getContext("2d");
    if (!x) throw new Error("Не вдалося створити PDF.");
    x.scale(SCALE, SCALE);
    x.fillStyle = "#ffffff";
    x.fillRect(0, 0, PT_W, PT_H);
    const band = x.createLinearGradient(0, 0, PT_W, 0);
    band.addColorStop(0, "#3b6df0");
    band.addColorStop(1, "#7c5cf0");
    x.fillStyle = band;
    x.fillRect(0, 0, PT_W, 6);
    x.textBaseline = "alphabetic";
    pages.push(c);
    ctx = x;
    y = TOP;
  };
  const need = (h: number) => {
    if (y + h > BOTTOM) newPage();
  };
  const para = (text: string, size: number, bold: boolean, color: string, gap: number, indent = 0, bullet = false) => {
    ctx.font = fontOf(size, bold);
    const lh = Math.round(size * 1.45);
    const rows = wrap(ctx, text, RIGHT - LEFT - indent);
    rows.forEach((r, i) => {
      need(lh);
      ctx.fillStyle = color;
      ctx.font = fontOf(size, bold);
      if (bullet && i === 0) ctx.fillText("•", LEFT + indent - 10, y);
      ctx.fillText(r, LEFT + indent, y);
      y += lh;
    });
    y += gap;
  };

  newPage();
  ctx.fillStyle = "#4338ca";
  ctx.font = fontOf(11, true);
  ctx.fillText("S E N S O R I A", LEFT, y);
  y += 28;
  para(p.title, 19, true, "#12172b", 6);
  para(p.subtitle ?? `Редакція ${p.edition}${p.effectiveDate ? ` · набирає чинності ${p.effectiveDate}` : ""}`, 10.5, false, "#6b6f86", 10);

  if (p.acceptance) {
    const lines = [
      `Ви прийняли цей документ ${new Date(p.acceptance.acceptedAt).toLocaleString("uk-UA")} (редакція ${p.acceptance.version}).`,
      ...(p.acceptance.otpVerifiedAt ? [`Підписано одноразовим кодом з листа ${new Date(p.acceptance.otpVerifiedAt).toLocaleString("uk-UA")}.`] : []),
    ];
    ctx.font = fontOf(10.5, false);
    const h = lines.reduce((n, l) => n + wrap(ctx, l, RIGHT - LEFT - 24).length * 15, 0) + 18;
    need(h);
    ctx.fillStyle = "#eef0fd";
    ctx.fillRect(LEFT, y - 12, RIGHT - LEFT, h);
    y += 4;
    for (const l of lines) para(l, 10.5, false, "#3b27a8", 0, 12);
    y += 18;
  }

  p.sections.forEach((s, i) => {
    need(40);
    y += 6;
    para(`${i + 1}. ${s.title}`, 13, true, "#12172b", 4);
    for (const b of s.body) {
      if (Array.isArray(b)) {
        for (const li of b) para(resolveTokens(li), 10.5, false, "#2b2f45", 3, 16, true);
        y += 4;
      } else {
        para(resolveTokens(b), 10.5, false, "#2b2f45", 7);
      }
    }
  });

  // page numbers and the date of the download
  const made = new Date().toLocaleString("uk-UA");
  const out: ImagePage[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    const x = pages[i].getContext("2d")!;
    x.fillStyle = "#8a8ea3";
    x.font = fontOf(9, false);
    x.fillText(`${p.title} · сторінка ${i + 1} з ${pages.length} · сформовано ${made}`, LEFT, PT_H - 30);
    out.push({ jpeg: await toJpeg(pages[i]), pxWidth: pages[i].width, pxHeight: pages[i].height });
  }
  const pdf = buildImagePdf(out, { pageWidth: PT_W, pageHeight: PT_H, title: p.title, producer: "Sensoria" });
  saveBlobAs(new Blob([pdf as BlobPart], { type: "application/pdf" }), p.fileName);
}
