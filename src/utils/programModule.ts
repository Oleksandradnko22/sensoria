// Facts about a program module that must come from its REAL lessons, not from
// numbers an author types next to them (2026-10-06). `content_modules.lessons`
// and `duration_label` used to be free-typed and could disagree with the actual
// lesson list.

type ItemLike = { durationMinutes?: number | null };

// A module that has lessons counts them; only a module with no lesson rows
// yet (legacy one-video modules) falls back to the stored number.
export function effectiveLessonCount(module: { lessons: number; items?: unknown[] }): number {
  const n = module.items?.length ?? 0;
  return n > 0 ? n : Math.max(0, module.lessons || 0);
}

// "40 хв", "1 год 10 хв", "2 год". Null when there is nothing to show.
export function formatMinutes(total: number): string | null {
  const m = Math.round(total);
  if (!(m > 0)) return null;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} хв`;
  return rest === 0 ? `${h} год` : `${h} год ${rest} хв`;
}

// Total of the lessons' durations, only when EVERY lesson has one (a partial
// sum would understate the module).
export function derivedDurationLabel(items: ItemLike[] | undefined): string | null {
  if (!items || items.length === 0) return null;
  if (items.some((i) => !(i.durationMinutes && i.durationMinutes > 0))) return null;
  return formatMinutes(items.reduce((s, i) => s + (i.durationMinutes ?? 0), 0));
}

// What to store as the module's duration label: the author's own text wins
// when they wrote one; otherwise the derived total, else empty.
export function moduleDurationLabel(module: { duration?: string; items?: ItemLike[] }): string {
  const own = module.duration?.trim();
  return own || derivedDurationLabel(module.items) || "";
}

// Upper bounds that keep the editor, saving and the lesson player fast and reliable.
export const MAX_MODULES = 10;
export const MAX_LESSONS_PER_MODULE = 10;
export const MAX_LESSONS_TOTAL = 100;

export function lessonLimitReached(modules: { items?: unknown[] }[], moduleIndex: number): boolean {
  const here = modules[moduleIndex]?.items?.length ?? 0;
  const total = modules.reduce((n, m) => n + (m.items?.length ?? 0), 0);
  return here >= MAX_LESSONS_PER_MODULE || total >= MAX_LESSONS_TOTAL;
}
