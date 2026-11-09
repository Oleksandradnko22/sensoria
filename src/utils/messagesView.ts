// Pure view logic for the participant "Повідомлення" page (no supabase
// imports, so it runs under the node test runner).

export type ContentKind = "program" | "guide" | "meditation";

export const CONTENT_KIND_LABEL: Record<ContentKind, string> = {
  program: "Програма",
  guide: "Гайд",
  meditation: "Медитація",
};

export type ContentRef = {
  kind: ContentKind | null;
  title: string | null;
  // The conversation points at content, but it can no longer be found
  // (deleted / unpublished). Never true for general (content-less) chats.
  unavailable: boolean;
};

// Guides and meditations live in static catalogs, programs in the
// `content` table — so a title found in a catalog wins and fixes the
// kind; otherwise a content id is a program, whose title comes from the
// DB. No title anywhere = the content is gone.
export function resolveContentRef(
  contentId: string | null,
  catalog: { guideTitle?: string; meditationTitle?: string; programTitle?: string | null }
): ContentRef {
  if (!contentId) return { kind: null, title: null, unavailable: false };
  if (catalog.guideTitle) return { kind: "guide", title: catalog.guideTitle, unavailable: false };
  if (catalog.meditationTitle) return { kind: "meditation", title: catalog.meditationTitle, unavailable: false };
  if (catalog.programTitle) return { kind: "program", title: catalog.programTitle, unavailable: false };
  return { kind: "program", title: null, unavailable: true };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s);

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// A separator is only worth showing when the day changes (or for the
// very first message). Times within one day stay on the bubbles.
export function needsDaySeparator(prevIso: string | null, currIso: string): boolean {
  if (!prevIso) return true;
  const a = new Date(prevIso);
  const b = new Date(currIso);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return false;
  return !sameDay(a, b);
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const MONTHS = [
  "січня", "лютого", "березня", "квітня", "травня", "червня",
  "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
];

export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  if (sameDay(d, now)) return "Сьогодні";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (sameDay(d, y)) return "Вчора";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? "" : ` ${d.getFullYear()}`}`;
}

// Compact list date: today → time, otherwise short date.
export function formatListDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatDayLabel(iso, now);
  return sameDay(d, now) ? formatClock(iso) : formatDayLabel(iso, now);
}

export function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Enter sends on a fine pointer (desktop); on touch it adds a new line
// and the Send button sends. Shift+Enter is always a new line, and Enter
// during IME composition is never a send.
export function shouldSendOnEnter(e: {
  key: string;
  shiftKey: boolean;
  isComposing?: boolean;
  coarsePointer: boolean;
}): boolean {
  return e.key === "Enter" && !e.shiftKey && !e.isComposing && !e.coarsePointer;
}

export const MAX_MESSAGE_LENGTH = 2000;

export function canSend(draft: string, sending: boolean): boolean {
  return !sending && draft.trim().length > 0 && draft.length <= MAX_MESSAGE_LENGTH;
}
