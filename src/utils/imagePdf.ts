// A minimal PDF writer for IMAGE-ONLY documents (2026-10-06): every page is
// one JPEG covering the whole sheet. That is exactly the point — a PDF made
// of flattened page pictures has no text layer, no vector overlay and no
// separate watermark object to delete; whatever was drawn into the pixels
// (including the watermark) stays in the pixels.
//
// Pure byte-building, no browser APIs, so it is tested in node
// (utils/imagePdf.test.ts). Enough of the PDF 1.4 spec for this one job.

export type ImagePage = {
  jpeg: Uint8Array;
  // Pixel size of the JPEG.
  pxWidth: number;
  pxHeight: number;
  // Sheet size in points for THIS page; defaults to the document's
  // (pages of an uploaded PDF keep their own sizes).
  ptWidth?: number;
  ptHeight?: number;
};

export type ImagePdfOptions = {
  // Sheet size in PDF points.
  pageWidth: number;
  pageHeight: number;
  title?: string;
  subject?: string;
  producer?: string;
};

const encoder = new TextEncoder();

// PDF text string as UTF-16BE hex (handles Cyrillic).
export function pdfTextString(text: string): string {
  let hex = "FEFF";
  for (let i = 0; i < text.length; i += 1) {
    hex += text.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  }
  return `<${hex}>`;
}

export function buildImagePdf(pages: ImagePage[], opts: ImagePdfOptions): Uint8Array {
  if (pages.length === 0) throw new Error("PDF needs at least one page");

  const chunks: Uint8Array[] = [];
  const offsets: number[] = []; // offsets[objectNumber] = byte offset
  let length = 0;
  const write = (data: Uint8Array | string) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const beginObject = (n: number) => {
    offsets[n] = length;
    write(`${n} 0 obj\n`);
  };

  // Object numbering: 1 catalog, 2 pages tree, 3 info, then per page
  // (page, contents, image) = 3 objects each.
  const firstPageObj = 4;
  const pageObj = (i: number) => firstPageObj + i * 3;
  const kids = pages.map((_, i) => `${pageObj(i)} 0 R`).join(" ");

  write("%PDF-1.4\n%âãÏÓ\n");

  beginObject(1);
  write("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  beginObject(2);
  write(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);

  beginObject(3);
  let info = "<<";
  if (opts.title) info += ` /Title ${pdfTextString(opts.title)}`;
  if (opts.subject) info += ` /Subject ${pdfTextString(opts.subject)}`;
  if (opts.producer) info += ` /Producer ${pdfTextString(opts.producer)} /Creator ${pdfTextString(opts.producer)}`;
  info += " >>\nendobj\n";
  write(info);

  pages.forEach((page, i) => {
    const p = pageObj(i);
    const pw = page.ptWidth ?? opts.pageWidth;
    const ph = page.ptHeight ?? opts.pageHeight;
    beginObject(p);
    write(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] ` +
        `/Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>\nendobj\n`
    );

    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    beginObject(p + 1);
    write(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

    beginObject(p + 2);
    write(
      `<< /Type /XObject /Subtype /Image /Width ${page.pxWidth} /Height ${page.pxHeight} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`
    );
    write(page.jpeg);
    write("\nendstream\nendobj\n");
  });

  const objectCount = firstPageObj + pages.length * 3; // highest object number + 1
  const xrefOffset = length;
  let xref = `xref\n0 ${objectCount}\n0000000000 65535 f \n`;
  for (let n = 1; n < objectCount; n += 1) {
    xref += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  }
  write(xref);
  write(`trailer\n<< /Size ${objectCount} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}
