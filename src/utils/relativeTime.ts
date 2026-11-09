// Human-friendly relative timestamps for message lists ("10 хв тому",
// "Вчора", "12 серпня") — replaces raw ISO/date-only strings that used
// to sit unformatted in AuthorMessages/ParticipantMessages. `now` is a
// parameter (not always `new Date()`) purely so this stays a pure,
// testable function instead of one whose output depends on when the
// test happens to run.

const MONTHS_GENITIVE = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня",
];

// Always includes the year, unlike formatRelativeTime's "12 серпня"
// (which omits it for the current year) — for places like the reviews
// list that Sasha specifically wants an absolute date, not a relative
// one, so it can't be ambiguous about which year.
export function formatAbsoluteDate(isoString: string): string {
  const date = new Date(isoString);
  return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]} ${date.getFullYear()}`;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatRelativeTime(isoString: string, now: Date = new Date()): string {
  const date = new Date(isoString);
  const diffMs = now.getTime() - date.getTime();

  // A message that hasn't "happened" yet from `now`'s perspective (clock
  // skew, or a caller passing a stale `now`) — treat as "just now"
  // rather than showing a nonsensical negative duration.
  if (diffMs < 60_000) return "щойно";
  if (diffMs < 3_600_000) {
    const minutes = Math.floor(diffMs / 60_000);
    return `${minutes} хв тому`;
  }

  if (isSameCalendarDay(date, now)) {
    const hours = Math.floor(diffMs / 3_600_000);
    return `${hours} год тому`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameCalendarDay(date, yesterday)) return "Вчора";

  const day = date.getDate();
  const month = MONTHS_GENITIVE[date.getMonth()];
  const suffix = date.getFullYear() === now.getFullYear() ? "" : ` ${date.getFullYear()}`;
  return `${day} ${month}${suffix}`;
}
