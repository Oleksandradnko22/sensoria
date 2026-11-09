// Real persistence for reviews — the `reviews` table has existed since
// Stage 1, but nothing wrote to or read from it; both AuthorReviews.tsx
// and ParticipantReviews.tsx rendered mock arrays. Reviews aren't gated
// on an actual purchase existing (no such check in the RLS policies —
// see schema.sql), so this works today even before payments exist.

import { supabase } from "./supabaseClient.ts";
import { sendNotificationEmail } from "./notificationPrefs.ts";

export type ContentKind = "program" | "guide" | "meditation";

export type ReviewRow = {
  id: string;
  participantId: string;
  participantName: string;
  contentId: string;
  contentTitle: string;
  contentKind: ContentKind | null;
  authorName: string | null;
  rating: number;
  text: string;
  authorReply: string | null;
  createdAt: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

// Used by AuthorReviews.tsx — every review left on any of this author's
// real content, across courses.
export async function fetchReviewsForContentIds(contentIds: string[]): Promise<ReviewRow[]> {
  if (!contentIds.length) return [];
  const client = requireSupabase();
  const { data: rows, error } = await client
    .from("reviews")
    .select("id, participant_id, content_id, rating, text, author_reply, created_at")
    .in("content_id", contentIds)
    .order("created_at", { ascending: false });
  if (error || !rows) return [];

  const participantIds = Array.from(new Set(rows.map((r) => r.participant_id)));
  const { data: profiles } = participantIds.length
    ? await client.from("profiles").select("id, name").in("id", participantIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  const { data: contentRows } = await client.from("content").select("id, title").in("id", contentIds);
  const titleById = new Map((contentRows ?? []).map((c) => [c.id, c.title]));

  return rows.map((r) => ({
    id: r.id,
    participantId: r.participant_id,
    participantName: nameById.get(r.participant_id) ?? "Учасник Sensoria",
    contentId: r.content_id,
    contentTitle: titleById.get(r.content_id) ?? "",
    // Not needed on the author's own "who reviewed my content" list —
    // the author obviously already knows their own content's kind and
    // that they're the author — so these stay unfetched here rather
    // than adding two more queries this screen has no use for.
    contentKind: null,
    authorName: null,
    rating: r.rating,
    text: r.text,
    authorReply: r.author_reply,
    createdAt: r.created_at,
  }));
}

export type RatingSummary = { average: number; count: number };

// Lean real-rating aggregate for recommendation cards (2026-09-15, per
// Sasha's explicit "★ 4.9 · 128 оцінок, але тільки якщо дані реально
// є" spec) — a single `content_id, rating` query, no participant/content
// joins (unlike fetchReviewsForContentIds above, which fetches those for
// its own display needs). Returns nothing for a content id with zero
// real reviews rather than a fabricated "0.0 · 0 оцінок" — callers
// should simply not render a rating line when a given id has no entry
// here. Guards on `supabase` being unconfigured the same way
// hasAnyObservations/lib/emotionalProfile.ts does (empty result, not a
// thrown error) — this runs from a page render path, not a form submit.
export async function fetchRatingSummaryForContentIds(
  contentIds: string[]
): Promise<Record<string, RatingSummary>> {
  // reviews.content_id is a uuid: a catalog slug ("quick-grounding") in the list would make the whole query fail
  contentIds = contentIds.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  if (!contentIds.length || !supabase) return {};
  try {
    const { data: rows, error } = await supabase
      .from("reviews")
      .select("content_id, rating")
      .in("content_id", contentIds);
    if (error || !rows) return {};
    const byId = new Map<string, number[]>();
    for (const row of rows) {
      const list = byId.get(row.content_id) ?? [];
      list.push(row.rating);
      byId.set(row.content_id, list);
    }
    const summary: Record<string, RatingSummary> = {};
    for (const [id, ratings] of byId) {
      summary[id] = { average: ratings.reduce((a, b) => a + b, 0) / ratings.length, count: ratings.length };
    }
    return summary;
  } catch {
    return {};
  }
}

// Used by ParticipantReviews.tsx — everything this participant has
// personally written, enriched with what kind of content it was and
// who the author is (both needed for the "Програма · Андрій Коваленко"
// subline and for routing "Відкрити" to the right catalog page).
export async function fetchMyReviews(participantId: string, opts: { strict?: boolean } = {}): Promise<ReviewRow[]> {
  const client = requireSupabase();
  const { data: rows, error } = await client
    .from("reviews")
    .select("id, content_id, rating, text, author_reply, created_at")
    .eq("participant_id", participantId)
    .order("created_at", { ascending: false });
  if (error && opts.strict) throw error;
  if (error || !rows) return [];

  const contentIds = Array.from(new Set(rows.map((r) => r.content_id)));
  const { data: contentRows } = contentIds.length
    ? await client.from("content").select("id, title, kind, author_id").in("id", contentIds)
    : { data: [] as { id: string; title: string; kind: ContentKind; author_id: string }[] };

  const contentById = new Map((contentRows ?? []).map((c) => [c.id, c]));
  const authorIds = Array.from(new Set((contentRows ?? []).map((c) => c.author_id)));
  const { data: authorRows } = authorIds.length
    ? await client.from("profiles").select("id, name").in("id", authorIds)
    : { data: [] as { id: string; name: string }[] };
  const authorNameById = new Map((authorRows ?? []).map((a) => [a.id, a.name]));

  return rows.map((r) => {
    const content = contentById.get(r.content_id);
    return {
      id: r.id,
      participantId,
      participantName: "",
      contentId: r.content_id,
      contentTitle: content?.title ?? "",
      contentKind: content?.kind ?? null,
      authorName: content ? authorNameById.get(content.author_id) ?? null : null,
      rating: r.rating,
      text: r.text,
      authorReply: r.author_reply,
      createdAt: r.created_at,
    };
  });
}

// RLS already permits this ("participants manage their own reviews" is
// `for all`, i.e. select/insert/update/delete) — no schema change
// needed, just the client call nothing was making yet.
export async function deleteReview(reviewId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("reviews").delete().eq("id", reviewId);
  if (error) throw error;
}

// One review per (participant, content) — the table's real unique
// constraint. Writing a review for content you've already reviewed
// edits it in place rather than erroring, which is exactly the
// "Редагувати" flow ParticipantReviews.tsx already offers.
export async function upsertReview(params: {
  participantId: string;
  contentId: string;
  rating: number;
  text: string;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("reviews").upsert(
    {
      participant_id: params.participantId,
      content_id: params.contentId,
      rating: params.rating,
      text: params.text,
    },
    { onConflict: "participant_id,content_id" }
  );
  if (error) throw error;
}

export async function replyToReview(params: {
  reviewId: string;
  reply: string;
  // Both already sitting in the caller's own state (AuthorReviews.tsx
  // already fetched the review with these on it) — passing them
  // through here is one field each, versus an extra round trip to
  // re-fetch what's already on screen.
  participantId: string;
  contentTitle: string;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("reviews")
    .update({ author_reply: params.reply })
    .eq("id", params.reviewId);
  if (error) throw error;

  sendNotificationEmail(
    params.participantId,
    "reply",
    "Автор відповів на ваш відгук",
    `Автор відповів на ваш відгук про «${params.contentTitle}» на Sensoria:\n\n«${params.reply}»\n\nПереглянути відгук можна у своєму кабінеті на сайті.`,
    // Lets the Edge Function verify this reviewId genuinely belongs to
    // a review authored-on-content-by-this-caller and addressed to
    // this recipient before it sends anything (2026-08-30 security
    // fix) — see that function's own comment.
    { reviewId: params.reviewId }
  );
}
