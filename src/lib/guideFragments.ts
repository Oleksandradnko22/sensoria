// Real persistence for "Зберегти конкретну частину" — saving one
// specific point/step from a guide, not the whole document (see
// supabase/schema.sql's guide_fragment_saves / Sasha's explicit spec).
// A plain toggle, same shape as lib/bookmarks.ts: saved means a row
// exists, unsaved means it's deleted. guide_id is plain text — guides
// live in data/guides.ts, not a real table — so identity for a given
// user's save is (guide_id, fragment_index), never the fragment text
// itself (two different steps could coincidentally read the same).

import { supabase } from "./supabaseClient.ts";
import { notifySavedChanged } from "../utils/savedSignal.ts";

export type SavedFragment = {
  id: string;
  guideId: string;
  // Stable id of the saved block (set once guide-block-identity-migration.sql
  // ran); older rows are known only by position.
  blockId: string | null;
  fragmentIndex: number | null;
  fragmentText: string;
  guideTitle: string | null;
  createdAt: string;
};

type SavedFragmentRow = {
  id: string;
  guide_id: string;
  fragment_block_id?: string | null;
  fragment_index: number | null;
  fragment_text: string;
  guide_title: string | null;
  created_at: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

function fromRow(row: SavedFragmentRow): SavedFragment {
  return {
    id: row.id,
    guideId: row.guide_id,
    blockId: row.fragment_block_id ?? null,
    fragmentIndex: row.fragment_index ?? null,
    fragmentText: row.fragment_text,
    guideTitle: row.guide_title,
    createdAt: row.created_at,
  };
}

// Every fragment saved from this one guide — what GuideExperience reads
// on mount to know which points already show ♥ instead of ♡.
export async function fetchSavedFragmentsForGuide(
  guideId: string,
  userId: string
): Promise<SavedFragment[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("guide_fragment_saves")
    .select("*")
    .eq("guide_id", guideId)
    .eq("user_id", userId);
  if (error || !data) return [];
  return (data as SavedFragmentRow[]).map(fromRow);
}

// Every fragment this person has ever saved, across every guide — what
// "Мої збереження" (ParticipantBookmarks.tsx) renders.
export async function fetchAllSavedFragments(userId: string, opts: { strict?: boolean } = {}): Promise<SavedFragment[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("guide_fragment_saves")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error && opts.strict) throw error;
  if (error || !data) return [];
  return (data as SavedFragmentRow[]).map(fromRow);
}

// Which block each saved row of a guide belongs to NOW: by id when the row
// has one, else by its old position. Rows whose block no longer exists are
// kept in the database (the person's saves are history) but have no block to
// mark as saved, so they are left out here.
export function rowsToBlockIds(
  content: { id: string }[],
  rows: Pick<SavedFragment, "id" | "blockId" | "fragmentIndex">[]
): { id: string; blockId: string }[] {
  const ids = new Set(content.map((b) => b.id));
  const out: { id: string; blockId: string }[] = [];
  for (const row of rows) {
    const blockId = row.blockId ?? (row.fragmentIndex == null ? undefined : content[row.fragmentIndex]?.id);
    if (blockId && ids.has(blockId)) out.push({ id: row.id, blockId });
  }
  return out;
}

// Errors that mean "the database has not been migrated to block ids yet".
const NOT_MIGRATED = new Set(["42703", "PGRST204", "23502", "42P10"]);

export async function addSavedFragment(params: {
  guideId: string;
  blockId: string;
  // Position — only used as the fallback while the database is not migrated.
  blockIndex: number;
  fragmentText: string;
  guideTitle?: string;
  userId: string;
}): Promise<SavedFragment> {
  const client = requireSupabase();
  let { data, error } = await client
    .from("guide_fragment_saves")
    .upsert(
      {
        guide_id: params.guideId,
        fragment_block_id: params.blockId,
        fragment_text: params.fragmentText,
        guide_title: params.guideTitle ?? null,
        user_id: params.userId,
      },
      { onConflict: "guide_id,fragment_block_id,user_id" }
    )
    .select("*")
    .single();
  if (error && NOT_MIGRATED.has(error.code)) {
    ({ data, error } = await client
      .from("guide_fragment_saves")
      .upsert(
        {
          guide_id: params.guideId,
          fragment_index: params.blockIndex,
          fragment_text: params.fragmentText,
          guide_title: params.guideTitle ?? null,
          user_id: params.userId,
        },
        { onConflict: "guide_id,fragment_index,user_id" }
      )
      .select("*")
      .single());
  }
  if (error || !data) throw error ?? new Error("Не вдалося зберегти фрагмент.");
  notifySavedChanged();
  return fromRow(data as SavedFragmentRow);
}

export async function removeSavedFragment(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("guide_fragment_saves").delete().eq("id", id);
  if (error) throw error;
  notifySavedChanged();
}
