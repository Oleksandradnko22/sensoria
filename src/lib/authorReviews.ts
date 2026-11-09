// Real persistence for author-level reviews (author_reviews table) —
// distinct from src/lib/reviews.ts, which scores one piece of content.
// This scores the author as a person (teaching style, communication),
// entered from programDetail/ProgramDetailPage.tsx's "Оцінити автора" block and
// shown in ParticipantReviews.tsx's unified list + as a rating summary
// on AuthorProfile.tsx.

import { supabase } from "./supabaseClient.ts";
import { sendNotificationEmail } from "./notificationPrefs.ts";

export type AuthorReviewRow = {
  id: string;
  participantId: string;
  authorId: string;
  authorName: string;
  rating: number;
  text: string;
  createdAt: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

// Used by ParticipantReviews.tsx — every author-level review this
// participant has left, across all authors they've studied with.
export async function fetchMyAuthorReviews(participantId: string, opts: { strict?: boolean } = {}): Promise<AuthorReviewRow[]> {
  const client = requireSupabase();
  const { data: rows, error } = await client
    .from("author_reviews")
    .select("id, author_id, rating, text, created_at")
    .eq("participant_id", participantId)
    .order("created_at", { ascending: false });
  if (error && opts.strict) throw error;
  if (error || !rows) return [];

  const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
  const { data: authorRows } = authorIds.length
    ? await client.from("profiles").select("id, name").in("id", authorIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((authorRows ?? []).map((a) => [a.id, a.name]));

  return rows.map((r) => ({
    id: r.id,
    participantId,
    authorId: r.author_id,
    authorName: nameById.get(r.author_id) ?? "Автор Sensoria",
    rating: r.rating,
    text: r.text,
    createdAt: r.created_at,
  }));
}

// One review per (participant, author) — mirrors reviews.ts'
// upsertReview: writing a review for an author you've already reviewed
// edits it in place instead of erroring.
export async function upsertAuthorReview(params: {
  participantId: string;
  authorId: string;
  rating: number;
  text: string;
}): Promise<void> {
  const client = requireSupabase();
  const existing = await client
    .from("author_reviews")
    .select("id")
    .eq("participant_id", params.participantId)
    .eq("author_id", params.authorId)
    .maybeSingle();
  const { data, error } = await client
    .from("author_reviews")
    .upsert(
      {
        participant_id: params.participantId,
        author_id: params.authorId,
        rating: params.rating,
        text: params.text,
      },
      { onConflict: "participant_id,author_id" }
    )
    .select("id")
    .single();
  if (error) throw error;
  // Only a NEW review notifies the author (editing one's own review does not).
  if (!existing.data && data) {
    sendNotificationEmail(
      params.authorId,
      "review",
      "Новий відгук про вас на Sensoria",
      `Учасник залишив вам відгук (оцінка ${params.rating} з 5):\n\n«${params.text}»\n\nПереглянути відгук і відповісти на нього можна на вашому публічному профілі на сайті.`,
      { authorReviewId: data.id as string }
    );
  }
}

export async function deleteAuthorReview(reviewId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("author_reviews").delete().eq("id", reviewId);
  if (error) throw error;
}

export type AuthorReviewSummary = {
  average: number;
  count: number;
};

// Used by AuthorProfile.tsx to show a rating summary. Publicly readable
// (see schema.sql's "author reviews are publicly readable" policy), so
// this works for any author id, not just the signed-in one.
export async function fetchAuthorReviewSummary(authorId: string): Promise<AuthorReviewSummary> {
  const client = requireSupabase();
  const { data: rows, error } = await client
    .from("author_reviews")
    .select("rating")
    .eq("author_id", authorId);
  if (error || !rows || rows.length === 0) return { average: 0, count: 0 };
  const sum = rows.reduce((acc, r) => acc + r.rating, 0);
  return { average: sum / rows.length, count: rows.length };
}
