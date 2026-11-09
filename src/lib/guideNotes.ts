// Real persistence for a guide's free-text "note" blocks (2026-09-09,
// per Sasha's explicit spec — "Поле для замітки... це зберігається в
// його акаунті"; see supabase/schema.sql's guide_notes). One row per
// person+guide+block, upserted in place — saving again overwrites the
// previous text rather than keeping history.

import { supabase } from "./supabaseClient.ts";
import { notifySavedChanged } from "../utils/savedSignal.ts";

export type GuideNote = {
  id: string;
  guideId: string;
  blockIndex: number;
  noteText: string;
  updatedAt: string;
};

type GuideNoteRow = {
  id: string;
  guide_id: string;
  block_index: number;
  note_text: string;
  updated_at: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

const SELECT_COLUMNS = "id, guide_id, block_index, note_text, updated_at";

function fromRow(row: GuideNoteRow): GuideNote {
  return {
    id: row.id,
    guideId: row.guide_id,
    blockIndex: row.block_index,
    noteText: row.note_text,
    updatedAt: row.updated_at,
  };
}

// Every note already written for this guide — what GuideBlockRenderer
// reads on mount to pre-fill each note textarea.
export async function fetchNotesForGuide(guideId: string, userId: string): Promise<GuideNote[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("guide_notes")
    .select(SELECT_COLUMNS)
    .eq("guide_id", guideId)
    .eq("user_id", userId);
  if (error || !data) {
    // eslint-disable-next-line no-console
    if (error) console.error("Не вдалося завантажити замітки гайду:", error);
    return [];
  }
  return (data as GuideNoteRow[]).map(fromRow);
}

// Every note this person has ever written, across every guide
// (2026-09-09, per Sasha's explicit spec — notes are one of the five
// kinds of item that make up the unified "Збережене" library, see
// ParticipantSaved.tsx). Blank notes aren't filtered out here — a
// note emptied back out via GuideBlockRenderer's textarea still
// upserts in place, so this stays a faithful read of what's actually
// stored; ParticipantSaved does its own trim-and-skip before display.
export async function fetchAllNotesForUser(userId: string, opts: { strict?: boolean } = {}): Promise<GuideNote[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("guide_notes")
    .select(SELECT_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error || !data) {
    // eslint-disable-next-line no-console
    if (error) console.error("Не вдалося завантажити всі замітки:", error);
    if (error && opts.strict) throw error;
    return [];
  }
  return (data as GuideNoteRow[]).map(fromRow);
}

export async function saveGuideNote(params: {
  guideId: string;
  blockIndex: number;
  noteText: string;
  userId: string;
}): Promise<GuideNote> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("guide_notes")
    .upsert(
      {
        guide_id: params.guideId,
        block_index: params.blockIndex,
        note_text: params.noteText,
        user_id: params.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "guide_id,block_index,user_id" }
    )
    .select(SELECT_COLUMNS)
    .single();
  if (error || !data) throw error ?? new Error("Не вдалося зберегти замітку.");
  notifySavedChanged();
  return fromRow(data as GuideNoteRow);
}
