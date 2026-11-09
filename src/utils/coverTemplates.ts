// Pure parts of the built-in cover maker: size, templates, a palette per program category and the title layout.
// Drawing itself is in components/author/coverDraw.ts.
export const COVER_W = 1200;
export const COVER_H = 675;

// A cover is cropped to many shapes around its centre (3:1 card, 1:1 thumbnail, ...), so the title always lives in
// this centred safe zone: it stays whole in every frame.
export const COVER_SAFE = { w: 560, h: 300 } as const;

export type CoverTemplateId = "waves" | "orbits" | "blobs" | "bands";

export const COVER_TEMPLATES: { id: CoverTemplateId; label: string }[] = [
  { id: "waves", label: "Хвилі" },
  { id: "orbits", label: "Орбіти" },
  { id: "blobs", label: "Плями" },
  { id: "bands", label: "Смуги" },
];

// Two colours per category (data/categoryLabels.ts); both are dark enough for white text.
export const CATEGORY_PALETTES: Record<string, readonly [string, string]> = {
  anxiety: ["#2f4fd8", "#7b5cf0"],
  stress: ["#c2410c", "#7c3aed"],
  burnout: ["#b4232a", "#7c3a9e"],
  selfEsteem: ["#be185d", "#7c3aed"],
  relationships: ["#9d174d", "#3b5bdb"],
  motivation: ["#0f766e", "#2563eb"],
  emotionalBalance: ["#0e7490", "#6d28d9"],
  innerPressure: ["#334155", "#6d4cf5"],
  healthyBalance: ["#15803d", "#0e7490"],
  awareness: ["#0369a1", "#8b5cf6"],
  recovery: ["#047857", "#3b82f6"],
};

// Ready-made backgrounds for one click: a gradient and a decoration. Every colour is dark enough for the white title.
export const READY_BACKGROUNDS: { id: string; label: string; palette: readonly [string, string]; deco: CoverTemplateId | "none" }[] = [
  { id: "night", label: "Нічне небо", palette: ["#1e1b4b", "#4338ca"], deco: "orbits" },
  { id: "sea", label: "Глибоке море", palette: ["#0c4a6e", "#0e7490"], deco: "waves" },
  { id: "forest", label: "Ліс", palette: ["#14532d", "#0f766e"], deco: "blobs" },
  { id: "lavender", label: "Лаванда", palette: ["#4c1d95", "#7c3aed"], deco: "bands" },
  { id: "sunset", label: "Захід сонця", palette: ["#9a3412", "#9d174d"], deco: "blobs" },
  { id: "slate", label: "Сланець", palette: ["#1e293b", "#475569"], deco: "none" },
  { id: "moss", label: "Мох і небо", palette: ["#065f46", "#1d4ed8"], deco: "waves" },
  { id: "plum", label: "Слива", palette: ["#581c87", "#be185d"], deco: "orbits" },
];

export const DEFAULT_PALETTE = CATEGORY_PALETTES.anxiety;

export function paletteFor(categoryId: string | null | undefined): readonly [string, string] {
  return (categoryId && CATEGORY_PALETTES[categoryId]) || DEFAULT_PALETTE;
}

export type Measure = (text: string) => number;

// Word wrap by pixel width; a single word wider than the line is broken by characters.
export function wrapLines(text: string, maxWidth: number, measure: Measure): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const push = () => { if (line) lines.push(line); line = ""; };
  for (const word of words) {
    let w = word;
    while (measure(w) > maxWidth && [...w].length > 1) {
      let cut = [...w];
      while (cut.length > 1 && measure(cut.join("")) > maxWidth) cut = cut.slice(0, -1);
      push();
      lines.push(cut.join(""));
      w = w.slice(cut.join("").length);
    }
    const next = line ? `${line} ${w}` : w;
    if (line && measure(next) > maxWidth) { push(); line = w; } else line = next;
  }
  push();
  return lines;
}

// Biggest font size (84 down to 40) whose wrapped title fits the box in at most 3 lines.
export function fitTitle(text: string, maxWidth: number, maxHeight: number, measureAt: (size: number) => Measure): { size: number; lines: string[] } {
  for (let size = 84; size >= 40; size -= 4) {
    const lines = wrapLines(text, maxWidth, measureAt(size));
    if (lines.length <= 3 && lines.length * size * 1.15 <= maxHeight) return { size, lines };
  }
  const lines = wrapLines(text, maxWidth, measureAt(40)).slice(0, 3);
  if (lines.length === 3) lines[2] = `${lines[2].replace(/[\s.,;:!?…-]+$/, "")}…`;
  return { size: 40, lines };
}
