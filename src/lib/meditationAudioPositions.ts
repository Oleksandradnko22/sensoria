// Real persistence for "продовжити з місця зупинки" on a meditation's
// audio track — same idea and shape as lib/videoPositions.ts, just
// keyed by meditation_id instead of content_item_id (see
// supabase/schema.sql's meditation_audio_positions comment for why
// that's plain text, not a real FK). One row per (meditation,
// participant), overwritten on every save — a single current
// position, not a growing history.

import { supabase } from "./supabaseClient.ts";

import { isResumablePosition, RESUME_EDGE_THRESHOLD_SECONDS, type MeditationAudioPosition } from "../utils/meditationResume.ts";

// Re-exported so existing callers keep importing from here.
export { isResumablePosition, RESUME_EDGE_THRESHOLD_SECONDS, type MeditationAudioPosition };

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

export async function fetchMeditationAudioPosition(
  meditationId: string,
  userId: string
): Promise<MeditationAudioPosition | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("meditation_audio_positions")
    .select("position_seconds, duration_seconds")
    .eq("meditation_id", meditationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return { positionSeconds: data.position_seconds, durationSeconds: data.duration_seconds };
}

export async function saveMeditationAudioPosition(params: {
  meditationId: string;
  userId: string;
  positionSeconds: number;
  durationSeconds?: number | null;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("meditation_audio_positions").upsert(
    {
      meditation_id: params.meditationId,
      user_id: params.userId,
      position_seconds: params.positionSeconds,
      duration_seconds: params.durationSeconds ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "meditation_id,user_id" }
  );
  if (error) throw error;
}

// Called once a track plays through to (near) the end — a finished
// meditation should start over from 0:00 next time, not resume three
// seconds before it ends.
export async function clearMeditationAudioPosition(meditationId: string, userId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("meditation_audio_positions")
    .delete()
    .eq("meditation_id", meditationId)
    .eq("user_id", userId);
  if (error) throw error;
}
