// Tiled diagonal watermark for the printable / PDF version of a guide
// (2026-10-06). Pure string building so it can be tested without a browser.
//
// What this is and is not: a watermark painted INTO the page, behind and
// through the text, repeated over the whole sheet and personalised with the
// reader's own account, so a leaked copy points back at whoever saved it.
// It makes casual re-sharing visible and removal laborious. It cannot make
// removal impossible — anything that can be viewed can be re-drawn, cropped
// or painted over by someone determined (or by an AI image tool). Real
// protection needs server-side stamping of the PDF file itself.

export function watermarkLabel(viewer: { name?: string; email?: string } | null | undefined): string {
  const who = viewer?.email?.trim() || viewer?.name?.trim();
  return who ? `SENSORIA · ${who}` : "SENSORIA";
}

// ---------------------------------------------------------------------------
// Deterministic jitter for the baked-in (canvas) watermark of the downloaded
// PDF: the same reader always gets the same layout, but every reader's tiles
// sit slightly differently and the small hidden-in-plain-sight marks fall in
// different places on every page — so no two copies can be cleaned with the
// same mask.
// ---------------------------------------------------------------------------

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Small seeded PRNG (mulberry32) → numbers in [0, 1).
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// `count` positions for small marks on one page, kept clear of the very edge.
export function markPositions(
  seedText: string,
  pageIndex: number,
  count: number,
  width: number,
  height: number
): { x: number; y: number }[] {
  const rand = seededRandom(hashString(`${seedText}#${pageIndex}`));
  return Array.from({ length: count }, () => ({
    x: 24 + rand() * (width - 48),
    y: 24 + rand() * (height - 48),
  }));
}

// A short, stable code for the reader, printed in small marks. Not secret —
// it is a label that points back at the account.
export function shortCode(userId: string): string {
  return hashString(userId).toString(36).toUpperCase().padStart(7, "0").slice(0, 7);
}
