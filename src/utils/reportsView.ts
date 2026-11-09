// Pure helpers for the admin "Скарги" list.
export type ReportGroup = "all" | "people" | "content" | "comments" | "authors" | "reviews";

export const REPORT_GROUP_LABELS: Record<ReportGroup, string> = {
  all: "Усі",
  people: "Люди в чаті",
  content: "Програми, гайди, медитації",
  comments: "Коментарі",
  authors: "Автори та публікації",
  reviews: "Відгуки",
};

export const TARGET_TYPE_LABELS: Record<string, string> = {
  person: "Користувач",
  program: "Програма",
  guide: "Гайд",
  meditation: "Медитація",
  comment: "Коментар",
  author: "Автор",
  post: "Публікація автора",
  review: "Відгук про автора",
};

export function groupOf(targetType: string): Exclude<ReportGroup, "all"> {
  switch (targetType) {
    case "person":
      return "people";
    case "program":
    case "guide":
    case "meditation":
      return "content";
    case "comment":
      return "comments";
    case "review":
      return "reviews";
    default:
      return "authors"; // author, post
  }
}

export function filterReports<T extends { targetType: string; status: string }>(
  rows: readonly T[],
  group: ReportGroup,
  onlyOpen: boolean
): T[] {
  return rows.filter((r) => (group === "all" || groupOf(r.targetType) === group) && (!onlyOpen || r.status === "open"));
}

export function countByGroup(rows: readonly { targetType: string; status: string }[], onlyOpen: boolean) {
  const out: Record<ReportGroup, number> = { all: 0, people: 0, content: 0, comments: 0, authors: 0, reviews: 0 };
  for (const r of rows) {
    if (onlyOpen && r.status !== "open") continue;
    out.all += 1;
    out[groupOf(r.targetType)] += 1;
  }
  return out;
}

/** Open complaints about one person from this many different reports → flag. */
export const REPEAT_REPORTS_FLAG = 3;

/** Open reports per person (by ownerId, falling back to email). */
export function openReportsByOwner(
  rows: readonly { ownerId?: string | null; ownerEmail: string | null; status: string }[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "open") continue;
    const k = r.ownerId ?? r.ownerEmail;
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReportActKind = "delete_comment" | "delete_post" | "delete_review" | "unpublish_content" | "restore_sale" | "suspend_sale";

/** Extra options for a content complaint (the admin handles sales by hand). */
export function secondaryActionsFor(r: { source: string; targetType: string; targetId?: string | null }): ReportActKind[] {
  return r.source === "content" && r.targetId && UUID.test(r.targetId) ? ["suspend_sale", "restore_sale"] : [];
}

/** The one thing an admin can do to the reported object (null = only "До користувача"). */
export function actionFor(r: { source: string; targetType: string; targetId?: string | null }): ReportActKind | null {
  if (r.source === "lesson_comment" || r.source === "post_comment") return "delete_comment";
  if (r.source === "entity" && r.targetType === "post") return "delete_post";
  if (r.source === "entity" && r.targetType === "review") return "delete_review";
  if (r.source === "content" && r.targetId && UUID.test(r.targetId)) return "unpublish_content";
  return null;
}

export const ACT_TEXT: Record<ReportActKind, { button: string; title: string; text: string }> = {
  delete_comment: { button: "Видалити коментар", title: "Видалити коментар?", text: "Коментар зникне в усіх назавжди, його не можна відновити." },
  delete_post: { button: "Видалити публікацію", title: "Видалити публікацію?", text: "Публікація разом з коментарями і вподобаннями зникне назавжди." },
  delete_review: { button: "Видалити відгук", title: "Видалити відгук?", text: "Відгук зникне, рейтинг автора перерахується. Відновити не можна." },
  unpublish_content: { button: "Зняти з продажу остаточно", title: "Остаточно зняти матеріал з продажу?", text: "Матеріал не продаватиметься новим покупцям. Ті, хто вже купив, зберігають доступ. Автор бачитиме матеріал у себе." },
  suspend_sale: { button: "Призупинити продаж", title: "Призупинити продаж матеріалу?", text: "Матеріал зникне з каталогу для нових покупців. Ті, хто вже купив, зберігають доступ. Скаргу можна розглянути пізніше." },
  restore_sale: { button: "Відновити продаж", title: "Відновити продаж матеріалу?", text: "Матеріал знову з'явиться в каталозі для нових покупців. Скаргу буде закрито." },
};
