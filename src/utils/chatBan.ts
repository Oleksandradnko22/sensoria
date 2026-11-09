// Chat-ban ladder + countdown maths. Pure; the server decides and stores
// the ban (send-message Edge Function), the client only displays it.
//
// Ladder (each time a person collects 3 new BLOCKs):
//   1st ban 3 days → 2nd 7 days → 3rd 14 days → 4th 30 days → 5th forever.
// IMPORTANT: the block between the CHATBAN markers is copied verbatim into
// supabase/functions/send-message/index.ts (single-file Edge Function); a
// test keeps the two in sync.

// ---- BEGIN CHATBAN ----
const CHAT_BAN_DAYS = [3, 7, 14, 30];

export type NextChatBan = { count: number; permanent: boolean; untilIso: string | null };

/** The ban that follows `priorBans` earlier bans (0 → the first one). */
export function nextChatBan(priorBans: number, nowMs: number): NextChatBan {
  const count = priorBans + 1;
  const days = CHAT_BAN_DAYS[count - 1];
  if (days === undefined) return { count, permanent: true, untilIso: null };
  return { count, permanent: false, untilIso: new Date(nowMs + days * 86_400_000).toISOString() };
}
// ---- END CHATBAN ----

export const CHAT_BAN_BLOCK_LIMIT = 3;

export type ChatBanFields = {
  permanent: boolean;
  untilIso: string | null;
};

export type ChatBanState =
  | { active: false }
  | { active: true; permanent: true }
  | { active: true; permanent: false; untilMs: number; remainingMs: number };

export function chatBanState(f: ChatBanFields | null | undefined, nowMs: number): ChatBanState {
  if (!f) return { active: false };
  if (f.permanent) return { active: true, permanent: true };
  const until = f.untilIso ? Date.parse(f.untilIso) : NaN;
  if (!Number.isFinite(until) || until <= nowMs) return { active: false };
  return { active: true, permanent: false, untilMs: until, remainingMs: until - nowMs };
}

/** "2 д 14 год 05 хв 09 с" — seconds always shown so the countdown visibly ticks. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3_600);
  const m = Math.floor((total % 3_600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d} д ${pad(h)} год ${pad(m)} хв ${pad(s)} с` : `${pad(h)} год ${pad(m)} хв ${pad(s)} с`;
}

/** Length of the n-th ban for the admin ("3 дні", "7 днів", …, "назавжди"). */
export function banStepLabel(count: number): string {
  switch (count) {
    case 1:
      return "3 дні";
    case 2:
      return "7 днів";
    case 3:
      return "14 днів";
    case 4:
      return "30 днів";
    default:
      return "назавжди";
  }
}

/** Length of the NEXT ban for someone who has had `count` bans already. */
export function nextBanLabel(count: number): string {
  return banStepLabel(count + 1);
}
