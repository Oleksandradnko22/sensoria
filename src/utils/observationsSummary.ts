// Counts personal records (notes + mood check-ins) for the overview preview.
// `recent` = records in the last 7 days, `total` = all records.
// `lastAt` = the newest record's real timestamp (null when there are none).
export type ObservationsSummary = { recent: number; total: number; lastAt: string | null };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function summarizeObservations(timestamps: string[], now: number = Date.now()): ObservationsSummary {
  const since = now - WEEK_MS;
  const recent = timestamps.filter((iso) => new Date(iso).getTime() >= since).length;
  let lastAt: string | null = null;
  let lastMs = -Infinity;
  for (const iso of timestamps) {
    const t = new Date(iso).getTime();
    if (Number.isFinite(t) && t > lastMs) {
      lastMs = t;
      lastAt = iso;
    }
  }
  return { recent, total: timestamps.length, lastAt };
}
