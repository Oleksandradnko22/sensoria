// "Поскаржитися" on an author, an author's post or a review about an author
// (entity-reports-migration.sql). Insert-only from the client; the admin
// panel reads them through admin-data "reports". Reports on programs/guides/
// meditations go to content_reports (lib/contentReports.ts) instead.

import { supabase } from "./supabaseClient.ts";

export type EntityReportType = "author" | "post" | "review";
export type EntityReportReason =
  | "inappropriate_content"
  | "harassment"
  | "spam_or_ads"
  | "misleading"
  | "impersonation"
  | "other";

export const ENTITY_REPORT_REASON_LABELS: Record<EntityReportReason, string> = {
  inappropriate_content: "Неприйнятний або шокуючий контент",
  harassment: "Образи, агресія, цькування",
  spam_or_ads: "Спам або реклама",
  misleading: "Введення в оману / шахрайство",
  impersonation: "Видає себе за іншу людину",
  other: "Інше",
};

// Which reasons make sense for which target.
export const ENTITY_REPORT_REASONS: Record<EntityReportType, EntityReportReason[]> = {
  author: ["inappropriate_content", "harassment", "misleading", "impersonation", "spam_or_ads", "other"],
  post: ["inappropriate_content", "harassment", "spam_or_ads", "misleading", "other"],
  review: ["harassment", "spam_or_ads", "inappropriate_content", "other"],
};

export const ENTITY_TYPE_LABELS: Record<EntityReportType, string> = {
  author: "Автор",
  post: "Публікація автора",
  review: "Відгук про автора",
};

export async function submitEntityReport(params: {
  reporterId: string;
  targetType: EntityReportType;
  targetId: string;
  targetOwnerId?: string | null;
  targetLabel?: string;
  reason: EntityReportReason;
  details?: string;
}): Promise<void> {
  if (!supabase) throw new Error("Supabase не налаштований — скаргу не можна надіслати.");
  const { error } = await supabase.from("entity_reports").insert({
    reporter_id: params.reporterId,
    target_type: params.targetType,
    target_id: params.targetId,
    target_owner_id: params.targetOwnerId ?? null,
    target_label: params.targetLabel?.slice(0, 200) || null,
    reason: params.reason,
    details: params.details?.trim().slice(0, 1000) || null,
  });
  // 23505 = already reported by this person — to them it is still "sent".
  if (error && (error as { code?: string }).code !== "23505") throw error;
}
