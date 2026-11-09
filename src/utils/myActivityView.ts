// Pure helpers for «Мої скарги» and «Мої відгуки»: filters + counts that
// always match the rows shown. Only real statuses are used: a report is
// "open" or "reviewed"; a review has no moderation lifecycle (it is live
// as soon as it is saved), so reviews are filtered by what they are about.

export type ReportStatus = "open" | "reviewed";
export type ReportFilter = "all" | ReportStatus;

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  open: "На розгляді",
  reviewed: "Розглянуто",
};

export function filterReports<T extends { status: ReportStatus }>(items: T[], f: ReportFilter): T[] {
  return f === "all" ? items : items.filter((i) => i.status === f);
}

export function reportCounts(items: { status: ReportStatus }[]): Record<ReportFilter, number> {
  return {
    all: items.length,
    open: items.filter((i) => i.status === "open").length,
    reviewed: items.filter((i) => i.status === "reviewed").length,
  };
}

export type ReviewFilter = "all" | "program" | "guide" | "meditation" | "author";

export const REVIEW_FILTER_LABEL: Record<ReviewFilter, string> = {
  all: "Усі",
  program: "Програми",
  guide: "Гайди",
  meditation: "Медитації",
  author: "Автори",
};

type ReviewLike = { kind: "content" | "author"; contentKind: "program" | "guide" | "meditation" | null };

export function reviewBucket(r: ReviewLike): Exclude<ReviewFilter, "all"> | null {
  return r.kind === "author" ? "author" : r.contentKind;
}

export function filterReviews<T extends ReviewLike>(items: T[], f: ReviewFilter): T[] {
  return f === "all" ? items : items.filter((i) => reviewBucket(i) === f);
}

export function reviewCounts(items: ReviewLike[]): Record<ReviewFilter, number> {
  const c: Record<ReviewFilter, number> = { all: items.length, program: 0, guide: 0, meditation: 0, author: 0 };
  for (const i of items) {
    const b = reviewBucket(i);
    if (b) c[b]++;
  }
  return c;
}

// newest first, deterministic (ties broken by id)
export function sortNewest<T extends { id: string }>(items: T[], dateOf: (t: T) => string): T[] {
  return [...items].sort((a, b) => {
    const d = new Date(dateOf(b)).getTime() - new Date(dateOf(a)).getTime();
    return d || (a.id < b.id ? -1 : 1);
  });
}
