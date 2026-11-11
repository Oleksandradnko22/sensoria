// Real "Учасники" data for an author's own (non-demo) content —
// replaces the static mock list in data/authorDashboard.ts, and the
// per-participant "how did this actually go for them" summary shown
// when a row is expanded. Both read through the additive author-scoped
// SELECT policies added alongside this file (see
// supabase/schema.sql / author-participant-read-policies-migration.sql).
//
// "Participant" here honestly means "someone with a content_progress
// row for this content" — real purchases aren't wired to real content
// yet (see schema.sql's purchases table comment), so there is no
// "enrolled" signal to use instead. This undercounts in one direction
// (someone who bought but never opened anything won't show up) and
// never overcounts (nobody shows up here who hasn't actually engaged),
// which reads truer than inventing an enrollment date that doesn't
// exist.
//
// Reflection/practice TEXT is deliberately never surfaced here — only
// counts and averages. Per Sasha's explicit call (2026-08-27): a
// person's own reflections are a private journal, not something an
// author should be able to read verbatim just because they authored
// the program it was written against.

import { supabase } from "./supabaseClient.ts";
import { fetchProgramItems } from "./publicContent.ts";
import type { ContentModule, ItemProgressMap } from "../data/contentTypes.ts";
import { computeProgress } from "./contentProgress.ts";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

export type ParticipantActivitySegment = "new" | "active" | "inactive";

export type AuthorParticipant = {
  userId: string;
  contentId: string;
  name: string;
  email: string;
  progressPercent: number;
  isCompleted: boolean;
  lastActiveAt: string;
  segment: ParticipantActivitySegment;
};

// Recency-only heuristic (no streaks/comparison, same "без
// конкурентного трекінгу" spirit as the rest of the app) — "new" means
// barely started and touched very recently, "inactive" means it's been
// a while and they never finished, "active" is everything in between,
// including anyone who already completed it.
function segmentFor(percent: number, isCompleted: boolean, lastActiveAt: string): ParticipantActivitySegment {
  const daysSince = (Date.now() - new Date(lastActiveAt).getTime()) / 86_400_000;
  if (!isCompleted && percent <= 15 && daysSince <= 3) return "new";
  if (!isCompleted && daysSince > 21) return "inactive";
  return "active";
}

// One row per (content, person) who has ever made progress on it —
// across every real program/guide/meditation id passed in. Modules are
// fetched once per distinct content id (not once per row) to compute an
// honest percent via the same computeProgress engine
// ProgramExperience.tsx itself uses, rather than trusting a
// client-reported number.
export async function fetchRealParticipants(contentIds: string[]): Promise<AuthorParticipant[]> {
  if (contentIds.length === 0) return [];
  const client = requireSupabase();

  const { data: rows, error } = await client
    .from("content_progress")
    .select("content_id, user_id, progress, updated_at")
    .in("content_id", contentIds);
  if (error || !rows || rows.length === 0) return [];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profileRows } = userIds.length
    ? await client.from("profiles").select("id, name").in("id", userIds)
    : { data: [] as { id: string; name: string }[] };
  const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));

  const distinctContentIds = Array.from(new Set(rows.map((r) => r.content_id)));
  const modulesByContent = new Map<string, ContentModule[] | null>();
  await Promise.all(
    distinctContentIds.map(async (id) => {
      modulesByContent.set(id, await fetchProgramItems(id));
    })
  );

  return rows.map((row) => {
    const modules = modulesByContent.get(row.content_id) ?? null;
    const summary = modules ? computeProgress(modules, (row.progress as ItemProgressMap) ?? {}) : null;
    const profile = profileById.get(row.user_id);
    const percent = summary?.percent ?? 0;
    const isCompleted = summary?.isCompleted ?? false;
    return {
      userId: row.user_id,
      contentId: row.content_id,
      name: profile?.name ?? "Учасник Sensoria",
      // an author never gets a participant's email: contact goes through «Повідомлення»
      email: "",
      progressPercent: percent,
      isCompleted,
      lastActiveAt: row.updated_at,
      segment: segmentFor(percent, isCompleted, row.updated_at),
    };
  });
}

export type ParticipantEngagementSummary = {
  practiceResponsesCount: number;
  reflectionsCount: number;
  moodAverage: { before: number; after: number; count: number } | null;
  feedbackHelpfulCount: number;
  feedbackNotHelpfulCount: number;
};

