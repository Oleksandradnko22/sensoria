// Real persistence for "Цей матеріал був для вас корисним?" on the
// Lesson Player screen — replaces utils/contentFeedbackStore.ts's
// localStorage demo store with the real content_item_feedback table
// (see supabase/schema.sql). A negative answer ("Не зовсім") comes with
// an optional free-text reason, captured through a follow-up window so
// it can eventually reach the author — see the schema comment for why
// there's no author-read path wired up yet (same accepted limitation as
// lib/lessonComments.ts: the Lesson Player only renders the demo
// catalog today, which has no real author account to route this to).
//
// Also backs MeditationExperience's "Ця практика була корисною?" +
// "Поділіться враженням" (2026-08-30, per Sasha's explicit call — a
// calm yes/no, not a course-style discussion thread). Same table, same
// `reason` column, just used more generally there: `reason` is now
// captured regardless of `value` (not only for "not_helpful"), since a
// meditation's optional "Поділіться враженням" is a free-form
// impression either way, not specifically "why wasn't this helpful".

import { supabase } from "./supabaseClient.ts";

export type FeedbackValue = "helpful" | "not_helpful";

export type ItemFeedback = {
  value: FeedbackValue;
  reason: string | null;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

export async function fetchItemFeedback(itemId: string, userId: string): Promise<ItemFeedback | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_item_feedback")
    .select("is_helpful, reason")
    .eq("content_item_id", itemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return { value: data.is_helpful ? "helpful" : "not_helpful", reason: data.reason };
}

export async function submitItemFeedback(params: {
  itemId: string;
  userId: string;
  value: FeedbackValue;
  reason?: string | null;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("content_item_feedback").upsert(
    {
      content_item_id: params.itemId,
      user_id: params.userId,
      is_helpful: params.value === "helpful",
      reason: params.reason?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "content_item_id,user_id" }
  );
  if (error) throw error;
}

export type MeditationFeedbackEntry = {
  id: string;
  meditationId: string;
  participantId: string;
  participantName: string;
  value: FeedbackValue;
  reason: string | null;
  createdAt: string;
  updatedAt: string | null;
};

// "Ця практика була корисною?" reaching the author's own cabinet
// (2026-08-30, per Sasha's explicit call). A plain RLS-scoped read, not
// an admin-data Edge Function call — "authors view feedback on their
// own meditations" (schema.sql, via meditation_authors) already
// restricts what comes back to just this author's own meditations, the
// same way any other author-facing query in this app works. Kept
// unfiltered by meditation id here (no author-owned-meditation-ids list
// exists client-side to pass in) — AuthorReviews.tsx cross-references
// against data/meditations.ts to resolve titles and drop anything RLS
// let through that isn't actually a meditation id (lesson feedback,
// if this author also has real course content).
//
// participantId/participantName (2026-08-30, per Sasha's follow-up —
// the participant-facing copy explicitly promises "автор ознайомиться
// і може написати, щоб дізнатися деталі", so this can't stay
// anonymous the way lesson feedback still is): same identification
// shape as lib/reviews.ts's fetchReviewsForContentIds, a second query
// against profiles rather than a join (content_item_feedback has no FK
// to profiles usable in a single select).
export async function fetchMeditationFeedbackForAuthor(): Promise<MeditationFeedbackEntry[]> {
  const client = requireSupabase();
  const { data: rows, error } = await client
    .from("content_item_feedback")
    .select("id, content_item_id, user_id, is_helpful, reason, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error || !rows) return [];

  const participantIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profiles } = participantIds.length
    ? await client.from("profiles").select("id, name").in("id", participantIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  return rows.map((r) => ({
    id: r.id,
    meditationId: r.content_item_id,
    participantId: r.user_id,
    participantName: nameById.get(r.user_id) ?? "Учасник Sensoria",
    value: r.is_helpful ? "helpful" : "not_helpful",
    reason: r.reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}
