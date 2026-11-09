// "Як ви почуваєтесь зараз?" — optional before/after tension check
// around a meditation session (see supabase/schema.sql's
// meditation_mood_checkins). Unlike lib/moodCheckins.ts (one row per
// lesson item, overwritten forever), this is one row PER SESSION —
// meditations are reusable, so every fresh start gets its own
// before/after pair instead of erasing the last one. `states` are the
// optional feeling tags picked before starting; before/after value is
// the paired 1-5 scale (2026-08-30, per Sasha's explicit call —
// unified from the earlier 1-10 range, same on both ends: 1 = 😣
// напружено, 5 = 😌 спокійно — "Було: напруга 4/5 → Стало: 2/5" reads
// as an improvement either direction reads it). `changeNote` is the
// optional "Що змінилося?" pick(s) — now a checklist (Стало
// спокійніше / Думок стало менше / Відчуваю більше опори / Майже
// нічого не змінилося / Важко сказати), stored as one comma-joined
// string in this same text column rather than needing a schema change
// (see MeditationExperience's CHANGE_NOTE_DELIMITER).

import { supabase } from "./supabaseClient.ts";
import { notifyObservationsChanged } from "../utils/observationsSignal.ts";

export type MeditationMoodCheckIn = {
  id: string;
  states: string[];
  beforeValue: number | null;
  afterValue: number | null;
  changeNote: string | null;
};

// The full saved record, as shown in "Ваші спостереження" — unlike
// MeditationMoodCheckIn above (just what MeditationExperience needs
// for one specific session), this carries the meditation title +
// timestamps the history page needs to say what each pair was about
// and when.
export type MeditationMoodCheckInRecord = {
  id: string;
  meditationId: string;
  meditationTitle: string | null;
  states: string[];
  beforeValue: number;
  afterValue: number;
  changeNote: string | null;
  updatedAt: string | null;
  createdAt: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

// Creates a new row for this session — never upserts/overwrites an
// earlier one, on purpose (see the table's own schema.sql comment).
// beforeValue/states can both be empty if the person only answered
// part of the check-in; the caller (MeditationExperience) already
// decides not to call this at all when nothing was answered.
export async function createMeditationMoodCheckin(params: {
  meditationId: string;
  meditationTitle?: string;
  userId: string;
  states: string[];
  beforeValue: number | null;
}): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("meditation_mood_checkins")
    .insert({
      meditation_id: params.meditationId,
      meditation_title: params.meditationTitle ?? null,
      user_id: params.userId,
      states: params.states,
      before_value: params.beforeValue,
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("Не вдалося зберегти стан.");
  notifyObservationsChanged();
  return data.id as string;
}

// Every completed "Було ... Стало ..." pair this person has, across
// every meditation — what "Ваші спостереження" renders. Deliberately
// only pairs with both values set (an in-progress "before only" row
// isn't a result yet, nothing to show in a history of outcomes) — same
// convention as lib/moodCheckins.ts's fetchAllMoodCheckIns.
export async function fetchAllMeditationMoodCheckIns(
  userId: string,
  opts: { strict?: boolean } = {}
): Promise<MeditationMoodCheckInRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("meditation_mood_checkins")
    .select("id, meditation_id, meditation_title, states, before_value, after_value, change_note, updated_at, created_at")
    .eq("user_id", userId)
    .not("before_value", "is", null)
    .not("after_value", "is", null)
    .order("updated_at", { ascending: false });
  if (error && opts.strict) throw error;
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    meditationId: row.meditation_id as string,
    meditationTitle: row.meditation_title as string | null,
    states: (row.states as string[] | null) ?? [],
    beforeValue: row.before_value as number,
    afterValue: row.after_value as number,
    changeNote: row.change_note as string | null,
    updatedAt: row.updated_at as string | null,
    createdAt: row.created_at as string,
  }));
}

export async function submitMeditationMoodAfter(id: string, userId: string, value: number): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("meditation_mood_checkins")
    .update({ after_value: value, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
  notifyObservationsChanged();
}

// A separate call from submitMeditationMoodAfter, same reasoning as
// lib/moodCheckins.ts's submitMoodAfter being separate from
// submitMoodBefore — asked as its own follow-up step right after the
// intensity number, never in the same request.
export async function submitMeditationMoodChangeNote(id: string, userId: string, note: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("meditation_mood_checkins")
    .update({ change_note: note, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
  notifyObservationsChanged();
}

// Re-hydrates a specific check-in by id — needed when
// MeditationExperience mounts fresh directly onto an already-running
// or already-finished session (e.g. reopened from the mini player)
// and has to show the right "Було: X/5" without having been present
// when it was first answered.
export async function fetchMeditationMoodCheckin(id: string, userId: string): Promise<MeditationMoodCheckIn | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("meditation_mood_checkins")
    .select("id, states, before_value, after_value, change_note")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id as string,
    states: (data.states as string[] | null) ?? [],
    beforeValue: data.before_value as number | null,
    afterValue: data.after_value as number | null,
    changeNote: data.change_note as string | null,
  };
}

// Removes one before/after pair of a meditation session.
export async function deleteMeditationMoodCheckInById(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("meditation_mood_checkins").delete().eq("id", id);
  if (error) throw error;
  notifyObservationsChanged();
}
