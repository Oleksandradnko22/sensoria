// Real persistence for "Зберегти програму" — a person bookmarking a
// program themselves from the dashboard (see supabase/schema.sql's
// program_saved_for_later), independent of enrollment/progress. Exact
// mirror of lib/guideSaves.ts's shape — a plain toggle: saved means a
// row exists, unsaved means it's deleted. program_id is plain text —
// most programs live in data/programs.ts, not exclusively a real table.

import { supabase } from "./supabaseClient.ts";
import { notifySavedChanged } from "../utils/savedSignal.ts";

export type SavedProgram = {
  id: string;
  programId: string;
  programTitle: string | null;
  createdAt: string;
};

type SavedProgramRow = {
  id: string;
  program_id: string;
  program_title: string | null;
  created_at: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

function fromRow(row: SavedProgramRow): SavedProgram {
  return {
    id: row.id,
    programId: row.program_id,
    programTitle: row.program_title,
    createdAt: row.created_at,
  };
}

// Every program this person has saved — what ParticipantLearning reads
// on mount to know which cards should show the real ★ toggle as active,
// and what "Збережені" actually filters on.
export async function fetchAllSavedPrograms(userId: string): Promise<SavedProgram[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("program_saved_for_later")
    .select("id, program_id, program_title, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[programSaves] fetchAll failed", error);
  }
  if (error || !data) return [];
  return (data as SavedProgramRow[]).map(fromRow);
}

const SELECT_COLUMNS = "id, program_id, program_title, created_at";

// Plain insert, not upsert — same reasoning as lib/guideSaves.ts's
// addSavedGuide. A duplicate save (23505, the program_id+user_id unique
// constraint) isn't treated as a failure — it means the program was
// already saved, so this just fetches and returns that existing row
// instead of surfacing an error for what the person experiences as a
// normal, harmless double-click.
export async function addSavedProgram(params: {
  programId: string;
  programTitle?: string;
  userId: string;
}): Promise<SavedProgram> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("program_saved_for_later")
    .insert({
      program_id: params.programId,
      program_title: params.programTitle ?? null,
      user_id: params.userId,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[programSaves] insert failed", error);
    if (error.code === "23505") {
      const { data: existing, error: fetchError } = await client
        .from("program_saved_for_later")
        .select(SELECT_COLUMNS)
        .eq("program_id", params.programId)
        .eq("user_id", params.userId)
        .single();
      if (!fetchError && existing) return fromRow(existing as SavedProgramRow);
    }
    throw error;
  }
  if (!data) throw new Error("Не вдалося зберегти програму.");
  notifySavedChanged(); // «Збережене» re-reads at once
  return fromRow(data as SavedProgramRow);
}

export async function removeSavedProgram(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("program_saved_for_later").delete().eq("id", id);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[programSaves] delete failed", error);
    throw error;
  }
  notifySavedChanged();
}
