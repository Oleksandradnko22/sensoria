// "Завантажити мої дані" — a plain export of everything RLS already
// lets this person read about themselves. Deliberately NOT an Edge
// Function: every table queried here already has a "select your own
// rows" policy (schema.sql), so a normal authenticated client call is
// both sufficient and safer than routing through a service-role
// function that would have to be trusted to only ever return the
// caller's own data.

import { supabase } from "./supabaseClient.ts";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований — дані не можна завантажити.");
  }
  return supabase;
}

// Everything below is read with the person's own session, so RLS limits it
// to their rows. Core tables must load — a failed read aborts the export
// instead of quietly producing an incomplete file. Optional tables (learning
// activity etc.) may be missing in an older database: those are listed under
// `unavailable` rather than silently dropped.
const CORE: { key: string; table: string; column: string; select?: string }[] = [
  { key: "purchases", table: "purchases", column: "participant_id" },
  { key: "reviews", table: "reviews", column: "participant_id" },
  { key: "authorReviews", table: "author_reviews", column: "participant_id" },
  { key: "reportsFiled", table: "message_reports", column: "reporter_id" },
  { key: "refundRequests", table: "refund_requests", column: "participant_id" },
  { key: "assessment", table: "assessment_results", column: "profile_id" },
];

const EXTRA: { table: string; column: string }[] = [
  { table: "support_tickets", column: "user_id" },
  { table: "content_reports", column: "reporter_id" },
  { table: "content_comments", column: "user_id" },
  { table: "content_progress", column: "user_id" },
  { table: "content_program_completions", column: "user_id" },
  { table: "content_item_feedback", column: "user_id" },
  { table: "content_item_practice_responses", column: "user_id" },
  { table: "content_item_reflections", column: "user_id" },
  { table: "content_item_mood_checkins", column: "user_id" },
  { table: "content_module_mood_checkins", column: "user_id" },
  { table: "content_item_bookmarks", column: "user_id" },
  { table: "content_item_saved_practices", column: "user_id" },
  { table: "content_item_video_positions", column: "user_id" },
  { table: "content_item_warning_acks", column: "user_id" },
  { table: "meditation_audio_positions", column: "user_id" },
  { table: "meditation_mood_checkins", column: "user_id" },
  { table: "guide_fragment_saves", column: "user_id" },
  { table: "guide_saved_for_later", column: "user_id" },
  { table: "program_saved_for_later", column: "user_id" },
  { table: "guide_checklist_checks", column: "user_id" },
  { table: "guide_notes", column: "user_id" },
  { table: "guide_self_assessments", column: "user_id" },
  { table: "guide_section_views", column: "user_id" },
  { table: "meditation_sessions", column: "user_id" },
  { table: "author_post_comments", column: "user_id" },
  { table: "author_post_likes", column: "user_id" },
  { table: "author_follows", column: "follower_id" },
  { table: "content_comment_reports", column: "reporter_id" },
  { table: "author_post_comment_reports", column: "reporter_id" },
  { table: "user_sessions", column: "profile_id" },
];

export async function exportMyData(profileId: string): Promise<Record<string, unknown>> {
  const client = requireSupabase();

  const [profileRes, messagesRes, coreRes, extraRes] = await Promise.all([
    client.from("profiles").select("*").eq("id", profileId).single(),
    // explicit columns: the original text of deleted messages stays server-side
    client
      .from("messages")
      .select("id, sender_id, recipient_id, content_id, body, read, created_at, deleted_at")
      .or(`sender_id.eq.${profileId},recipient_id.eq.${profileId}`),
    Promise.all(CORE.map((c) => client.from(c.table).select("*").eq(c.column, profileId))),
    Promise.all(EXTRA.map((c) => client.from(c.table).select("*").eq(c.column, profileId))),
  ]);

  // `deleted_at` may not exist before messages-delete-migration.sql — retry without it.
  let messages: unknown[] | null = messagesRes.data;
  if (messagesRes.error) {
    const retry = await client
      .from("messages")
      .select("id, sender_id, recipient_id, content_id, body, read, created_at")
      .or(`sender_id.eq.${profileId},recipient_id.eq.${profileId}`);
    if (retry.error) throw new Error("Не вдалося зібрати повідомлення. Спробуйте ще раз.");
    messages = retry.data;
  }
  if (profileRes.error) throw new Error("Не вдалося завантажити профіль. Спробуйте ще раз.");
  const failedCore = CORE.filter((_, i) => coreRes[i].error).map((c) => c.table);
  if (failedCore.length) throw new Error("Не вдалося зібрати всі дані. Спробуйте ще раз.");

  const out: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    profile: profileRes.data ?? null,
    messages: messages ?? [],
  };
  CORE.forEach((c, i) => {
    const rows = coreRes[i].data ?? [];
    out[c.key] = c.key === "assessment" ? rows[0] ?? null : rows;
  });
  const activity: Record<string, unknown[]> = {};
  const unavailable: string[] = [];
  EXTRA.forEach((c, i) => {
    if (extraRes[i].error) unavailable.push(c.table);
    else if ((extraRes[i].data ?? []).length) activity[c.table] = extraRes[i].data ?? [];
  });
  out.activity = activity;
  if (unavailable.length) out.unavailable = unavailable;
  return out;
}

// Plain client-side Blob download — no server round trip needed once
// exportMyData() already has everything in memory.
export function downloadAsJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
