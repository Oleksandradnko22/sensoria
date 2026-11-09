// Server-side mirror of utils/demoProgressStore.ts's localStorage
// progress map (see supabase/schema.sql's content_progress). Deliberately
// NOT a replacement for localStorage — that stays the instant, synchronous
// source every existing reader (ParticipantLearning, ParticipantOverview,
// ProgramDetailPage, ProgramExperience itself) already relies on.
// This is a write-through + merge-on-open layer around it: every local
// change also gets pushed here (fire-and-forget), and opening a program
// pulls the server copy and merges it into localStorage, so progress
// made on one device shows up on another instead of silently resetting.

import { supabase } from "./supabaseClient.ts";
import type { ItemProgressMap } from "../data/contentTypes.ts";
export { mergeProgress } from "./mergeProgress.ts";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

export async function fetchServerProgress(contentId: string, userId: string): Promise<ItemProgressMap | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_progress")
    .select("progress")
    .eq("content_id", contentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return (data.progress as ItemProgressMap) ?? {};
}

const VALID_ITEM_STATUSES = new Set(["not_started", "in_progress", "completed", "skipped"]);

// Guards fetchAllProgress below against a corrupt/unexpected server row —
// jsonb has no schema, so nothing stops a row from containing something
// that isn't actually an ItemProgressMap (a stray null, an array, a
// value that isn't one of the four real statuses). A malformed row is
// SKIPPED, not silently coerced to `{}` — treating garbage as "real,
// empty progress" would be its own kind of fabrication (an honest {}
// means "genuinely never touched"; a row that exists but doesn't parse
// means something is actually wrong and shouldn't be read as either).
function isValidItemProgressMap(value: unknown): value is ItemProgressMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (status) => typeof status === "string" && VALID_ITEM_STATUSES.has(status)
  );
}

export type ProgramProgressRow = {
  progress: ItemProgressMap;
  updatedAt: string;
};

// Bulk per-participant progress fetch — one query for EVERY program this
// person has touched, not one query per program (see lib/guideSaves.ts's
// fetchAllSavedGuides / lib/programSaves.ts's fetchAllSavedPrograms /
// lib/guideSectionViews.ts's fetchAllSectionViews for the exact same
// established shape this mirrors). This is what lets "Моє навчання"
// build real program membership without an N+1 read — see
// lib/programParticipation.ts, the only consumer.
export async function fetchAllProgress(userId: string): Promise<Record<string, ProgramProgressRow>> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_progress")
    .select("content_id, progress, updated_at")
    .eq("user_id", userId);
  if (error || !data) {
    if (error) {
      // eslint-disable-next-line no-console
      console.error("Не вдалося завантажити прогрес програм:", error.message);
    }
    return {};
  }
  const result: Record<string, ProgramProgressRow> = {};
  for (const row of data as { content_id: string; progress: unknown; updated_at: string }[]) {
    if (!isValidItemProgressMap(row.progress)) {
      // eslint-disable-next-line no-console
      console.error(`Пошкоджені дані прогресу для ${row.content_id} — пропущено.`);
      continue;
    }
    result[row.content_id] = { progress: row.progress, updatedAt: row.updated_at };
  }
  return result;
}

export function pushServerProgress(contentId: string, userId: string, progress: ItemProgressMap): void {
  if (!supabase) return;
  supabase
    .from("content_progress")
    .upsert(
      {
        content_id: contentId,
        user_id: userId,
        progress,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "content_id,user_id" }
    )
    .then(({ error }) => {
      if (error) {
        // Non-critical — localStorage already reflects the change, this
        // is only the cross-device copy. Same fire-and-forget reasoning
        // as touchDeviceSession.
        // eslint-disable-next-line no-console
        console.error("Не вдалося синхронізувати прогрес:", error.message);
      }
    });
}
