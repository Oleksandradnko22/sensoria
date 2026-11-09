// Pure logic of the author's Content page (filter, sort, duplicate), kept apart so it can be tested without React.
import type { AuthoredContent, ContentStatus, ContentType } from "../data/authorDashboard.ts";

export type SortKey = "default" | "newest" | "oldest" | "title" | "participants" | "revenue" | "rating";

// published first, then on moderation, then taken down (was live before), plain drafts, the archive last
export const STATUS_ORDER: Record<ContentStatus, number> = { published: 0, review: 1, draft: 3, archived: 4 };
// A draft that was live before (restored from the archive): shown as «Знято з публікації».
export const isTakenDown = (item: { status: string; everPublished?: boolean }) => item.status === "draft" && item.everPublished === true;

export function statusRank(item: { status: ContentStatus; everPublished?: boolean }): number {
  return isTakenDown(item) ? 2 : STATUS_ORDER[item.status];
}

// Archiving never deletes. Restoring returns the material as a DRAFT: the author reviews it and publishes it again
// through the normal checks (agreement, validation, moderation) instead of it going live straight from the archive.
export function toggleArchive(item: AuthoredContent): AuthoredContent {
  return { ...item, status: item.status === "archived" ? "draft" : "archived" };
}

const time = (d: string) => {
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : 0;
};

export function sortContent(items: AuthoredContent[], key: SortKey): AuthoredContent[] {
  const list = [...items];
  switch (key) {
    case "default":
      return list.sort((a, b) => statusRank(a) - statusRank(b) || time(b.updatedAt) - time(a.updatedAt));
    case "newest":
      return list.sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
    case "oldest":
      return list.sort((a, b) => time(a.updatedAt) - time(b.updatedAt));
    case "title":
      return list.sort((a, b) => a.title.localeCompare(b.title, "uk"));
    case "participants":
      return list.sort((a, b) => b.participants - a.participants);
    case "revenue":
      return list.sort((a, b) => b.revenue - a.revenue);
    case "rating":
      return list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  }
}

export function filterContent(
  items: AuthoredContent[],
  f: { type: "all" | ContentType; status: "all" | ContentStatus; search: string },
): AuthoredContent[] {
  const q = f.search.trim().toLowerCase();
  return items.filter((item) => {
    if (f.type !== "all" && item.type !== f.type) return false;
    if (f.status !== "all" && item.status !== f.status) return false;
    if (q && !item.title.toLowerCase().includes(q)) return false;
    return true;
  });
}
