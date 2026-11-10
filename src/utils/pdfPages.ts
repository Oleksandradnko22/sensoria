// Page count of a PDF read straight from its bytes (no library).
// Newer PDFs keep the page objects inside compressed "object streams", so those are unpacked first.
// If nothing can be read, null is returned and the author types the number.
const latin1 = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

function countInText(text: string): number {
  const objects = (text.match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length;
  let root = 0;
  for (const m of text.matchAll(/<<[^<>]*?\/Type\s*\/Pages[^<>]*?>>/g)) {
    const c = /\/Count\s+(\d+)/.exec(m[0]);
    if (c) root = Math.max(root, Number(c[1]));
  }
  return Math.max(objects, root);
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const w = ds.writable.getWriter();
  void w.write(new Uint8Array(data)).catch(() => {});
  void w.close().catch(() => {});
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

export async function countPdfPages(bytes: Uint8Array): Promise<number | null> {
  const text = latin1(bytes);
  let n = countInText(text);
  if (n === 0 && typeof DecompressionStream !== "undefined") {
    const re = /(?<!end)stream\r?\n/g;
    let m: RegExpExecArray | null;
    let unpacked = "";
    while ((m = re.exec(text))) {
      const head = text.slice(Math.max(0, m.index - 400), m.index);
      if (!/\/ObjStm/.test(head.slice(head.lastIndexOf("obj") >= 0 ? head.lastIndexOf("obj") : 0))) continue;
      const start = m.index + m[0].length;
      const end = text.indexOf("endstream", start);
      if (end < 0) continue;
      // the line break before "endstream" is not part of the data; try without it first
      let stop = end;
      while (stop > start && (bytes[stop - 1] === 10 || bytes[stop - 1] === 13) && end - stop < 2) stop--;
      for (const to of stop === end ? [end] : [stop, end]) {
        try {
          unpacked += latin1(await inflate(bytes.subarray(start, to))) + "\n";
          break;
        } catch {
          /* try the next cut; a stream that cannot be unpacked is skipped */
        }
      }
    }
    n = countInText(unpacked);
  }
  return n > 0 ? n : null;
}

const MAX_BYTES = 80 * 1024 * 1024;
export async function pdfPageCount(file: File): Promise<number | null> {
  if (file.size > MAX_BYTES) return null;
  try {
    return await countPdfPages(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return null;
  }
}
