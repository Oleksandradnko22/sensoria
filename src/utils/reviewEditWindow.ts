// Reviews (both per-content and author-level) can only be edited within
// a fixed window after posting — old feedback should stay as the honest
// record it was at the time, not get quietly rewritten months later.
// Deleting stays unrestricted (see ParticipantReviews.tsx); this only
// gates the "Редагувати" action.

export const REVIEW_EDIT_WINDOW_DAYS = 14;

export function isReviewEditable(dateIso: string, now: Date = new Date()): boolean {
  const created = new Date(dateIso).getTime();
  if (Number.isNaN(created)) return false;
  const ageMs = now.getTime() - created;
  const windowMs = REVIEW_EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  // A future-dated review (clock skew) hasn't exceeded the window either
  // way — only a *positive* age past the window blocks editing.
  return ageMs <= windowMs;
}
