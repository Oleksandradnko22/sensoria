// Presentation-only helpers for "Ваші спостереження": grouping by month, the
// overview series and the few insights that can be stated safely. Everything
// is derived from the real records passed in; nothing is estimated.
import type { StateChange, StateChangeSource } from "./stateChanges.ts";

const MONTHS = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

export type MonthGroup<T> = { key: string; label: string; items: T[] };

// Keeps the incoming order (callers pass newest-first); a new group starts
// whenever the month changes. Unparseable dates go to one trailing group.
export function groupByMonth<T>(items: T[], getIso: (item: T) => string): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = [];
  for (const item of items) {
    const d = new Date(getIso(item));
    const valid = Number.isFinite(d.getTime());
    const key = valid ? `${d.getFullYear()}-${d.getMonth()}` : "unknown";
    const label = valid ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "Без дати";
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label, items: [item] });
  }
  return groups;
}

export type ChartPoint = { key: string; at: string; before: number; after: number };
export type ChartSeries = {
  source: StateChangeSource;
  measure: string;
  scale: number;
  min: number;
  points: ChartPoint[]; // oldest → newest
  total: number; // all complete pairs of this source on this scale
};

export const MIN_CHART_POINTS = 3;
export const MAX_CHART_POINTS = 12;

// One series per source, on that source's most common scale, only when there
// are enough complete before/after pairs to say anything. Records on another
// scale are NOT rescaled to fit — they simply stay out of the chart (they are
// still in the history below).
export function buildChartSeries(changes: StateChange[]): ChartSeries[] {
  const out: ChartSeries[] = [];
  for (const source of ["practice", "meditation"] as const) {
    const complete = changes.filter(
      (c) => c.source === source && c.beforeValue !== null && c.afterValue !== null && c.scale !== null
    );
    if (complete.length === 0) continue;
    const counts = new Map<number, number>();
    complete.forEach((c) => counts.set(c.scale!, (counts.get(c.scale!) ?? 0) + 1));
    const [scale] = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const onScale = complete.filter((c) => c.scale === scale);
    if (onScale.length < MIN_CHART_POINTS) continue;
    const min = Math.min(1, ...onScale.flatMap((c) => [c.beforeValue!, c.afterValue!]));
    const points = onScale
      .slice(0, MAX_CHART_POINTS) // newest-first input → the latest ones
      .reverse()
      .map((c) => ({ key: c.key, at: c.at, before: c.beforeValue!, after: c.afterValue! }));
    out.push({ source, measure: complete[0].measure, scale, min, points, total: onScale.length });
  }
  return out;
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

// Neutral, count-based statements only. The meaning of "higher" differs by
// scale and is not defined consistently in the data, so nothing here says
// "better", "worse", "improved" or "reduced".
export function buildInsights(changes: StateChange[]): string[] {
  const out: string[] = [];
  const nPractice = changes.filter((c) => c.source === "practice").length;
  const nMeditation = changes.filter((c) => c.source === "meditation").length;
  if (nPractice > 0 && nMeditation > 0) {
    out.push(
      `Ви залишили ${nPractice} ${plural(nPractice, "спостереження", "спостереження", "спостережень")} після практик і ${nMeditation} після медитацій.`
    );
  }
  const complete = changes.filter((c) => c.beforeValue !== null && c.afterValue !== null);
  if (complete.length >= MIN_CHART_POINTS) {
    const changed = complete.filter((c) => c.beforeValue !== c.afterValue).length;
    // Practices and meditations rate on different scales; say so when mixed.
    const mixed = new Set(complete.map((c) => `${c.source}:${c.scale}`)).size > 1;
    const note = mixed ? " Кожна оцінка — за своєю шкалою." : "";
    out.push(
      (changed === complete.length
        ? `У кожному з ${complete.length} спостережень оцінка «після» відрізнялась від оцінки «до».`
        : `У ${changed} з ${complete.length} спостережень оцінка «після» відрізнялась від оцінки «до».`) + note
    );
  }
  return out;
}
