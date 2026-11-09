// Free materials a person moved from the cart into their cabinet (table `acquired_content`, RLS: own rows).
// Paid access will come with payments; today only free materials are added here.
import { supabase } from "./supabaseClient.ts";
import type { CartKind } from "../utils/cart.ts";

export type AcquiredRow = { kind: CartKind; contentId: string; acquiredAt: string };

export async function fetchAcquired(userId: string): Promise<AcquiredRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("acquired_content").select("kind, content_id, acquired_at").eq("user_id", userId);
  // before the migration is applied the table does not exist: nothing acquired, nothing breaks
  if (error || !data) return [];
  return (data as { kind: CartKind; content_id: string; acquired_at: string }[]).map((r) => ({ kind: r.kind, contentId: r.content_id, acquiredAt: r.acquired_at }));
}

// Adding the same material twice is fine (the row already exists). Throws when it could not be saved.
export async function acquireContent(userId: string, items: { kind: CartKind; id: string }[]): Promise<void> {
  if (!supabase) throw new Error("Supabase не налаштований.");
  if (!items.length) return;
  const { error } = await supabase
    .from("acquired_content")
    .upsert(items.map((i) => ({ user_id: userId, kind: i.kind, content_id: i.id })), { onConflict: "user_id,kind,content_id", ignoreDuplicates: true });
  if (error) throw error;
  window.dispatchEvent(new Event("sensoria:acquired-changed"));
}

export const ACQUIRED_EVENT = "sensoria:acquired-changed";
