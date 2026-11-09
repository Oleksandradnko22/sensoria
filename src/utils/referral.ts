// Referral attribution, pure logic (no browser APIs here, so it is testable).
//
// Link:  /authors/<authorId>?ref=<authorId>
// The client only REMEMBERS the author id (last click wins, 30 days). The
// server decides what it means: `claim_referral` stores an attribution for the
// signed-in buyer, and the finance function reads it when the payment is
// confirmed. Nothing here can lower or raise a commission by itself.

export const REFERRAL_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StoredReferral = { authorId: string; at: number };

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** `?ref=<uuid>` → the author id, or null for anything else. */
export function parseRefParam(search: string): string | null {
  const v = new URLSearchParams(search).get("ref");
  return isUuid(v) ? v.toLowerCase() : null;
}

/** The link an author shares. */
export function buildReferralLink(origin: string, authorId: string): string {
  return `${origin.replace(/\/+$/, "")}/authors/${encodeURIComponent(authorId)}?ref=${encodeURIComponent(authorId)}`;
}

export function serializeReferral(authorId: string, now: number): string {
  return JSON.stringify({ authorId, at: now } satisfies StoredReferral);
}

/** Stored value → a still-valid referral, or null (corrupt, wrong shape, expired, or from the future). */
export function readStoredReferral(raw: string | null, now: number): StoredReferral | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StoredReferral>;
    if (!isUuid(v.authorId) || typeof v.at !== "number" || !Number.isFinite(v.at)) return null;
    if (v.at > now + 5 * 60_000) return null;
    if (now - v.at > REFERRAL_WINDOW_DAYS * DAY_MS) return null;
    return { authorId: v.authorId.toLowerCase(), at: v.at };
  } catch {
    return null;
  }
}
