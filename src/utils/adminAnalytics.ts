// Pure logic behind the admin "Аналітика платформи" page — period
// options, time bucketing, comparison and distribution maths. No
// React / Supabase here so it can be unit-tested (node --test).

export type PeriodDays = 7 | 30 | 90 | 0; // 0 = весь час

export const PERIOD_OPTIONS: { days: PeriodDays; label: string; short: string }[] = [
  { days: 7, label: "Останні 7 днів", short: "7 днів" },
  { days: 30, label: "Останні 30 днів", short: "30 днів" },
  { days: 90, label: "Останні 90 днів", short: "90 днів" },
  { days: 0, label: "Увесь час", short: "весь час" },
];

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_BUCKETS = 30;

export type Bucket = { start: number; end: number; count: number };

/**
 * Splits [from, to] into equal rolling buckets and counts timestamps in
 * each. Boundaries match the server's rolling window (from = now-days),
 * so bucket totals add up to the period counters. Half-open [start, end),
 * the last bucket also includes `to`. Invalid/out-of-range timestamps
 * are ignored.
 */
export function bucketSeries(
  timestamps: readonly string[],
  fromMs: number,
  toMs: number,
  bucketCount: number
): Bucket[] {
  const n = Math.max(1, Math.floor(bucketCount));
  const span = Math.max(1, toMs - fromMs);
  const size = span / n;
  const buckets: Bucket[] = Array.from({ length: n }, (_, i) => ({
    start: fromMs + i * size,
    end: fromMs + (i + 1) * size,
    count: 0,
  }));
  for (const ts of timestamps) {
    const t = Date.parse(ts);
    if (!Number.isFinite(t) || t < fromMs || t > toMs) continue;
    const idx = Math.min(n - 1, Math.floor((t - fromMs) / size));
    buckets[idx].count += 1;
  }
  return buckets;
}

/** Number of buckets for a period: daily up to 30 days, then ~30 coarser buckets. */
export function bucketCountFor(days: PeriodDays): number {
  if (days === 0) return MAX_BUCKETS;
  return Math.min(days, MAX_BUCKETS);
}

/**
 * Start of the chart window. For a fixed period it's now-days; for
 * "весь час" it's the earliest known timestamp (or 30 days back when
 * there's no data at all, so the axis is still sane).
 */
export function chartFrom(days: PeriodDays, nowMs: number, allTimestamps: readonly string[]): number {
  if (days > 0) return nowMs - days * DAY_MS;
  let min = Infinity;
  for (const ts of allTimestamps) {
    const t = Date.parse(ts);
    if (Number.isFinite(t) && t < min) min = t;
  }
  return Number.isFinite(min) ? Math.min(min, nowMs - DAY_MS) : nowMs - 30 * DAY_MS;
}

/**
 * Change vs the previous equal period, in whole percent. `null` when
 * there's nothing honest to say: no comparison data, or previous = 0
 * (division by zero / "infinite growth" is not a useful number).
 */
export function deltaPercent(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export type DistributionRow<K extends string> = { key: K; count: number; percent: number };

/** Counts → rows with percentages. Zero total → all percents 0 (no NaN). */
export function distribution<K extends string>(
  counts: Record<K, number>,
  order: readonly K[]
): { total: number; rows: DistributionRow<K>[] } {
  const total = order.reduce((s, k) => s + (counts[k] ?? 0), 0);
  const rows = order.map((key) => {
    const count = counts[key] ?? 0;
    return { key, count, percent: total > 0 ? Math.round((count / total) * 100) : 0 };
  });
  return { total, rows };
}

/** "olena.k@gmail.com" → "ol…@gmail.com" (admin list needs recognisable, not full, addresses). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return email ? "—" : "—";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local.slice(0, Math.min(2, local.length))}…${domain}`;
}
