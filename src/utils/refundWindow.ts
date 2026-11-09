// A refund can only be requested within a fixed window after purchase
// — Sasha's rule: 14 days, same number as the review-edit window
// (reviewEditWindow.ts), but kept as its own file/constant since the
// two are conceptually unrelated and either could change independently
// later.

export const REFUND_WINDOW_DAYS = 14;

export function isWithinRefundWindow(purchasedAtIso: string, now: Date = new Date()): boolean {
  const purchased = new Date(purchasedAtIso).getTime();
  if (Number.isNaN(purchased)) return false;
  const ageMs = now.getTime() - purchased;
  const windowMs = REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  // A future-dated purchase (clock skew) hasn't exceeded the window
  // either way — only a *positive* age past the window blocks a refund.
  return ageMs <= windowMs;
}
