// Vector "psychology" elements for covers: simple line icons in a 24×24 box, drawn by the editor (never by an image
// model), so they are crisp, in one style, free of copyright questions, and every one stays editable (colour, size, line).
export type StickerDef = { id: string; label: string; d: string; fits: string[] };

// `fits` = program categories (data/categoryLabels.ts) the element suits; the AI picks from this list by meaning.
export const STICKERS: StickerDef[] = [
  { id: "leaf", label: "Листок", d: "M5 19C5 10 10 5 19 5c0 9-5 14-14 14Z M5 19l8-8", fits: ["healthyBalance", "recovery", "awareness", "emotionalBalance"] },
  { id: "sprout", label: "Паросток", d: "M12 21V11 M12 11C12 7 9 5 5 5c0 4 3 6 7 6 M12 13c0-3 2.5-5 6-5 0 3.5-2.5 5-6 5", fits: ["recovery", "motivation", "burnout", "selfEsteem"] },
  { id: "sun", label: "Сонце", d: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1", fits: ["motivation", "burnout", "awareness", "selfEsteem"] },
  { id: "moon", label: "Місяць", d: "M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z", fits: ["anxiety", "stress", "recovery", "innerPressure"] },
  { id: "cloud", label: "Хмара", d: "M7 18a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 9.5a4.2 4.2 0 0 1 .5 8.5H7Z", fits: ["anxiety", "stress", "innerPressure"] },
  { id: "drop", label: "Крапля", d: "M12 3c3.5 4.2 6 7.2 6 10.5a6 6 0 0 1-12 0C6 10.2 8.5 7.2 12 3Z", fits: ["emotionalBalance", "recovery", "stress"] },
  { id: "wave", label: "Хвилі", d: "M2 9c2.5-3 5-3 7.5 0s5 3 7.5 0 3-2 5-1 M2 15c2.5-3 5-3 7.5 0s5 3 7.5 0 3-2 5-1", fits: ["anxiety", "stress", "emotionalBalance", "healthyBalance"] },
  { id: "heart", label: "Серце", d: "M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20Z", fits: ["selfEsteem", "relationships", "emotionalBalance"] },
  { id: "lotus", label: "Лотос", d: "M12 20c-3-1.5-5.5-4.5-5.5-8.5C9 12 11 14 12 16c1-2 3-4 5.5-4.5 0 4-2.5 7-5.5 8.5Z M12 16C10 12 10 8 12 4c2 4 2 8 0 12Z", fits: ["awareness", "anxiety", "emotionalBalance", "recovery"] },
  { id: "brain", label: "Мозок", d: "M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 .5V5a2.5 2.5 0 0 0-3-.5Z M15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 .5V5a2.5 2.5 0 0 1 3-.5Z", fits: ["anxiety", "stress", "innerPressure", "awareness", "burnout"] },
  { id: "butterfly", label: "Метелик", d: "M12 7v11 M12 10C10 4 5 4 4 7s2 6 8 3 M12 10c2-6 7-6 8-3s-2 6-8 3 M12 13c-4-.5-7 1-7 4s4 3 7-1 M12 13c4-.5 7 1 7 4s-4 3-7-1", fits: ["recovery", "selfEsteem", "motivation", "awareness"] },
  { id: "tree", label: "Дерево", d: "M12 21v-6 M12 15c-4 0-6-2.5-6-5.5S8 4 12 3c4 1 6 3.5 6 6.5s-2 5.5-6 5.5Z", fits: ["healthyBalance", "recovery", "relationships", "emotionalBalance"] },
  { id: "mountain", label: "Гори", d: "M2 19l6.5-11 4 6.5 2.5-4L22 19Z", fits: ["motivation", "innerPressure", "burnout", "selfEsteem"] },
  { id: "spiral", label: "Спіраль", d: "M12 12a1.5 1.5 0 0 1 1.5-1.5 3 3 0 0 1 3 3 4.5 4.5 0 0 1-4.5 4.5 6 6 0 0 1-6-6 7.5 7.5 0 0 1 7.5-7.5 9 9 0 0 1 9 9", fits: ["anxiety", "awareness", "innerPressure", "stress"] },
  { id: "spark", label: "Іскра", d: "M12 3l2 6 6 3-6 3-2 6-2-6-6-3 6-3Z", fits: ["motivation", "selfEsteem", "awareness"] },
  { id: "feather", label: "Пір'їна", d: "M20 4c-8 0-14 5-14 12v4 M20 4c0 7-5 12-12 12 M6 20l8-8", fits: ["anxiety", "stress", "emotionalBalance", "healthyBalance"] },
  { id: "anchor", label: "Якір", d: "M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M12 7v14 M5 14c0 3.5 3 7 7 7s7-3.5 7-7 M3.5 14H8 M16 14h4.5", fits: ["anxiety", "innerPressure", "emotionalBalance", "stress"] },
  { id: "infinity", label: "Нескінченність", d: "M12 12c-2-3-3.5-4-5.5-4a4 4 0 0 0 0 8c2 0 3.5-1 5.5-4 2 3 3.5 4 5.5 4a4 4 0 0 0 0-8c-2 0-3.5 1-5.5 4Z", fits: ["healthyBalance", "emotionalBalance", "relationships"] },
  { id: "bubble", label: "Діалог", d: "M4 5h16v11H11l-5 4v-4H4Z", fits: ["relationships", "selfEsteem"] },
  { id: "rings", label: "Кола", d: "M9 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z M15 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z", fits: ["relationships", "emotionalBalance", "healthyBalance"] },
  { id: "shield", label: "Щит", d: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6Z", fits: ["anxiety", "stress", "innerPressure", "burnout"] },
  { id: "compass", label: "Компас", d: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M15.5 8.5l-2 5-5 2 2-5Z", fits: ["motivation", "awareness", "selfEsteem"] },
  { id: "mandala", label: "Мандала", d: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z", fits: ["awareness", "anxiety", "emotionalBalance"] },
];

// The palette shown in the editor: at most `max` elements, taken in turns from each chosen category (the primary one
// first), so every category is represented.
export function themedStickers(categoryIds: readonly string[] | null | undefined, max = 8): StickerDef[] {
  const ids = (categoryIds ?? []).filter(Boolean);
  if (ids.length === 0) return STICKERS.slice(0, max);
  const lists = ids.map((cat) => STICKERS.filter((s) => s.fits.includes(cat)));
  const seen = new Set<string>();
  const out: StickerDef[] = [];
  for (let i = 0; out.length < max && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const st = l[i];
      if (st && !seen.has(st.id) && out.length < max) { seen.add(st.id); out.push(st); }
    }
  }
  return out.length ? out : STICKERS.slice(0, max);
}

// Open line drawings have no inside to fill; the "light fill" option is offered only for the others.
const OPEN_LINES = new Set(["sprout", "wave", "spiral", "feather", "butterfly", "anchor"]);
export const canFill = (id: string): boolean => !OPEN_LINES.has(id);

export const STICKER_IDS = STICKERS.map((s) => s.id);
export const stickerDef = (id: string): StickerDef | undefined => STICKERS.find((s) => s.id === id);

// Default elements for a category when nothing else is known.
export function stickersForCategory(categoryId: string | null | undefined, count = 3): string[] {
  const own = STICKERS.filter((s) => categoryId && s.fits.includes(categoryId)).map((s) => s.id);
  const rest = STICKER_IDS.filter((id) => !own.includes(id));
  return [...own, ...rest].slice(0, count);
}

// Elements offered for a program: only those that suit its chosen categories (the primary one first). Every category
// has several, so the list is never empty; with no category at all the whole library is shown.
export function stickersForCategories(categoryIds: readonly string[] | null | undefined): StickerDef[] {
  const ids = (categoryIds ?? []).filter(Boolean);
  if (ids.length === 0) return STICKERS;
  const seen = new Set<string>();
  const out: StickerDef[] = [];
  for (const cat of ids) for (const st of STICKERS) if (st.fits.includes(cat) && !seen.has(st.id)) { seen.add(st.id); out.push(st); }
  return out.length ? out : STICKERS;
}
