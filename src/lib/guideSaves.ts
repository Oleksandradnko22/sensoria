// Real persistence for "Додати в обране" — a person bookmarking a
// guide themselves from the dashboard (see supabase/schema.sql's
// guide_saved_for_later), independent of enrollments/purchases. A
// plain toggle, same shape as lib/bookmarks.ts: saved means a row
// exists, unsaved means it's deleted. guide_id is plain text — guides
// live in data/guides.ts, not a real table.

import { supabase } from "./supabaseClient.ts";
import { notifySavedChanged } from "../utils/savedSignal.ts";

export type SavedGuide = {
  id: string;
  guideId: string;
  guideTitle: string | null;
  createdAt: string;
};

type SavedGuideRow = {
  id: string;
  guide_id: string;
  guide_title: string | null;
  created_at: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

function fromRow(row: SavedGuideRow): SavedGuide {
  return {
    id: row.id,
    guideId: row.guide_id,
    guideTitle: row.guide_title,
    createdAt: row.created_at,
  };
}

// Every guide this person has bookmarked — what ParticipantLearning
// reads on mount to know which cards should show ★ instead of ☆, and
// what feeds the "Мої рекомендації" already-saved exclusion.
export async function fetchAllSavedGuides(userId: string, opts: { strict?: boolean } = {}): Promise<SavedGuide[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("guide_saved_for_later")
    .select("id, guide_id, guide_title, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[guideSaves] fetchAll failed", error);
  }
  if (error && opts.strict) throw error;
  if (error || !data) return [];
  return (data as SavedGuideRow[]).map(fromRow);
}

const SELECT_COLUMNS = "id, guide_id, guide_title, created_at";

// Plain insert, not upsert (2026-09-09, rewritten after the upsert path
// couldn't be confirmed working live — this removes upsert's onConflict
// resolution as a variable entirely). A duplicate save (23505, the
// guide_id+user_id unique constraint) isn't treated as a failure — it
// means the guide was already saved, so this just fetches and returns
// that existing row instead of surfacing an error for what the person
// experiences as a normal, harmless double-click.
export async function addSavedGuide(params: {
  guideId: string;
  guideTitle?: string;
  userId: string;
}): Promise<SavedGuide> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("guide_saved_for_later")
    .insert({
      guide_id: params.guideId,
      guide_title: params.guideTitle ?? null,
      user_id: params.userId,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[guideSaves] insert failed", error);
    if (error.code === "23505") {
      const { data: existing, error: fetchError } = await client
        .from("guide_saved_for_later")
        .select(SELECT_COLUMNS)
        .eq("guide_id", params.guideId)
        .eq("user_id", params.userId)
        .single();
      if (!fetchError && existing) {
        notifySavedChanged();
        return fromRow(existing as SavedGuideRow);
      }
    }
    throw error;
  }
  if (!data) throw new Error("Не вдалося додати в обране.");
  notifySavedChanged();
  return fromRow(data as SavedGuideRow);
}

export async function removeSavedGuide(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("guide_saved_for_later").delete().eq("id", id);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[guideSaves] delete failed", error);
    throw error;
  }
  notifySavedChanged();
}
