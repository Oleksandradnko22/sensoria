// Thin typed wrapper around the admin-data Edge Function — see that
// function for why this can't just be plain Supabase queries from the
// client (RLS deliberately doesn't expose this data to a normal
// authenticated user, admin or not).

import { supabase } from "./supabaseClient.ts";

export type PlatformStats = {
  authorCount: number;
  participantCount: number;
  publishedCount: number;
  draftCount: number;
  reviewCount: number;
  blockCount30d: number;
  warnCount30d: number;
};

// Chat-ban fields of a profile (see utils/chatBan.ts for the ladder).
export type ChatBanInfo = {
  permanent: boolean;
  until: string | null; // ISO; null when not banned or permanent
  count: number; // how many chat bans this person has had
};

export type ModerationLogEntry = {
  id: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  // Absent when talking to an older deployed admin-data.
  senderChatBan?: ChatBanInfo;
  senderAccountBanned?: boolean;
  action: "ALLOW" | "WARN" | "BLOCK";
  riskScore: number;
  categories: string[];
  detectorsTriggered: string[];
  createdAt: string;
};

export type AdminUserRow = {
  id: string;
  role: "author" | "participant";
  name: string;
  email: string;
  isAdmin: boolean;
  isBanned: boolean;
  // Chat ban — can't send messages, the account itself still works.
  chatBan?: ChatBanInfo;
  createdAt: string;
  verified: boolean | null;
  /** «Фахівець»: education documents reviewed by Sensoria. */
  educationVerified?: boolean | null;
  // All-time complaint count against this account (message_reports,
  // any status) — REPORT_REVIEW_THRESHOLD in AdminDashboardPage.tsx is
  // what turns this into the "На розгляд щодо блокування" flag.
  reportCount: number;
};

export type SupportTicket = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: "author" | "participant" | null;
  category: string;
  description: string;
  status: "open" | "resolved";
  adminResponse: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type RefundRequest = {
  id: string;
  participantId: string;
  contentTitle: string;
  contentKind: "program" | "guide" | "meditation";
  amount: number;
  purchasedAt: string;
  fullName: string;
  email: string;
  phone: string;
  reason: string;
  status: "open" | "reviewed";
  createdAt: string;
};

