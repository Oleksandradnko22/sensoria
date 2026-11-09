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
    ? await client.from("profiles").select("id, name, email").in("id", userIds)
    : { data: [] as { id: string; name: string; email: string }[] };
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
      email: profile?.email ?? "",
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

  const [practiceResult, reflectionResult, moodResult, feedbackResult] = await Promise.all([
    client
      .from("content_item_practice_responses")
      .select("id", { count: "exact", head: true })
      .eq("program_id", programId)
      .eq("user_id", userId),
    client
      .from("content_item_reflections")
      .select("id", { count: "exact", head: true })
      .eq("program_id", programId)
      .eq("user_id", userId),
    client
      .from("content_item_mood_checkins")
      .select("before_value, after_value")
      .eq("program_id", programId)
      .eq("user_id", userId)
      .not("before_value", "is", null)
      .not("after_value", "is", null),
    itemIds.length > 0
      ? client
          .from("content_item_feedback")
          .select("is_helpful")
          .eq("user_id", userId)
          .in("content_item_id", itemIds)
      : Promise.resolve({ data: [] as { is_helpful: boolean }[], error: null }),
  ]);

  const moodRows = (moodResult.data ?? []) as { before_value: number; after_value: number }[];
  const moodAverage =
    moodRows.length > 0
      ? {
          before: moodRows.reduce((sum, r) => sum + r.before_value, 0) / moodRows.length,
          after: moodRows.reduce((sum, r) => sum + r.after_value, 0) / moodRows.length,
          count: moodRows.length,
        }
      : null;

  const feedbackRows = (feedbackResult.data ?? []) as { is_helpful: boolean }[];

  return {
    practiceResponsesCount: practiceResult.count ?? 0,
    reflectionsCount: reflectionResult.count ?? 0,
    moodAverage,
    feedbackHelpfulCount: feedbackRows.filter((r) => r.is_helpful).length,
    feedbackNotHelpfulCount: feedbackRows.filter((r) => !r.is_helpful).length,
  };
}