// modules is whatever fetchRealParticipants (or the caller) already
// has in hand for this content — reused here only to get the real item
// ids for the content_item_feedback lookup (that table has no
// program_id column of its own, see its schema.sql comment), not
// re-fetched.
export async function fetchParticipantEngagement(
  programId: string,
  userId: string,
  modules: ContentModule[] | null
): Promise<ParticipantEngagementSummary> {
  const client = requireSupabase();

  const itemIds = modules ? modules.flatMap((m) => m.items.map((it) => it.id)) : [];

  // a person's practice answers and reflections are their private journal: the author only gets how many there are
  const [countsResult, feedbackResult] = await Promise.all([
    client.rpc("author_engagement_counts", { p_program: programId, p_user: userId }),
    itemIds.length > 0
      ? client
          .from("content_item_feedback")
          .select("is_helpful")
          .eq("user_id", userId)
          .in("content_item_id", itemIds)
      : Promise.resolve({ data: [] as { is_helpful: boolean }[], error: null }),
  ]);

  // individual state marks are not readable by the author any more: only averages (author_mood_by_content)
  const moodAverage = null;

  const countsRow = Array.isArray(countsResult.data) ? countsResult.data[0] : countsResult.data;
  const counts = (countsResult.error ? null : countsRow) as { practice_count?: number; reflection_count?: number } | null;
  const feedbackRows = (feedbackResult.data ?? []) as { is_helpful: boolean }[];

  return {
    practiceResponsesCount: Number(counts?.practice_count) || 0,
    reflectionsCount: Number(counts?.reflection_count) || 0,
    moodAverage,
    feedbackHelpfulCount: feedbackRows.filter((r) => r.is_helpful).length,
    feedbackNotHelpfulCount: feedbackRows.filter((r) => !r.is_helpful).length,
  };
}

// ── database-side functions (supabase/author-participants-functions.sql) ───────────────────────────────────────

export type ParticipantSegmentKey = "new" | "active" | "inactive";
export type PageItem = { contentId: string; percent: number; lastActive: string; segment: ParticipantSegmentKey };
export type PagePerson = { userId: string; name: string; lastActive: string; segment: ParticipantSegmentKey; items: PageItem[] };
export type ParticipantsPage = { total: number; active7: number; finished: number; matching: number; people: PagePerson[] };
export type ParticipantsQuery = { search?: string; contentId?: string | null; segment?: ParticipantSegmentKey | null; sort?: "recent" | "name" | "new" | "inactive"; limit: number; offset: number };

// One page of the author's participants (unique people, every kind of material), with the overall counts.
export async function fetchParticipantsPage(q: ParticipantsQuery): Promise<ParticipantsPage> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("author_participants", {
    p_search: q.search?.trim() || null,
    p_content: q.contentId && /^[0-9a-f-]{36}$/i.test(q.contentId) ? q.contentId : null,
    p_segment: q.segment ?? null,
    p_sort: q.sort ?? "recent",
    p_limit: q.limit,
    p_offset: q.offset,
  });
  if (error) throw error;
  const d = (data ?? {}) as { total?: number; active7?: number; finished?: number; matching?: number; people?: { user_id: string; name: string; last_active: string; segment: ParticipantSegmentKey; items: { content_id: string; percent: number; last_active: string; segment: ParticipantSegmentKey }[] }[] };
  return {
    total: d.total ?? 0,
    active7: d.active7 ?? 0,
    finished: d.finished ?? 0,
    matching: d.matching ?? 0,
    people: (d.people ?? []).map((p) => ({
      userId: p.user_id,
      name: p.name,
      lastActive: p.last_active,
      segment: p.segment,
      items: (p.items ?? []).map((i) => ({ contentId: i.content_id, percent: i.percent, lastActive: i.last_active, segment: i.segment })),
    })),
  };
}

// Average state before → after per material, only where at least 3 people marked it (0–10, higher = calmer).
export async function fetchMoodByContent(contentIds: string[]): Promise<{ contentId: string; before: number; after: number; people: number }[]> {
  const ids = contentIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length === 0) return [];
  const client = requireSupabase();
  const { data, error } = await client.rpc("author_mood_by_content", { p_ids: ids });
  if (error || !Array.isArray(data)) return [];
  return (data as { content_id: string; avg_before: number; avg_after: number; people: number }[]).map((r) => ({ contentId: r.content_id, before: Number(r.avg_before), after: Number(r.avg_after), people: r.people }));
}