// "•••" → "Поскаржитися" on a meditation (2026-08-30, per Sasha's
// explicit call). reason is a ContentReportReason (lib/contentReports.ts)
// kept as a plain string here to avoid this file depending on that
// one — CONTENT_REPORT_REASON_LABELS in the admin panel does the
// lookup.
export type ContentReport = {
  id: string;
  reporterName: string;
  reporterEmail: string;
  contentItemId: string;
  contentKind: "program" | "guide" | "meditation";
  contentTitle: string;
  reason: string;
  details: string | null;
  status: "open" | "reviewed";
  createdAt: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

async function callAdmin<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  if (import.meta.env.DEV) {
    // DEV-only sample data for design review (?moderationDemo=1).
    const demo = await import("../dev/moderationPreview.ts");
    if (demo.moderationDemoOn()) {
      const mocked = demo.demoAdmin(action, extra);
      if (mocked !== undefined) return mocked as T;
    }
  }
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("admin-data", {
    body: { action, ...extra },
  });
  if (error) {
    // FunctionsHttpError hides the server's JSON body behind a generic
    // "non-2xx" message — surface the real reason (401/403/500…).
    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === "function") {
      const body = await res.json().catch(() => null);
      if (body?.error) throw new Error(`${body.error} (${res.status})`);
      throw new Error(`Помилка сервера (${res.status}).`);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export type ContentKind = "program" | "guide" | "meditation";

export type PlatformAnalytics = {
  generatedAt: string;
  days: number;
  totals: {
    authors: number;
    participants: number;
    published: number;
    drafts: number;
    review: number;
    publishedByKind: Record<ContentKind, number>;
    // People whose chat is banned right now (null when it could not be counted).
    chatBanned?: number | null;
  };
  period: {
    block: number;
    warn: number;
    // null when the period is "весь час" (nothing to compare with)
    prevBlock: number | null;
    prevWarn: number | null;
    newParticipants: number;
    prevNewParticipants: number | null;
  };
  series: {
    registrations: string[];
    content: string[];
    registrationsTruncated: boolean;
    contentTruncated: boolean;
  };
  recentParticipants: {
    id: string;
    name: string;
    email: string;
    isBanned: boolean;
    createdAt: string;
  }[];
  recentContent: {
    id: string;
    title: string;
    kind: ContentKind;
    coverUrl: string | null;
    authorName: string;
    updatedAt: string;
  }[];
};

export type AdminActionRow = {
  id: string;
  action: string;
  actorName: string;
  targetName: string | null;
  targetEmail: string | null;
  reason?: string | null;
  materialTitle?: string | null;
  createdAt: string;
};

export async function fetchAdminActions(): Promise<AdminActionRow[]> {
  const { actions } = await callAdmin<{ actions: AdminActionRow[] }>("adminActions");
  return actions;
}

export function fetchPlatformAnalytics(days: 0 | 7 | 30 | 90): Promise<PlatformAnalytics> {
  return callAdmin<PlatformAnalytics>("analytics", { days });
}

export function fetchPlatformStats(): Promise<PlatformStats> {
  return callAdmin<PlatformStats>("stats");
}

// WARN/BLOCK decisions only (see admin-data "moderationLog"). allowedCount
// is undefined when talking to an older deployed function version.
export async function fetchModerationLog(): Promise<{
  entries: ModerationLogEntry[];
  allowedCount: number | undefined;
  // Exact number of WARN/BLOCK rows in the database (entries holds the latest 500).
  flaggedTotal: number | undefined;
}> {
  const { entries, allowedCount, flaggedTotal } = await callAdmin<{
    entries: ModerationLogEntry[];
    allowedCount?: number;
    flaggedTotal?: number;
  }>("moderationLog");
  return { entries, allowedCount, flaggedTotal };
}

// Searchable and paged (100 per call): `query` matches name or email.
export async function fetchUsers(
  opts: { query?: string; offset?: number } = {}
): Promise<{ users: AdminUserRow[]; total: number | null }> {
  const { users, total } = await callAdmin<{ users: AdminUserRow[]; total?: number | null }>("users", {
    query: opts.query ?? "",
    offset: opts.offset ?? 0,
  });
  return { users, total: total ?? null };
}

export type UserDetail = {
  reports: AdminReport[];
  actions: { id: string; action: string; createdAt: string }[];
  verificationRequests: { id: string; status: string; rejectReason: string | null; createdAt: string; reviewedAt: string | null }[];
  contentCount: number;
  warnCount: number;
  blockCount: number;
};

export function fetchUserDetail(profileId: string): Promise<UserDetail> {
  return callAdmin<UserDetail>("userDetail", { profileId });
}

export type VerificationRequest = {
  id: string;
  authorId: string;
  /** identity = the «галочка»; education = diploma/certificate review («Фахівець»). */
  kind?: "identity" | "education";
  authorName: string;
  authorEmail: string;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  documents: { url: string; name: string }[];
  profile: { hasAvatar: boolean; title: string; bio: string; credentials: string };
};

export async function fetchVerificationRequests(): Promise<VerificationRequest[]> {
  const { requests } = await callAdmin<{ requests: VerificationRequest[] }>("verificationRequests");
  return requests;
}

export function reviewVerification(requestId: string, approve: boolean, reason?: string): Promise<void> {
  return callAdmin("reviewVerification", { requestId, approve, reason }).then(() => undefined);
}

export function restorePurchases(oldEmail: string, newEmail: string, reason: string): Promise<{ moved: number }> {
  return callAdmin<{ moved: number }>("restoreAccess", { oldEmail, newEmail, reason });
}

export function setEducationVerified(profileId: string, verified: boolean, reason?: string): Promise<void> {
  return callAdmin("setEducationVerified", { profileId, verified, reason }).then(() => undefined);
}

export function setAuthorVerified(profileId: string, verified: boolean): Promise<void> {
  return callAdmin("verifyAuthor", { profileId, verified }).then(() => undefined);
}

// Ends a chat ban now (for a misunderstanding) and takes one step off the
// escalation ladder — see admin-data "liftChatBan".
export function liftChatBan(profileId: string): Promise<void> {
  return callAdmin("liftChatBan", { profileId }).then(() => undefined);
}

export function setUserBanned(profileId: string, banned: boolean, reason?: string): Promise<void> {
  return callAdmin("setBanned", { profileId, banned, reason }).then(() => undefined);
}

export async function fetchRefundRequests(): Promise<RefundRequest[]> {
  const { requests } = await callAdmin<{ requests: RefundRequest[] }>("refundRequests");
  return requests;
}

// Only flips the status shown in the panel — the actual refund is
// always sent manually via bank/payment provider, outside the app.
export function markRefundReviewed(requestId: string): Promise<void> {
  return callAdmin("markRefundReviewed", { requestId }).then(() => undefined);
}

// Every complaint in one shape (admin-data "reports").
export type ReportSource = "message" | "content" | "lesson_comment" | "post_comment" | "entity";
export type AdminReport = {
  id: string;
  source: ReportSource;
  // person | program | guide | meditation | comment | author | post | review
  targetType: string;
  targetLabel: string;
  snippet: string | null;
  reporterName: string | null;
  reporterEmail: string | null;
  // The person the complaint is about (comment author, post author, reported user…).
  ownerName: string | null;
  ownerEmail: string | null;
  reason: string;
  details: string | null;
  status: "open" | "reviewed";
  createdAt: string;
  // The thing complained about (comment / post / review / content id) and the
  // person it belongs to — used for actions and per-person counts.
  targetId?: string | null;
  ownerId?: string | null;
};

export type ReportAct = "delete_comment" | "delete_post" | "delete_review" | "unpublish_content" | "restore_sale" | "suspend_sale";

export function runReportAction(source: ReportSource, reportId: string, act: ReportAct, reason?: string): Promise<void> {
  return callAdmin("reportAction", { source, reportId, act, reason }).then(() => undefined);
}

export async function fetchReports(): Promise<AdminReport[]> {
  const { reports } = await callAdmin<{ reports: AdminReport[] }>("reports");
  return reports;
}

export function markReportReviewed(source: ReportSource, reportId: string): Promise<void> {
  return callAdmin("markReportReviewed", { source, reportId }).then(() => undefined);
}

export async function fetchContentReports(): Promise<ContentReport[]> {
  const { reports } = await callAdmin<{ reports: ContentReport[] }>("contentReports");
  return reports;
}

export function markContentReportReviewed(reportId: string): Promise<void> {
  return callAdmin("markContentReportReviewed", { reportId }).then(() => undefined);
}

export async function fetchSupportTickets(): Promise<SupportTicket[]> {
  const { tickets } = await callAdmin<{ tickets: SupportTicket[] }>("supportTickets");
  return tickets;
}

// adminResponse is optional — a ticket can be closed as resolved with
// or without a written reply (e.g. an obvious duplicate, or something
// handled by email instead).
export function resolveTicket(ticketId: string, adminResponse?: string): Promise<void> {
  return callAdmin("resolveTicket", { ticketId, adminResponse }).then(() => undefined);
}

// ── Roles, 2FA and materials ─────────────────────────────────────────
export type AdminRole = "owner" | "support";

export function fetchAdminMe(): Promise<{ role: AdminRole; mfaOk: boolean }> {
  return callAdmin("me");
}

export type SaleStatus = "published" | "complaint_pending" | "unlisted" | "restored" | "suspended_debt";

export type AdminMaterial = {
  id: string;
  kind: "program" | "guide" | "meditation";
  title: string;
  status: "draft" | "review" | "published" | "archived";
  saleStatus: SaleStatus;
  riskTopics?: string[];
  accessRestricted: boolean;
  accessRestrictedReason: string | null;
  price: number;
  authorId: string;
  authorName: string;
  authorEmail: string | null;
  buyers: number;
  openReports: number;
  updatedAt: string;
};

export async function fetchAdminMaterials(query = ""): Promise<AdminMaterial[]> {
  const { materials } = await callAdmin<{ materials: AdminMaterial[] }>("materials", { query });
  return materials;
}

export type MaterialAct =
  | "approve"
  | "send_back"
  | "suspend_sale"
  | "unlist"
  | "restore_sale"
  | "restrict_access"
  | "restore_access"
  | "delete_material";

export function runMaterialAction(contentId: string, act: MaterialAct, reason: string): Promise<void> {
  return callAdmin("materialAction", { contentId, act, reason }).then(() => undefined);
}
