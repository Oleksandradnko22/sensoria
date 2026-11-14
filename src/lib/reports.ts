// "Поскаржитися" — a participant flagging an author/conversation for
// the Sensoria team. Filing is insert-only; reading is scoped to the
// reporter's own history only; deleting is allowed only for the
// reporter's own, still-open reports (schema.sql's three
// message_reports policies) — nobody, including the reported person,
// can see who filed what beyond that, and a report the team has
// already looked at can no longer be pulled back.

import { supabase } from "./supabaseClient.ts";
import { isUuid } from "../utils/messagesView.ts";

export type ReportReason =
  | "inappropriate_content"
  | "requests_contact_info"
  | "offers_off_platform_payment"
  | "inappropriate_behavior"
  | "other";

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  inappropriate_content: "Неприйнятний контент",
  requests_contact_info: "Просить особисті контакти",
  offers_off_platform_payment: "Пропонує оплату поза Sensoria",
  inappropriate_behavior: "Некоректна поведінка",
  other: "Інше",
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований — скаргу не можна надіслати.");
  }
  return supabase;
}

export async function submitReport(params: {
  reporterId: string;
  reportedId: string;
  contentId: string | null;
  reason: ReportReason;
  details?: string;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("message_reports").insert({
    reporter_id: params.reporterId,
    reported_id: params.reportedId,
    // Guide/meditation ids are catalog slugs, not uuids; the column is a
    // uuid FK, so a slug made every such report fail with a 400.
    content_id: params.contentId && isUuid(params.contentId) ? params.contentId : null,
    reason: params.reason,
    details: params.details?.trim() || null,
  });
  if (error && (error as { code?: string }).code !== "23505") throw error; // already reported by this person: still «sent»
}

export type MyReport = {
  id: string;
  reportedName: string;
  contentTitle: string | null;
  reason: ReportReason;
  details: string | null;
  status: "open" | "reviewed";
  createdAt: string;
  // what was reported («Повідомлення», «Матеріал», «Публікація»…), the reason in words, and whether it can be withdrawn
  kind?: string;
  reasonLabel?: string;
  deletable?: boolean;
};

// "Мої скарги" in ParticipantReviews.tsx — everything this person has
// filed, for their own reference (not for tracking what happened to
// it beyond open/reviewed — the actual moderation stays team-internal).
export async function fetchMyReports(reporterId: string): Promise<MyReport[]> {
  const client = requireSupabase();
  const { data: rows, error } = await client
    .from("message_reports")
    .select("id, reported_id, content_id, reason, details, status, created_at")
    .eq("reporter_id", reporterId)
    .order("created_at", { ascending: false });
  if (error) throw error; // the page shows an error state, not a fake empty list
  if (!rows) return [];

  const reportedIds = Array.from(new Set(rows.map((r) => r.reported_id)));
  const contentIds = Array.from(
    new Set(rows.map((r) => r.content_id).filter((id): id is string => !!id))
  );
  const [{ data: profileRows }, { data: contentRows }] = await Promise.all([
    reportedIds.length
      ? client.from("profiles").select("id, name").in("id", reportedIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    contentIds.length
      ? client.from("content").select("id, title").in("id", contentIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const nameById = new Map((profileRows ?? []).map((p) => [p.id, p.name]));
  const titleById = new Map((contentRows ?? []).map((c) => [c.id, c.title]));

  const messages: MyReport[] = rows.map((r) => ({
    id: r.id,
    reportedName: nameById.get(r.reported_id) ?? "Учасник Sensoria",
    contentTitle: r.content_id ? titleById.get(r.content_id) ?? null : null,
    reason: r.reason as ReportReason,
    details: r.details,
    status: r.status as "open" | "reviewed",
    createdAt: r.created_at,
    kind: "Повідомлення",
    reasonLabel: REPORT_REASON_LABELS[r.reason as ReportReason],
    deletable: true,
  }));

  // the other kinds of reports this person filed (materials, posts, authors, reviews, comments); a table the
  // person can't read yet (an older database) is simply skipped
  const other = await Promise.all([
    client.from("content_reports").select("id, content_title, reason, details, status, created_at").eq("reporter_id", reporterId)
      .then(({ data }) => (data ?? []).map((r) => ({ ...base(r), kind: "Матеріал", reportedName: (r.content_title as string) ?? "Матеріал" }))),
    client.from("entity_reports").select("id, target_type, target_label, reason, details, status, created_at").eq("reporter_id", reporterId)
      .then(({ data }) => (data ?? []).map((r) => ({ ...base(r), kind: ({ post: "Публікація", author: "Автор", review: "Відгук" } as Record<string, string>)[r.target_type as string] ?? "Скарга", reportedName: (r.target_label as string) ?? "" }))),
    client.from("author_post_comment_reports").select("id, reason, status, created_at").eq("reporter_id", reporterId)
      .then(({ data }) => (data ?? []).map((r) => ({ ...base(r), kind: "Коментар у «Спільноті»", reportedName: "Коментар" }))),
    client.from("content_comment_reports").select("id, reason, status, created_at").eq("reporter_id", reporterId)
      .then(({ data }) => (data ?? []).map((r) => ({ ...base(r), kind: "Коментар до уроку", reportedName: "Коментар" }))),
  ].map((p) => Promise.resolve(p).catch(() => [] as MyReport[])));
  return [...messages, ...other.flat()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// one shape for every kind of report
const ANY_REASON: Record<string, string> = {
  inappropriate_content: "Неприйнятний контент",
  requests_contact_info: "Просить особисті контакти",
  offers_off_platform_payment: "Пропонує оплату поза Sensoria",
  inappropriate_behavior: "Некоректна поведінка",
  incorrect_claims: "Недостовірні твердження",
  harassment: "Образи чи цькування",
  spam_or_ads: "Спам або реклама",
  misleading: "Вводить в оману",
  impersonation: "Видає себе за іншу людину",
  other: "Інше",
};
function base(r: Record<string, unknown>): MyReport {
  const reason = String(r.reason ?? "other");
  return {
    id: String(r.id),
    reportedName: "",
    contentTitle: null,
    reason: (reason in REPORT_REASON_LABELS ? reason : "other") as ReportReason,
    details: (r.details as string | null) ?? null,
    status: (r.status as "open" | "reviewed") ?? "open",
    createdAt: String(r.created_at),
    reasonLabel: ANY_REASON[reason] ?? "Інше",
    deletable: false,
  };
}

// Withdrawing a report you filed — only while it's still "open".
// RLS is the real gate here (see schema.sql); this will fail once the
// team has already reviewed it, same as it would for any other row
// that no longer matches the delete policy's `status = 'open'` check.
export async function deleteReport(reportId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("message_reports").delete().eq("id", reportId);
  if (error) throw error;
}

// How many complaints exist against *me* — used by AuthorOverview.tsx
// to notify an author that reports were filed, without ever revealing
// who filed them or why (RLS has no policy letting reported_id read
// message_reports directly — this is the one narrow, count-only path,
// via supabase/functions/author-report-count). Fails soft to 0 rather
// than throwing, since a failed notification shouldn't break the
// Overview page it lives on.
export async function fetchMyReportCount(): Promise<number> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("author-report-count");
  if (error || typeof data?.count !== "number") return 0;
  return data.count;
}
