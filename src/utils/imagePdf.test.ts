import { test } from "node:test";
import assert from "node:assert/strict";
import { buildImagePdf, pdfTextString } from "./imagePdf.ts";

const fakeJpeg = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => i % 251));
const text = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);
const opts = { pageWidth: 595, pageHeight: 842, title: "Тривога", producer: "Sensoria · ABC" };

test("pdfTextString: UTF-16BE hex with BOM (Cyrillic-safe)", () => {
  assert.equal(pdfTextString("Aб"), "<FEFF00410431>");
});

test("a PDF is produced with header, one page object per image and an EOF marker", () => {
  const pdf = buildImagePdf([{ jpeg: fakeJpeg(40), pxWidth: 10, pxHeight: 14 }, { jpeg: fakeJpeg(55), pxWidth: 10, pxHeight: 14 }], opts);
  const s = text(pdf);
  assert.ok(s.startsWith("%PDF-1.4"));
  assert.ok(s.trimEnd().endsWith("%%EOF"));
  assert.equal(s.match(/\/Type \/Page /g)?.length, 2);
  assert.ok(s.includes("/Count 2"));
  assert.ok(s.includes("/Filter /DCTDecode"));
});

test("the file is image-only: no text-drawing operators, no text fonts", () => {
  const s = text(buildImagePdf([{ jpeg: fakeJpeg(20), pxWidth: 4, pxHeight: 4 }], opts));
  assert.equal(/\bBT\b|\bTj\b|\bTJ\b|\/Font\b/.test(s), false);
});

test("every xref offset points exactly at its object", () => {
  const pdf = buildImagePdf([{ jpeg: fakeJpeg(300), pxWidth: 10, pxHeight: 14 }, { jpeg: fakeJpeg(77), pxWidth: 10, pxHeight: 14 }], opts);
  const s = text(pdf);
  const xrefAt = Number(s.match(/startxref\n(\d+)/)![1]);
  assert.equal(s.slice(xrefAt, xrefAt + 4), "xref");
  const entries = s.slice(xrefAt).split("\n").filter((l) => /^\d{10} 00000 n/.test(l));
  assert.equal(entries.length, 9); // catalog, pages, info + 3 per page × 2
  entries.forEach((line, i) => {
    const offset = Number(line.slice(0, 10));
    assert.ok(s.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1} at ${offset}`);
  });
});

test("image stream length matches the JPEG byte count", () => {
  const jpeg = fakeJpeg(123);
  const s = text(buildImagePdf([{ jpeg, pxWidth: 2, pxHeight: 2 }], opts));
  assert.ok(s.includes("/Length 123 >>"));
});

test("no pages is an error, not an empty file", () => {
  assert.throws(() => buildImagePdf([], opts));
});

test("pages may have their own sizes (uploaded PDFs keep theirs)", () => {
  const s = text(
    buildImagePdf(
      [
        { jpeg: fakeJpeg(10), pxWidth: 4, pxHeight: 4 },
        { jpeg: fakeJpeg(10), pxWidth: 4, pxHeight: 4, ptWidth: 300, ptHeight: 400 },
      ],
      opts
    )
  );
  assert.ok(s.includes("/MediaBox [0 0 595 842]"));
  assert.ok(s.includes("/MediaBox [0 0 300 400]"));
  assert.ok(s.includes("q 300 0 0 400 0 0 cm"));
});
