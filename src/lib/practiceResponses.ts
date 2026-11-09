// Real persistence for "Спробуйте зараз" — the inline practice
// attached to a lesson (see PracticeSpec in data/contentTypes.ts).
// One answer per (item, participant); re-submitting replaces the
// previous answer (see supabase/schema.sql's content_item_practice_responses
// for why — a running history of answers over time is a separate,
// later feature, not this one). Same accepted content_item_id-is-text
// limitation as lib/itemFeedback.ts / lib/lessonComments.ts.
//
// program_id/program_title/item_title/prompt are a deliberate
// denormalization, same reasoning as lib/reflections.ts and
// lib/moodCheckins.ts — content_item_id has no FK to join against, so
// these are captured once at write time from what the Lesson Player
// already has in memory. prompt in particular is what makes a practice
// answer legible on its own in "Ваші спостереження" (a bare "8" or
// "так" means nothing without the question it was answering).

import { supabase } from "./supabaseClient.ts";
import { notifyObservationsChanged } from "../utils/observationsSignal.ts";

export type PracticeResponseValue =
  | { text: string }
  | { value: number }
  | { choice: string }
  | { choices: string[] };

export type PracticeResponseRecord = {
  id: string;
  contentItemId: string;
  programId: string | null;
  programTitle: string | null;
  itemTitle: string | null;
  prompt: string | null;
  response: PracticeResponseValue;
  createdAt: string;
  updatedAt: string | null;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

export async function fetchPracticeResponse(
  itemId: string,
  userId: string
): Promise<PracticeResponseValue | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_item_practice_responses")
    .select("response")
    .eq("content_item_id", itemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.response as PracticeResponseValue;
}

export async function submitPracticeResponse(params: {
  itemId: string;
  userId: string;
  response: PracticeResponseValue;
  programId?: string;
  programTitle?: string;
  itemTitle?: string;
  prompt?: string;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("content_item_practice_responses").upsert(
    {
      content_item_id: params.itemId,
      user_id: params.userId,
      response: params.response,
      program_id: params.programId ?? null,
      program_title: params.programTitle ?? null,
      item_title: params.itemTitle ?? null,
      prompt: params.prompt ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "content_item_id,user_id" }
  );
  if (error) throw error;
  notifyObservationsChanged();
}

// Just the count for one program — feeds the program overview's
// "richer than a bare %" progress panel and the completion report
// screen (ProgramExperience.tsx), same reasoning and shape as
// lib/reflections.ts's countReflectionsForProgram. A plain count query
// rather than fetching+measuring full rows, since callers only ever
// need the number.
export async function countPracticeResponsesForProgram(programId: string, userId: string): Promise<number> {
  const client = requireSupabase();
  const { count, error } = await client
    .from("content_item_practice_responses")
    .select("id", { count: "exact", head: true })
    .eq("program_id", programId)
    .eq("user_id", userId);
  if (error || count == null) return 0;
  return count;
}

// For "Ваші спостереження" — every practice answer the person currently
// has saved, most recently updated first. Like mood check-ins (and
// unlike reflections) this is one row per item, not a growing log, so
// "history" here means "everything you've currently answered," not
// "everything you've ever answered."
export async function fetchAllPracticeResponses(
  userId: string,
  opts: { strict?: boolean } = {}
): Promise<PracticeResponseRecord[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_item_practice_responses")
    .select("id, content_item_id, program_id, program_title, item_title, prompt, response, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false, nullsFirst: false });
  if (error && opts.strict) throw error;
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    contentItemId: row.content_item_id,
    programId: row.program_id,
    programTitle: row.program_title,
    itemTitle: row.item_title,
    prompt: row.prompt,
    response: row.response as PracticeResponseValue,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

// Removes one saved answer from "Ваші спостереження" (the row is the
// person's own — RLS "for all" self policy). The same row backs the answer
// shown in its lesson, so it is cleared there too.
export async function deletePracticeResponseById(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("content_item_practice_responses").delete().eq("id", id);
  if (error) throw error;
  notifyObservationsChanged();
}
