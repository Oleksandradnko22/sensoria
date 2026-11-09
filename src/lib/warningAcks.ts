// Real persistence for "Перед початком" content-warning gates (see
// supabase/schema.sql's content_item_warning_acks). A plain insert-only
// toggle — once acknowledged, a warning stays acknowledged for that
// person, so there's no "un-ack" path, unlike lib/bookmarks.ts's full
// add/remove toggle.

import { supabase } from "./supabaseClient.ts";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

export async function fetchWarningAck(itemId: string, userId: string): Promise<boolean> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_item_warning_acks")
    .select("id")
    .eq("content_item_id", itemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return true;
}

export async function ackWarning(itemId: string, userId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("content_item_warning_acks")
    .upsert({ content_item_id: itemId, user_id: userId }, { onConflict: "content_item_id,user_id" });
  if (error) throw error;
}
