// Real persistence for a guide's interactive checklist blocks
// (2026-09-09, per Sasha's explicit spec — "користувач реально
// відмічає це всередині гайду"; see supabase/schema.sql's
// guide_checklist_checks). A plain toggle, same shape as
// lib/guideSaves.ts: checked means a row exists, unchecked means it's
// deleted. guide_id is plain text — guides live in data/guides.ts, not
// a real table — so identity for a given check is
// (guide_id, block_index, item_index), never the item's text itself.

import { supabase } from "./supabaseClient.ts";

export type GuideChecklistCheck = {
  id: string;
  guideId: string;
  // Stable block id (set once guide-block-id-migration.sql ran) — null for
  // rows written before it, which are known only by position.
  blockId: string | null;
  blockIndex: number | null;
  itemIndex: number;
  createdAt: string;
};

type GuideChecklistCheckRow = {
  id: string;
  guide_id: string;
  block_id?: string | null;
  block_index: number | null;
  item_index: number;
  created_at: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

// "*" so the read works both before and after the block_id column exists.
const SELECT_COLUMNS = "*";

// Errors that mean "the database has not been migrated to block ids yet".
const NOT_MIGRATED = new Set(["42703", "PGRST204", "23502"]);

function fromRow(row: GuideChecklistCheckRow): GuideChecklistCheck {
  return {
    id: row.id,
    guideId: row.guide_id,
    blockId: row.block_id ?? null,
    blockIndex: row.block_index ?? null,
    itemIndex: row.item_index,
    createdAt: row.created_at,
  };
}

// Every checked item across this guide's whole `content` — what
// GuideBlockRenderer reads on mount to know which checkboxes should
// already be ticked.
export async function fetchChecklistChecksForGuide(
  guideId: string,
  userId: string
): Promise<GuideChecklistCheck[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("guide_checklist_checks")
    .select(SELECT_COLUMNS)
    .eq("guide_id", guideId)
    .eq("user_id", userId);
  if (error || !data) {
    // eslint-disable-next-line no-console
    if (error) console.error("Не вдалося завантажити стан чек-листа:", error);
    return [];
  }
  return (data as GuideChecklistCheckRow[]).map(fromRow);
}

export async function checkChecklistItem(params: {
  guideId: string;
  blockId: string;
  // Position — only used as the fallback while the database is not migrated.
  blockIndex: number;
  itemIndex: number;
  userId: string;
}): Promise<GuideChecklistCheck> {
  const client = requireSupabase();
  let { data, error } = await client
    .from("guide_checklist_checks")
    .insert({
      guide_id: params.guideId,
      block_id: params.blockId,
      item_index: params.itemIndex,
      user_id: params.userId,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error && NOT_MIGRATED.has(error.code)) {
    ({ data, error } = await client
      .from("guide_checklist_checks")
      .insert({
        guide_id: params.guideId,
        block_index: params.blockIndex,
        item_index: params.itemIndex,
        user_id: params.userId,
      })
      .select(SELECT_COLUMNS)
      .single());
  }
  if (error) {
    // 23505 = unique violation — already checked (e.g. a double click
    // beat the optimistic UI); fetch and return the existing row rather
    // than surfacing an error for something that isn't really one.
    if (error.code === "23505") {
      const { data: rows } = await client
        .from("guide_checklist_checks")
        .select(SELECT_COLUMNS)
        .eq("guide_id", params.guideId)
        .eq("item_index", params.itemIndex)
        .eq("user_id", params.userId);
      const existing = (rows as GuideChecklistCheckRow[] | null)?.find(
        (r) => r.block_id === params.blockId || (!r.block_id && r.block_index === params.blockIndex)
      );
      if (existing) return fromRow(existing);
    }
    throw error;
  }
  if (!data) throw new Error("Не вдалося відмітити пункт.");
  return fromRow(data as GuideChecklistCheckRow);
}

export async function uncheckChecklistItem(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("guide_checklist_checks").delete().eq("id", id);
  if (error) throw error;
}
