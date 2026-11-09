// Pure view helpers for the public author profile (no supabase imports).

export type RatingSummary = {
  average: number;
  count: number;
  // index 0 = 5 stars … index 4 = 1 star
  distribution: number[];
};

export function summarizeRatings(ratings: number[]): RatingSummary {
  const valid = ratings.filter((r) => Number.isFinite(r) && r >= 1 && r <= 5);
  const distribution = [0, 0, 0, 0, 0];
  valid.forEach((r) => {
    distribution[5 - Math.round(r)] += 1;
  });
  const count = valid.length;
  const average = count ? valid.reduce((a, b) => a + b, 0) / count : 0;
  return { average, count, distribution };
}

// Rows of the distribution panel, 5★ first. `percent` is the share of ALL counted
// reviews (0 when there are none), so an empty dataset never draws a bar.
export type RatingRow = { stars: number; count: number; percent: number };
export function ratingRows(summary: RatingSummary): RatingRow[] {
  return summary.distribution.map((count, i) => ({
    stars: 5 - i,
    count,
    percent: summary.count ? Math.round((count / summary.count) * 100) : 0,
  }));
}

// «Усі / 5★ / 4★…» filter and the order of the list.
export type ReviewSort = "new" | "high" | "low";
export const filterReviews = <T extends { rating: number }>(list: T[], stars: number | null): T[] =>
  stars === null ? list : list.filter((r) => Math.round(r.rating) === stars);
export function sortReviews<T extends { rating: number; createdAt: string }>(list: T[], mode: ReviewSort): T[] {
  const byDate = (a: T, b: T) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);
  return [...list].sort((a, b) => (mode === "high" ? b.rating - a.rating || byDate(a, b) : mode === "low" ? a.rating - b.rating || byDate(a, b) : byDate(a, b)));
}

// "4,5" — Ukrainian decimal comma, one digit.
export const formatRating = (value: number): string => value.toFixed(1).replace(".", ",");

// Reviewers are other participants — show "Олена К." rather than a full name.
export function shortName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Учасник Sensoria";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

const MONTHS = [
  "січня", "лютого", "березня", "квітня", "травня", "червня",
  "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
];

export function formatMonthYear(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const nominative = [
    "січень", "лютий", "березень", "квітень", "травень", "червень",
    "липень", "серпень", "вересень", "жовтень", "листопад", "грудень",
  ];
  return `${nominative[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatReviewDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Feed dates: recent posts read relatively ("3 дні тому"), older ones in full.
export function formatPostDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days < 0) return formatReviewDate(iso);
  if (days === 0) return "Сьогодні";
  if (days === 1) return "Вчора";
  if (days < 7) return `${days} ${days < 5 ? "дні" : "днів"} тому`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w} ${w === 1 ? "тиждень" : "тижні"} тому`;
  }
  return formatReviewDate(iso);
}

export type AuthorContentKind = "program" | "guide" | "meditation";

export const AUTHOR_KIND_LABEL: Record<AuthorContentKind, string> = {
  program: "Програми",
  guide: "Гайди",
  meditation: "Медитації",
};

export type AuthorContentItem = {
  id: string;
  kind: AuthorContentKind;
  title: string;
  description: string;
  // "4 хв" / "8 сторінок" / "4 модулі" — only what the canonical content really has.
  detail?: string;
  // Canonical price input (see utils/price.ts: formatPrice / isFreePrice).
  // undefined/null = unknown → "Ціна не вказана".
  price?: number | string | null;
  // Real cover of the material (programs: content.cover_url). Guides and
  // meditations have none yet → the card draws a deterministic fallback.
  coverUrl?: string | null;
  coverFocus?: import("./coverFocus.ts").CoverFocus;
  // Structure facts used by the fallback visual (never invented).
  moduleCount?: number;
  pageCount?: number;
};

// Groups in a fixed order and drops empty groups; same id never twice
// (a catalog guide can also exist as a content row).
export function groupAuthorContent(items: AuthorContentItem[]) {
  const seen = new Set<string>();
  const unique = items.filter((i) => (seen.has(`${i.kind}:${i.id}`) ? false : (seen.add(`${i.kind}:${i.id}`), true)));
  return (["program", "guide", "meditation"] as AuthorContentKind[])
    .map((kind) => ({ kind, label: AUTHOR_KIND_LABEL[kind], items: unique.filter((i) => i.kind === kind) }))
    .filter((g) => g.items.length > 0);
}

// "серпня 2026" — genitive month, for "з серпня 2026".
export function formatSinceMonth(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// 1248 → "1 248" (non-breaking spaces, so a number never splits across lines).
export function formatCount(n: number): string {
  const v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}
