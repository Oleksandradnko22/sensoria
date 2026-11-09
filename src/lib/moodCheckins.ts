// Read-side persistence for the (now removed, 2026-09-28) lesson-level
// "Як ви себе почуваєте зараз?" before/after wellbeing scale — see
// supabase/schema.sql's content_item_mood_checkins. The in-lesson
// before/after UI and its write functions (fetchMoodCheckIn,
// submitMoodBefore, submitMoodAfter) were removed from
// ProgramExperience.tsx per Sasha's explicit call, so nothing writes
// new rows to this table anymore — but existing historical rows are
// still real data, still shown in "Ваші спостереження"
// (ParticipantReflections.tsx) and in the program-level average panel
// (fetchMoodAverageForProgram, still used by ProgramExperience.tsx's
// "Ваш результат" summary), so those read functions stay.

import { supabase } from "./supabaseClient.ts";
import { notifyObservationsChanged } from "../utils/observationsSignal.ts";

// The full saved record, as shown in "Ваші спостереження" — the
// denormalized program/item titles the history page needs to say what
// each pair was actually about.
export type MoodCheckInRecord = {
  id: string;
  contentItemId: string;
  programId: string | null;
  programTitle: string | null;
  itemTitle: string | null;
  beforeValue: number | null;
  afterValue: number | null;
  updatedAt: string | null;
  createdAt: string;
};

type MoodCheckInRow = {
  id: string;
  content_item_id: string;
  program_id: string | null;
  program_title: string | null;
  item_title: string | null;
  before_value: number | null;
  after_value: number | null;
  updated_at: string | null;
  created_at: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

function fromRow(row: MoodCheckInRow): MoodCheckInRecord {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    programId: row.program_id,
    programTitle: row.program_title,
    itemTitle: row.item_title,
    beforeValue: row.before_value,
    afterValue: row.after_value,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

// Every completed "Було ... Стало ..." pair this person has, across
// every program — what "Ваші спостереження" renders. Deliberately only
// pairs with both values set (an in-progress "before only" row isn't a
// result yet, nothing to show in a history of outcomes).
export async function fetchAllMoodCheckIns(userId: string, opts: { strict?: boolean } = {}): Promise<MoodCheckInRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_item_mood_checkins")
    .select(
      "id, content_item_id, program_id, program_title, item_title, before_value, after_value, updated_at, created_at"
    )
    .eq("user_id", userId)
    .not("before_value", "is", null)
    .not("after_value", "is", null)
    .order("updated_at", { ascending: false });
  if (error && opts.strict) throw error;
  if (error || !data) return [];
  return (data as MoodCheckInRow[]).map(fromRow);
}

export type MoodProgramAverage = { before: number; after: number; count: number };

// Averaged before/after for one program — feeds the program overview's
// "richer than a bare %" progress panel. Only completed pairs count
// (same reasoning as fetchAllMoodCheckIns above); null when there are
// none yet, so the panel can just omit this line rather than showing a
// meaningless "0/10 → 0/10".
export async function fetchMoodAverageForProgram(
  programId: string,
  userId: string
): Promise<MoodProgramAverage | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_item_mood_checkins")
    .select("before_value, after_value")
    .eq("program_id", programId)
    .eq("user_id", userId)
    .not("before_value", "is", null)
    .not("after_value", "is", null);
  if (error || !data || data.length === 0) return null;
  const rows = data as { before_value: number; after_value: number }[];
  const before = rows.reduce((sum, r) => sum + r.before_value, 0) / rows.length;
  const after = rows.reduce((sum, r) => sum + r.after_value, 0) / rows.length;
  return { before, after, count: rows.length };
}

// Removes one historical before/after pair from "Ваші спостереження".
export async function deleteMoodCheckInById(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase не налаштований.");
  const { error } = await supabase.from("content_item_mood_checkins").delete().eq("id", id);
  if (error) throw error;
  notifyObservationsChanged();
}
