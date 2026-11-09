// A lesson checklist is stored as a plain string list (no schema change). Its optional title is
// the first entry, marked with "# ". Real items never start with that marker.
const MARK = "# ";

export const CHECKLIST_TITLE_MAX = 40;
export const CHECKLIST_ITEM_MIN = 3;
export const CHECKLIST_ITEM_MAX = 80;
export const CHECKLIST_ITEMS_MIN = 2;
export const CHECKLIST_ITEMS_MAX = 10;

// null when the checklist is fine, otherwise the reason.
export function checklistProblem(list: string[] | undefined): string | null {
  const items = checklistItems(list);
  if (items.length < CHECKLIST_ITEMS_MIN) return `додайте щонайменше ${CHECKLIST_ITEMS_MIN} пункти чек-листа.`;
  if (items.length > CHECKLIST_ITEMS_MAX) return `у чек-листі не більше ${CHECKLIST_ITEMS_MAX} пунктів.`;
  if (items.some((x) => x.length < CHECKLIST_ITEM_MIN)) return `кожен пункт чек-листа має містити щонайменше ${CHECKLIST_ITEM_MIN} символи.`;
  if (items.some((x) => x.length > CHECKLIST_ITEM_MAX)) return `пункт чек-листа не довший за ${CHECKLIST_ITEM_MAX} символів.`;
  if (splitChecklist(list).title.trim().length > CHECKLIST_TITLE_MAX) return `назва чек-листа не довша за ${CHECKLIST_TITLE_MAX} символів.`;
  return null;
}

export function splitChecklist(list: string[] | undefined): { title: string; items: string[] } {
  const all = list ?? [];
  if (all.length > 0 && all[0].startsWith(MARK)) {
    return { title: all[0].slice(MARK.length), items: all.slice(1) };
  }
  return { title: "", items: all };
}

export function joinChecklist(title: string, items: string[]): string[] | undefined {
  const clean = items.filter((x) => x.trim() !== "");
  if (!title.trim() && clean.length === 0) return undefined;
  return title.trim() ? [`${MARK}${title}`, ...items] : items;
}

// Items that count as real (for validation and checking off).
export function checklistItems(list: string[] | undefined): string[] {
  return splitChecklist(list).items.map((x) => x.trim()).filter(Boolean);
}
