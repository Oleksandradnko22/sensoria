// Real "останні події" feed for AuthorOverview.tsx — assembled
// client-side from four real tables (messages received, reviews on
// real content, author-level reviews, recently published content)
// rather than one dedicated activity-log table, since none exists yet
// and each of these already has its own real timestamp to sort by.
// Purchase-type events are deliberately absent — there's no way for
// one to be real until payments exist.

import { supabase } from "./supabaseClient.ts";

export type ActivityEvent = {
  id: string;
  type: "review" | "message" | "content";
  text: string;
  date: string;
};

function requireSupabase() {
  if (!supabase) return null;
  return supabase;
}

export async function fetchRecentActivity(
  authorId: string,
  realContentIds: string[]
): Promise<ActivityEvent[]> {
  const client = requireSupabase();
  if (!client) return [];

  const [{ data: messageRows }, { data: reviewRows }, { data: authorReviewRows }, { data: contentRows }] =
    await Promise.all([
      client
        .from("messages")
        .select("id, sender_id, created_at")
        .eq("recipient_id", authorId)
        .order("created_at", { ascending: false })
        .limit(5),
      realContentIds.length
        ? client
            .from("reviews")
            .select("id, participant_id, content_id, rating, created_at")
            .in("content_id", realContentIds)
            .order("created_at", { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] as { id: string; participant_id: string; content_id: string; rating: number; created_at: string }[] }),
      client
        .from("author_reviews")
        .select("id, participant_id, rating, created_at")
        .eq("author_id", authorId)
        .order("created_at", { ascending: false })
        .limit(5),
      realContentIds.length
        ? client
            .from("content")
            .select("id, title, updated_at")
            .in("id", realContentIds)
            .eq("status", "published")
            .order("updated_at", { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] as { id: string; title: string; updated_at: string }[] }),
    ]);

  const senderIds = Array.from(new Set((messageRows ?? []).map((r) => r.sender_id)));
  const participantIds = Array.from(new Set((reviewRows ?? []).map((r) => r.participant_id)));
  const peopleIds = Array.from(new Set([...senderIds, ...participantIds]));
  const { data: profiles } = peopleIds.length
    ? await client.from("profiles").select("id, name").in("id", peopleIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  const reviewContentIds = Array.from(new Set((reviewRows ?? []).map((r) => r.content_id)));
  const { data: reviewContentRows } = reviewContentIds.length
    ? await client.from("content").select("id, title").in("id", reviewContentIds)
    : { data: [] as { id: string; title: string }[] };
  const titleById = new Map((reviewContentRows ?? []).map((c) => [c.id, c.title]));

  const events: ActivityEvent[] = [
    ...(messageRows ?? []).map((m) => ({
      id: `msg-${m.id}`,
      type: "message" as const,
      text: `Нове повідомлення від ${nameById.get(m.sender_id) ?? "учасника"}`,
      date: m.created_at,
    })),
    ...(reviewRows ?? []).map((r) => ({
      id: `rev-${r.id}`,
      type: "review" as const,
      text: `Новий відгук на «${titleById.get(r.content_id) ?? ""}» — ${r.rating}★`,
      date: r.created_at,
    })),
    ...(authorReviewRows ?? []).map((r) => ({
      id: `arev-${r.id}`,
      type: "review" as const,
      text: `Новий відгук про вас — ${r.rating}★`,
      date: r.created_at,
    })),
    ...(contentRows ?? []).map((c) => ({
      id: `pub-${c.id}`,
      type: "content" as const,
      text: `Опубліковано «${c.title}»`,
      date: c.updated_at,
    })),
  ];

  return events.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
}
