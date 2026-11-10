import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { countPdfPages } from "./pdfPages.ts";

const bytes = (s: string) => new TextEncoder().encode(s);
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((a, b) => a + b.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };

test("counts page objects but not the Pages tree", async () => {
  const pdf = "%PDF-1.4\n1 0 obj<</Type/Pages/Count 3/Kids[2 0 R 3 0 R 4 0 R]>>endobj\n2 0 obj<</Type /Page/Parent 1 0 R>>endobj\n3 0 obj<</Type/Page/Parent 1 0 R>>endobj\n4 0 obj<</Type/Page/Parent 1 0 R>>endobj";
  assert.equal(await countPdfPages(bytes(pdf)), 3);
});
test("falls back to the Count of the Pages root", async () => {
  assert.equal(await countPdfPages(bytes("<</Type/Pages/Count 12/Kids[1 0 R]>>")), 12);
});
test("returns null when nothing can be read", async () => {
  assert.equal(await countPdfPages(bytes("not a pdf")), null);
});
test("reads pages hidden in a compressed object stream, in a big file", async () => {
  const inner = "<</Type/Pages/Count 4/Kids[3 0 R 4 0 R 5 0 R 6 0 R]>> <</Type/Page/Parent 2 0 R>> <</Type/Page/Parent 2 0 R>> <</Type/Page/Parent 2 0 R>> <</Type/Page/Parent 2 0 R>>";
  const z = deflateSync(Buffer.from(inner));
  const filler = new Uint8Array(400_000).fill(65);
  const pdf = cat(bytes("%PDF-1.5\n7 0 obj\n<</Type/XObject/Length 400000>>\nstream\n"), filler, bytes("\nendstream\nendobj\n5 0 obj\n<</Type/ObjStm/N 5/First 20/Filter/FlateDecode/Length " + z.length + ">>\nstream\n"), z, bytes("\nendstream\nendobj\n%%EOF"));
  assert.equal(await countPdfPages(pdf), 4);
});
