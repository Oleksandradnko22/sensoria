// The ONE way a PDF that belongs to paid content leaves Sensoria
// (2026-10-06): uploaded guide PDFs and program materials alike. (A guide
// built in Sensoria has its own renderer, lib/guidePdfExport.ts, but ends in
// the same marking, lib/pdfStamp.ts.)
//
//   1. the server issues this download's mark and records who got it
//      (lib/pdfMarkIssue.ts) — if that fails there is NO file;
//   2. the original PDF's pages are rendered to canvases (lib/pdfRender.ts);
//   3. every page gets the visible reader watermark, per-page code marks and
//      the invisible spread-spectrum mark (lib/pdfStamp.ts);
//   4. the pages are flattened to JPEG and assembled into an image-only PDF
//      (utils/imagePdf.ts) — no text layer, no removable overlay.
//
// Trade-offs, stated plainly: the result is a picture of the document, so
// its text can no longer be selected or searched and links/forms in the
// original stop working. A file that cannot be fetched by the browser
// (no CORS) cannot be protected and is refused rather than handed out raw.
import { buildImagePdf, type ImagePage } from "../utils/imagePdf";
import { tokenCode } from "../utils/invisibleMark";
import { logContentAccess } from "./accessLog";
import { issuePdfMark, type IssuedMark, type PdfMarkKind } from "./pdfMarkIssue";
import { renderPdfPages } from "./pdfRender";
import { canvasToJpeg, saveBlobAs, stampPage, type Viewer } from "./pdfStamp";

export function pdfFileName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned || "document"}.pdf`;
}

export async function downloadProtectedPdf(params: {
  kind: PdfMarkKind;
  contentId: string;
  title: string;
  url: string;
  viewer: Viewer | null | undefined;
}): Promise<{ recorded: boolean }> {
  if (!params.viewer?.id) throw new Error("Щоб завантажити PDF, увійдіть в акаунт.");
  const viewer = params.viewer;
  logContentAccess(params.contentId, "download");
  const mark: IssuedMark = await issuePdfMark(params.kind, params.contentId);
  const pages = await renderPdfPages(params.url);

  const images: ImagePage[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    const { canvas, ptWidth, ptHeight } = pages[i];
    stampPage(canvas, {
      viewer,
      token: mark.token,
      seed: mark.seed,
      pageIndex: i,
      pageCount: pages.length,
      ptWidth,
      ptHeight,
      levelWhite: true,
    });
    images.push({ jpeg: await canvasToJpeg(canvas), pxWidth: canvas.width, pxHeight: canvas.height, ptWidth, ptHeight });
  }

  const bytes = buildImagePdf(images, {
    pageWidth: 595,
    pageHeight: 842,
    title: params.title,
    subject: `Копія для ${viewer.email || viewer.name || viewer.id}`,
    producer: `Sensoria · ${tokenCode(mark.token)}`,
  });
  saveBlobAs(new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }), pdfFileName(params.title));
  return { recorded: mark.recorded };
}

// Pages for the in-app reader: plain rendering, no marks (watermarks belong
// to downloaded copies only). Kept as canvases to display, never as a file.
export async function renderPdfView(url: string): Promise<HTMLCanvasElement[]> {
  const pages = await renderPdfPages(url);
  return pages.map((p) => p.canvas);
}
