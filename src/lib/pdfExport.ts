// Turns a DOM element into a real, one-click downloadable .pdf file —
// used by the "Завантажити PDF" button on the program completion report
// (ProgramExperience.tsx). Deliberately NOT an npm dependency: this
// project's build sandbox has no network access to the npm registry, so
// jsPDF/html2canvas are instead loaded from a CDN at the moment someone
// actually clicks the button — the END USER's browser fetches them, not
// this build, exactly the same cached-Promise <script> loader pattern
// already used for the YouTube IFrame API (see lib/youtubePlayerApi.ts).
// index.html has no CSP restricting this.
//
// html2canvas rasterizes the element exactly as currently rendered on
// screen; jsPDF then wraps that single image into one PDF page sized to
// match it and triggers a real file save — no browser print dialog, no
// "choose a printer/destination" step in between.

type Html2Canvas = (
  element: HTMLElement,
  options?: Record<string, unknown>
) => Promise<HTMLCanvasElement>;

type JsPdfInstance = {
  internal: { pageSize: { getWidth(): number; getHeight(): number } };
  addImage(imageData: string, format: string, x: number, y: number, width: number, height: number): void;
  save(filename: string): void;
};

type JsPdfConstructor = new (options?: Record<string, unknown>) => JsPdfInstance;

declare global {
  interface Window {
    html2canvas?: Html2Canvas;
    jspdf?: { jsPDF: JsPdfConstructor };
  }
}

const HTML2CANVAS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
const JSPDF_SRC = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error(`Не вдалося завантажити ${src}`)), { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Не вдалося завантажити ${src}`));
    document.head.appendChild(script);
  });
}

let librariesPromise: Promise<void> | null = null;

function loadPdfLibraries(): Promise<void> {
  if (librariesPromise) return librariesPromise;
  librariesPromise = Promise.all([
    window.html2canvas ? Promise.resolve() : loadScript(HTML2CANVAS_SRC),
    window.jspdf ? Promise.resolve() : loadScript(JSPDF_SRC),
  ]).then(() => undefined);
  return librariesPromise;
}

// Renders `element` into a downloadable PDF and saves it as `filename`
// (should already end in ".pdf"). Elements marked with the
// `ignoreClassName` CSS class (default "report-print-hide" — the same
// class the report's own @media print fallback styles use) are left out
// of the capture, same idea as print stylesheets hiding page controls
// that have no meaning in a saved document.
export async function downloadElementAsPdf(
  element: HTMLElement,
  filename: string,
  ignoreClassName = "report-print-hide"
): Promise<void> {
  await loadPdfLibraries();
  const html2canvas = window.html2canvas;
  const JsPDF = window.jspdf?.jsPDF;
  if (!html2canvas || !JsPDF) {
    throw new Error("Не вдалося завантажити бібліотеки для PDF.");
  }

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    ignoreElements: (el: Element) => el.classList.contains(ignoreClassName),
  });
  const imageData = canvas.toDataURL("image/jpeg", 0.92);

  // One page sized exactly to the captured content — this report is a
  // single continuous card, not a multi-section document, so there's no
  // real "page 2" to paginate into; a custom page size avoids any A4
  // cropping/scaling math for what's meant to be read as one sheet.
  const pdf = new JsPDF({ unit: "px", format: [canvas.width, canvas.height] });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  pdf.addImage(imageData, "JPEG", 0, 0, pageWidth, pageHeight);
  pdf.save(filename);
}
