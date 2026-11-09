// Real persistence for "Закладки" — saving a specific lesson to come
// back to later (see supabase/schema.sql's content_item_bookmarks).
// A plain toggle: bookmarked means a row exists, unsaved means it's
// deleted, never an upserted boolean column. Same content_item_id-is-
// plain-text limitation as lib/itemFeedback.ts / lib/reflections.ts.

import { supabase } from "./supabaseClient.ts";
import { notifySavedChanged } from "../utils/savedSignal.ts";

export type Bookmark = {
  id: string;
  contentItemId: string;
  programId: string | null;
  programTitle: string | null;
  itemTitle: string | null;
  createdAt: string;
};

type BookmarkRow = {
  id: string;
  content_item_id: string;
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

function fromRow(row: BookmarkRow): Bookmark {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    programId: row.program_id,
    programTitle: row.program_title,
    itemTitle: row.item_title,
    createdAt: row.created_at,
  };
}

// Just whether this item is bookmarked (and its row id, so removeBookmark
// doesn't need a second lookup) — what the Lesson Player's toggle needs.
export async function fetchBookmark(itemId: string, userId: string): Promise<Bookmark | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_item_bookmarks")
    .select("id, content_item_id, program_id, program_title, item_title, created_at")
    .eq("content_item_id", itemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return fromRow(data as BookmarkRow);
}

// Every bookmark this person has, across every program — what "Ваші
// спостереження" renders in the "Закладки" section.
// `strict`: throw on a failed query instead of returning [] — for screens
// that must tell "nothing saved" from "could not load".
export async function fetchAllBookmarks(userId: string, opts: { strict?: boolean } = {}): Promise<Bookmark[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_item_bookmarks")
    .select("id, content_item_id, program_id, program_title, item_title, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error && opts.strict) throw error;
  if (error || !data) return [];
  return (data as BookmarkRow[]).map(fromRow);
}

// Just this program's bookmarks — feeds both the item-view star toggle
// and the small per-row indicator in "Ваш шлях" (ProgramExperience.tsx
// builds one Map<itemId, Bookmark> from this and reuses it for both,
// rather than fetching per-item every time an item opens).
export async function fetchBookmarksForProgram(programId: string, userId: string): Promise<Bookmark[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_item_bookmarks")
    .select("id, content_item_id, program_id, program_title, item_title, created_at")
    .eq("program_id", programId)
    .eq("user_id", userId);
  if (error || !data) return [];
  return (data as BookmarkRow[]).map(fromRow);
}

export async function addBookmark(params: {
  itemId: string;
  userId: string;
  programId?: string;
  programTitle?: string;
  itemTitle?: string;
}): Promise<Bookmark> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_item_bookmarks")
    .upsert(
      {
        content_item_id: params.itemId,
        user_id: params.userId,
        program_id: params.programId ?? null,
        program_title: params.programTitle ?? null,
        item_title: params.itemTitle ?? null,
      },
      { onConflict: "content_item_id,user_id" }
    )
    .select("id, content_item_id, program_id, program_title, item_title, created_at")
    .single();
  if (error || !data) throw error ?? new Error("Не вдалося зберегти закладку.");
  notifySavedChanged();
  return fromRow(data as BookmarkRow);
}

export async function removeBookmark(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("content_item_bookmarks").delete().eq("id", id);
  if (error) throw error;
  notifySavedChanged();
}
