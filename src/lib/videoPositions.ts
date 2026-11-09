// Real persistence for "Повернутися пізніше" — resuming a video from
// the timestamp a person actually left off at, instead of restarting
// from 0:00 every time they reopen a lesson. One row per (item,
// participant), overwritten on every save (see supabase/schema.sql's
// content_item_video_positions) — this is a single current position,
// not a growing history, same shape as lib/practiceResponses.ts.
//
// Deliberately no program/item title here (unlike reflections/mood/
// bookmarks) — this never surfaces on its own screen, it only feeds
// back into ProgramExperience's own video player as a `start=` seek
// point, so there's nothing to denormalize a title for.

import { supabase } from "./supabaseClient.ts";

export type VideoPosition = {
  positionSeconds: number;
  durationSeconds: number | null;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

export async function fetchVideoPosition(itemId: string, userId: string): Promise<VideoPosition | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("content_item_video_positions")
    .select("position_seconds, duration_seconds")
    .eq("content_item_id", itemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return { positionSeconds: data.position_seconds, durationSeconds: data.duration_seconds };
}

export async function saveVideoPosition(params: {
  itemId: string;
  userId: string;
  positionSeconds: number;
  durationSeconds?: number | null;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("content_item_video_positions").upsert(
    {
      content_item_id: params.itemId,
      user_id: params.userId,
      position_seconds: params.positionSeconds,
      duration_seconds: params.durationSeconds ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "content_item_id,user_id" }
  );
  if (error) throw error;
}

// Called once a video plays through to (near) the end — a finished
// video should start over from 0:00 next time, not "resume" three
// seconds before the end credits.
export async function clearVideoPosition(itemId: string, userId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("content_item_video_positions")
    .delete()
    .eq("content_item_id", itemId)
    .eq("user_id", userId);
  if (error) throw error;
}
