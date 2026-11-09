import { chatBanState } from "./chatBan.ts";

// Pure filtering/sorting for the admin "Журнал модерації" table.
// Only fields the log really has (sender name/email, action, risk,
// categories, timestamp) — never message text.

export type ModerationAction = "ALLOW" | "WARN" | "BLOCK";

export type SenderChatBan = { permanent: boolean; until: string | null; count: number };
export const NO_CHAT_BAN: SenderChatBan = { permanent: false, until: null, count: 0 };

export type ModerationRow = {
  id: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  senderChatBan: SenderChatBan;
  senderAccountBanned: boolean;
  action: ModerationAction;
  riskScore: number | null;
  categories: string[];
  createdAt: string;
};

export type FlaggedAction = "WARN" | "BLOCK";
export type ActionFilter = "all" | FlaggedAction;
export type RiskFilter = "all" | "risky" | "zero";
export type PeriodFilter = 0 | 7 | 30 | 90; // 0 = весь час

export type ModerationFilters = {
  query: string;
  action: ActionFilter;
  risk: RiskFilter;
  days: PeriodFilter;
};

export const DEFAULT_FILTERS: ModerationFilters = { query: "", action: "all", risk: "all", days: 0 };

export function hasActiveFilters(f: ModerationFilters): boolean {
  return f.query.trim() !== "" || f.action !== "all" || f.risk !== "all" || f.days !== 0;
}

/** Newest first; unparsable dates sink to the end. Does not mutate. */
export function sortNewestFirst<T extends { createdAt: string }>(rows: readonly T[]): T[] {
  const t = (r: T) => {
    const v = Date.parse(r.createdAt);
    return Number.isFinite(v) ? v : -Infinity;
  };
  return [...rows].sort((a, b) => t(b) - t(a));
}

/** The risk filter is only worth showing when the data actually varies. */
export function riskFilterUseful(rows: readonly ModerationRow[]): boolean {
  const distinct = new Set(rows.map((r) => (typeof r.riskScore === "number" ? r.riskScore : "none")));
  return distinct.size > 1;
}

export function filterRows(
  rows: readonly ModerationRow[],
  f: ModerationFilters,
  nowMs: number
): ModerationRow[] {
  const q = f.query.trim().toLowerCase();
  const since = f.days > 0 ? nowMs - f.days * 86_400_000 : null;
  return rows.filter((r) => {
    if (f.action !== "all" && r.action !== f.action) return false;
    if (f.risk === "risky" && !(typeof r.riskScore === "number" && r.riskScore > 0)) return false;
    // "zero" means a recorded 0 — a missing value is not treated as zero.
    if (f.risk === "zero" && r.riskScore !== 0) return false;
    if (since != null) {
      const t = Date.parse(r.createdAt);
      if (!Number.isFinite(t) || t < since) return false;
    }
    if (q && !(r.senderName.toLowerCase().includes(q) || r.senderEmail.toLowerCase().includes(q))) {
      return false;
    }
    return true;
  });
}

export type SenderSummary = {
  senderId: string;
  senderName: string;
  senderEmail: string;
  chatBan: SenderChatBan;
  accountBanned: boolean;
  warn: number;
  block: number;
  total: number;
  lastAt: string;
};

/**
 * Per-sender WARN/BLOCK tally — the part an admin can act on ("who keeps
 * tripping the filter"). ALLOW rows are ignored. Worst first: more
 * BLOCKs, then more flags overall, then most recent.
 */
export function summarizeSenders(rows: readonly ModerationRow[]): SenderSummary[] {
  const map = new Map<string, SenderSummary>();
  for (const r of rows) {
    if (r.action === "ALLOW") continue;
    const cur =
      map.get(r.senderId) ??
      ({
        senderId: r.senderId,
        senderName: r.senderName,
        senderEmail: r.senderEmail,
        chatBan: r.senderChatBan,
        accountBanned: r.senderAccountBanned,
        warn: 0,
        block: 0,
        total: 0,
        lastAt: r.createdAt,
      } as SenderSummary);
    if (r.action === "WARN") cur.warn += 1;
    else cur.block += 1;
    cur.total += 1;
    if (Date.parse(r.createdAt) > Date.parse(cur.lastAt) || !Number.isFinite(Date.parse(cur.lastAt))) {
      cur.lastAt = r.createdAt;
    }
    map.set(r.senderId, cur);
  }
  return [...map.values()].sort(
    (a, b) =>
      b.block - a.block || b.total - a.total || (Date.parse(b.lastAt) || 0) - (Date.parse(a.lastAt) || 0)
  );
}

/** BLOCK count from which the admin is nudged to contact or ban the person. */
export const ADMIN_ATTENTION_BLOCKS = 10;

export function needsAdminAttention(s: Pick<SenderSummary, "block">): boolean {
  return s.block >= ADMIN_ATTENTION_BLOCKS;
}

/**
 * Splits senders into those the admin can ACT on right now — chat currently
 * banned (a ban may need lifting) or 10+ BLOCKs (contact / ban the account) —
 * and everyone else who has signals but whose chat still works.
 * Order inside each group is kept (worst first).
 */
export function splitSenders(
  senders: readonly SenderSummary[],
  nowMs: number
): { needsAction: SenderSummary[]; watching: SenderSummary[] } {
  const needsAction: SenderSummary[] = [];
  const watching: SenderSummary[] = [];
  for (const s of senders) {
    const banned = chatBanState({ permanent: s.chatBan.permanent, untilIso: s.chatBan.until }, nowMs).active;
    (banned || needsAdminAttention(s) ? needsAction : watching).push(s);
  }
  return { needsAction, watching };
}

/** Human labels for moderation categories (raw codes mean nothing to an admin). */
export const CATEGORY_LABELS: Record<string, string> = {
  CONTACT_PHONE: "Телефон",
  CONTACT_EMAIL: "Email",
  CONTACT_SOCIAL: "Соцмережа",
  CONTACT_MESSENGER: "Месенджер",
  CONTACT_WEBSITE: "Посилання / сайт",
  CONTACT_ADDRESS: "Адреса",
  EXTERNAL_PAYMENT: "Оплата поза платформою",
  OFF_PLATFORM_COMMUNICATION: "Спілкування поза платформою",
  PROFANITY: "Нецензурна лексика",
};

export function categoryLabel(code: string): string {
  return CATEGORY_LABELS[code] ?? code;
}
