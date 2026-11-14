// "•••" → "Поскаржитися" on a meditation (2026-08-30, per Sasha's
// explicit call — "особливо важливо для emotional wellbeing content").
// Reports the CONTENT ITEM itself (its guidance might be inappropriate
// or factually wrong), not a person (lib/reports.ts's message_reports)
// and not a user-left comment (content_comment_reports in
// ProgramExperience.tsx) — a genuinely different concept from both,
// hence its own table. Filing is insert-only from here; nobody but the
// reporter can read their own filed reports back (schema.sql's RLS),
// same "team reviews it elsewhere" shape as every other report table.

import { supabase } from "./supabaseClient.ts";

export type ContentReportReason = "inappropriate_content" | "incorrect_claims" | "other";

export const CONTENT_REPORT_REASON_LABELS: Record<ContentReportReason, string> = {
  inappropriate_content: "Неприйнятний контент",
  incorrect_claims: "Некоректні твердження",
  other: "Інше",
};

export const CONTENT_REPORT_REASONS: ContentReportReason[] = [
  "inappropriate_content",
  "incorrect_claims",
  "other",
];

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований — скаргу не можна надіслати.");
  }
  return supabase;
}

export async function submitContentReport(params: {
  reporterId: string;
  contentItemId: string;
  // Scoped to meditations in the UI today (see MeditationExperience.tsx)
  // — 'program'/'guide' are here so this extends without a schema
  // change if the "•••" menu ever reaches courses/guides too.
  contentKind: "program" | "guide" | "meditation";
  contentTitle: string;
  reason: ContentReportReason;
  details?: string;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("content_reports").insert({
    reporter_id: params.reporterId,
    content_item_id: params.contentItemId,
    content_kind: params.contentKind,
    content_title: params.contentTitle,
    reason: params.reason,
    details: params.details?.trim() || null,
  });
  if (error && (error as { code?: string }).code !== "23505") throw error; // already reported by this person: still «sent»
}
