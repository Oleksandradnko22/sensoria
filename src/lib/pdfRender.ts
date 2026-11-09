// Renders any PDF's pages to canvases in the browser (2026-10-06), so an
// uploaded / program-material PDF can go through the same marking pipeline
// as a Sensoria-built guide (lib/pdfStamp.ts) and be either shown page by
// page or re-assembled into a flattened, watermarked file.
//
// pdf.js is loaded from a CDN at the moment it is first needed — the same
// no-npm-dependency pattern as lib/pdfExport.ts (jsPDF/html2canvas) and
// lib/youtubePlayerApi.ts. The file must be fetchable by the browser (CORS);
// if it is not, this rejects and callers fall back or refuse (see
// protectedDownload.ts).

type PdfJsPage = {
  getViewport(opts: { scale: number }): { width: number; height: number };
  render(opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
};
type PdfJsDoc = { numPages: number; getPage(n: number): Promise<PdfJsPage>; destroy(): Promise<void> };
type PdfJsLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: ArrayBuffer }): { promise: Promise<PdfJsDoc> };
};

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
  }
}

const VERSION = "3.11.174";
const BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${VERSION}`;

let loading: Promise<PdfJsLib> | null = null;

function loadPdfJs(): Promise<PdfJsLib> {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (loading) return loading;
  loading = new Promise<PdfJsLib>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${BASE}/pdf.min.js`;
    script.async = true;
    script.onload = async () => {
      const lib = window.pdfjsLib;
      if (!lib) return reject(new Error("pdf.js не завантажився."));
      try {
        // A cross-origin worker URL is refused by browsers; wrap its code in
        // a same-origin blob instead.
        const code = await (await fetch(`${BASE}/pdf.worker.min.js`)).text();
        lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
        resolve(lib);
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Не вдалося запустити pdf.js."));
      }
    };
    script.onerror = () => reject(new Error("Не вдалося завантажити pdf.js."));
    document.head.appendChild(script);
  }).catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

export type RenderedPdfPage = { canvas: HTMLCanvasElement; ptWidth: number; ptHeight: number };

// Pixels per PDF point for rendered pages (~144 dpi), capped by width so a
// poster-sized page does not exhaust memory.
const RENDER_SCALE = 2;
const MAX_WIDTH_PX = 1800;
export const MAX_PROTECTED_PAGES = 150;

export async function renderPdfPages(url: string, maxPages = MAX_PROTECTED_PAGES): Promise<RenderedPdfPage[]> {
  const [lib, res] = await Promise.all([loadPdfJs(), fetch(url)]);
  if (!res.ok) throw new Error(`Не вдалося отримати PDF (HTTP ${res.status}).`);
  const doc = await lib.getDocument({ data: await res.arrayBuffer() }).promise;
  try {
    if (doc.numPages > maxPages) {
      throw new Error(`PDF занадто великий для захищеного перегляду (${doc.numPages} стор., максимум ${maxPages}).`);
    }
    const pages: RenderedPdfPage[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(RENDER_SCALE, MAX_WIDTH_PX / base.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas недоступний у цьому браузері.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      pages.push({ canvas, ptWidth: base.width, ptHeight: base.height });
    }
    return pages;
  } finally {
    void doc.destroy();
  }
}
