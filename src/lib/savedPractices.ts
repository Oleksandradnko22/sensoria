// Real persistence for "Моя практика" — the audio/video tools a person
// chooses to keep using after finishing a course (see
// supabase/schema.sql's content_item_saved_practices). A plain toggle,
// same shape as lib/bookmarks.ts (saved means a row exists, unsaved
// means it's deleted) — but a different concept: a bookmark is "take
// me back to this lesson", offered during any lesson; this is "this is
// a tool I keep using", offered specifically at course completion (see
// ProgramExperience.tsx's "Що хочете залишити собі?" checklist). Same
// content_item_id-is-plain-text limitation as lib/bookmarks.ts.
//
// `kind` (2026-08-28, per Sasha's explicit call): the exact same "tool
// I keep using" concept now also covers a meditation's own ♡ Зберегти
// on its completed screen (MeditationExperience.tsx) — a full session,
// not a lesson-within-a-course. programId/programTitle stay null for
// those; contentItemId holds the meditation's own id.

import { supabase } from "./supabaseClient.ts";
import { notifySavedChanged } from "../utils/savedSignal.ts";

export type SavedPracticeKind = "program" | "meditation";

export type SavedPractice = {
  id: string;
  contentItemId: string;
  kind: SavedPracticeKind;
  programId: string | null;
  programTitle: string | null;
  itemTitle: string | null;
  createdAt: string;
};

type SavedPracticeRow = {
  id: string;
  content_item_id: string;
  kind: SavedPracticeKind;
  program_id: string | null;
  program_title: string | null;
  item_title: string | null;
  created_at: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

function fromRow(row: SavedPracticeRow): SavedPractice {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    kind: row.kind,
    programId: row.program_id,
    programTitle: row.program_title,
    itemTitle: row.item_title,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS = "id, content_item_id, kind, program_id, program_title, item_title, created_at";

// Every saved practice this person has, across every program — what
// "Моя практика" renders.
export async function fetchAllSavedPractices(userId: string, opts: { strict?: boolean } = {}): Promise<SavedPractice[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_item_saved_practices")
    .select(SELECT_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error && opts.strict) throw error;
  if (error || !data) return [];
  return (data as SavedPracticeRow[]).map(fromRow);
}

// Just this program's saved practices — feeds the completion screen's
// checklist (ProgramExperience.tsx builds one Map<itemId, SavedPractice>
// from this, same pattern as its bookmarksById).
export async function fetchSavedPracticesForProgram(
  programId: string,
  userId: string
): Promise<SavedPractice[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_item_saved_practices")
    .select(SELECT_COLUMNS)
    .eq("program_id", programId)
    .eq("user_id", userId);
  if (error || !data) return [];
  return (data as SavedPracticeRow[]).map(fromRow);
}

// Just whether ONE item (a meditation, typically) is already saved —
// what the ♡ Зберегти toggle on MeditationExperience's completed
// screen needs, same single-lookup shape as lib/bookmarks.ts's
// fetchBookmark.
export async function fetchSavedPractice(itemId: string, userId: string): Promise<SavedPractice | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_item_saved_practices")
    .select(SELECT_COLUMNS)
    .eq("content_item_id", itemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return fromRow(data as SavedPracticeRow);
}

export async function addSavedPractice(params: {
  itemId: string;
  userId: string;
  // Defaults to "program" — every existing call site (ProgramExperience's
  // "Що хочете залишити собі?") keeps working unchanged.
  kind?: SavedPracticeKind;
  programId?: string;
  programTitle?: string;
  itemTitle?: string;
}): Promise<SavedPractice> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_item_saved_practices")
    .upsert(
      {
        content_item_id: params.itemId,
        user_id: params.userId,
        kind: params.kind ?? "program",
        program_id: params.programId ?? null,
        program_title: params.programTitle ?? null,
        item_title: params.itemTitle ?? null,
      },
      { onConflict: "content_item_id,user_id" }
    )
    .select(SELECT_COLUMNS)
    .single();
  if (error || !data) throw error ?? new Error("Не вдалося зберегти практику.");
  notifySavedChanged();
  return fromRow(data as SavedPracticeRow);
}

export async function removeSavedPractice(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("content_item_saved_practices").delete().eq("id", id);
  if (error) throw error;
  notifySavedChanged();
}
