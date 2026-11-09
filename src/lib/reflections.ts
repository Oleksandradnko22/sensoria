// Real persistence for "Що я помітив? Що змінилося?" — the personal
// observation journal attached to a lesson (see supabase/schema.sql's
// content_item_reflections for the full reasoning). Unlike
// lib/practiceResponses.ts (one current answer per item+person,
// overwritten on re-answer), this is append-only: every save is a new
// row, since the whole point is a running history the person can look
// back over later in "Ваші спостереження" (ParticipantReflections.tsx),
// not a single current state. Same content_item_id-is-plain-text, no
// author-read-path-yet limitation as lib/itemFeedback.ts and
// lib/lessonComments.ts.

import { supabase } from "./supabaseClient.ts";
import { notifyObservationsChanged } from "../utils/observationsSignal.ts";

export type Reflection = {
  id: string;
  contentItemId: string;
  programId: string | null;
  programTitle: string | null;
  itemTitle: string | null;
  note: string;
  createdAt: string;
};

type ReflectionRow = {
  id: string;
  content_item_id: string;
  program_id: string | null;
  program_title: string | null;
  item_title: string | null;
  note: string;
  created_at: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

function fromRow(row: ReflectionRow): Reflection {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    programId: row.program_id,
    programTitle: row.program_title,
    itemTitle: row.item_title,
    note: row.note,
    createdAt: row.created_at,
  };
}

// This lesson's own past notes — shown right under the "Зберегти
// нотатку" form so saving one feels like adding to something, not
// shouting into a void.
export async function fetchReflectionsForItem(itemId: string, userId: string): Promise<Reflection[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_item_reflections")
    .select("id, content_item_id, program_id, program_title, item_title, note, created_at")
    .eq("content_item_id", itemId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as ReflectionRow[]).map(fromRow);
}

// Every reflection this person has ever saved, across every program —
// what the "Ваші спостереження" history page renders.
export async function fetchAllReflections(userId: string, opts: { strict?: boolean } = {}): Promise<Reflection[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_item_reflections")
    .select("id, content_item_id, program_id, program_title, item_title, note, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error && opts.strict) throw error;
  if (error || !data) return [];
  return (data as ReflectionRow[]).map(fromRow);
}

// Just the count for one program — feeds the program overview's
// "richer than a bare %" progress panel (ProgramExperience.tsx). A
// plain count query rather than fetching+measuring full rows, since
// the overview only ever needs the number.
export async function countReflectionsForProgram(programId: string, userId: string): Promise<number> {
  const client = requireSupabase();
  const { count, error } = await client
    .from("content_item_reflections")
    .select("id", { count: "exact", head: true })
    .eq("program_id", programId)
    .eq("user_id", userId);
  if (error || count == null) return 0;
  return count;
}

export async function submitReflection(params: {
  itemId: string;
  userId: string;
  programId?: string;
  programTitle?: string;
  itemTitle?: string;
  note: string;
}): Promise<Reflection> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_item_reflections")
    .insert({
      content_item_id: params.itemId,
      user_id: params.userId,
      program_id: params.programId ?? null,
      program_title: params.programTitle ?? null,
      item_title: params.itemTitle ?? null,
      note: params.note,
    })
    .select("id, content_item_id, program_id, program_title, item_title, note, created_at")
    .single();
  if (error || !data) throw error ?? new Error("Не вдалося зберегти нотатку.");
  notifyObservationsChanged();
  return fromRow(data as ReflectionRow);
}

// Lets someone remove a note they regret writing down — these are
// private observations, not a public record, so there's no reason to
// force them to live forever once saved.
export async function deleteReflection(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("content_item_reflections").delete().eq("id", id);
  if (error) throw error;
  notifyObservationsChanged();
}
