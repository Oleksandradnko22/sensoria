// «Оплати» → «Квитанція»: the receipt is downloaded straight away as a PDF (no preview). The page is drawn on a
// canvas in the brand style and packed by the same minimal PDF writer the guides use (utils/imagePdf.ts), so Cyrillic
// renders exactly as on screen without embedding fonts.
import { buildImagePdf } from "../utils/imagePdf";
import { canvasToJpeg, fontOf, saveBlobAs } from "./pdfStamp";

const PT_W = 595; // A4 in points
const PT_H = 842;
const SCALE = 2.5; // ≈180 dpi

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
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

export async function downloadReceiptPdf(lines: [string, string][], number: string, note: string): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(PT_W * SCALE);
  canvas.height = Math.round(PT_H * SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Не вдалося створити PDF.");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PT_W, PT_H);

  // brand band
  const band = ctx.createLinearGradient(0, 0, PT_W, 0);
  band.addColorStop(0, "#3b6df0");
  band.addColorStop(1, "#7c5cf0");
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, PT_W, 8);

  const left = 56;
  const right = PT_W - 56;
  let y = 72;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#4338ca";
  ctx.font = fontOf(13, true);
  ctx.fillText("S E N S O R I A", left, y);
  y += 34;
  ctx.fillStyle = "#12172b";
  ctx.font = fontOf(24, true);
  ctx.fillText("Квитанція про покупку", left, y);
  y += 30;

  const valueX = left + 170;
  for (const [label, value] of lines) {
    ctx.font = fontOf(11.5, true);
    const rows = wrap(ctx, value, right - valueX);
    const h = Math.max(1, rows.length) * 16 + 14;
    ctx.strokeStyle = "#ece9f8";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillStyle = "#6b6f86";
    ctx.font = fontOf(11.5, false);
    ctx.fillText(label, left, y + 20);
    ctx.fillStyle = "#12172b";
    ctx.font = fontOf(11.5, true);
    rows.forEach((r, i) => ctx.fillText(r, right - ctx.measureText(r).width, y + 20 + i * 16));
    y += h;
  }
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(right, y);
  ctx.stroke();

  y += 28;
  ctx.fillStyle = "#8a8ea3";
  ctx.font = fontOf(10, false);
  for (const r of wrap(ctx, note, right - left)) {
    ctx.fillText(r, left, y);
    y += 14;
  }
  ctx.fillText(`Сформовано ${new Date().toLocaleString("uk-UA")}`, left, PT_H - 40);

  const jpeg = await canvasToJpeg(canvas);
  const pdf = buildImagePdf([{ jpeg, pxWidth: canvas.width, pxHeight: canvas.height }], {
    pageWidth: PT_W,
    pageHeight: PT_H,
    title: `Квитанція ${number}`,
    producer: "Sensoria",
  });
  saveBlobAs(new Blob([pdf as BlobPart], { type: "application/pdf" }), `sensoria-kvytantsiia-${number.replace("#", "")}.pdf`);
}
