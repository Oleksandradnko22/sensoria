// Content lifecycle rules of Sensoria (see docs/content-lifecycle.md):
//  * a guide / meditation / program is NEVER deleted by its author: only edited, archived and restored;
//  * it can be archived no earlier than 14 days after its last completed purchase (the buyer's refund window), so
//    nothing a person may still ask their money back for disappears from the catalog under them.
// The same rule is enforced in the database (supabase/content-archive-rules-migration.sql); this file lets the
// cabinet explain it instead of only failing.

// Only a draft that was never published and has no participants can be deleted (permanently).
export function canDeleteDraft(item: { status: string; everPublished?: boolean; participants?: number }): boolean {
  return item.status === "draft" && item.everPublished === false && !(item.participants && item.participants > 0);
}

export const ARCHIVE_COOLDOWN_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

// The moment archiving becomes possible, or null when it is possible now (no purchases, or 14+ days since the last).
export function archiveBlockedUntil(lastPurchaseIso: string | undefined | null, now: Date = new Date()): Date | null {
  if (!lastPurchaseIso) return null;
  const last = new Date(lastPurchaseIso).getTime();
  if (!Number.isFinite(last)) return null;
  const until = last + ARCHIVE_COOLDOWN_DAYS * DAY_MS;
  return until > now.getTime() ? new Date(until) : null;
}

const MONTHS = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];

export function formatDayMonth(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// For tooltips: "Архівувати можна з 18 листопада"
export function archiveBlockedLabel(until: Date): string {
  return `Архівувати можна з ${formatDayMonth(until)}`;
}
