// Server-side history of meditation sessions (2026-10-06): the same three
// facts the on-device store keeps (utils/meditationSessionStore.ts) — how
// many sessions, when last started, when last completed — but kept per
// account so they survive a new device or cleared browser data. Nothing
// competitive: no streaks, no ranking.
//
// Everything here is best-effort and silent: if the table does not exist yet
// (meditation-sessions-migration.sql not run) or the network fails, the
// on-device history keeps working exactly as before.

import { supabase } from "./supabaseClient.ts";
import type { MeditationSessionHistory } from "../utils/meditationSessionStore.ts";

export async function logSessionStart(meditationId: string, userId: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("meditation_sessions").insert({ meditation_id: meditationId, user_id: userId });
  } catch {
    // history is a nice-to-have — never interrupt a practice
  }
}

// Marks the most recent still-open session of this meditation as completed.
export async function logSessionCompleted(meditationId: string, userId: string): Promise<void> {
  if (!supabase) return;
  try {
    const { data } = await supabase
      .from("meditation_sessions")
      .select("id")
      .eq("meditation_id", meditationId)
      .eq("user_id", userId)
      .is("completed_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return;
    await supabase
      .from("meditation_sessions")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", (data as { id: string }).id)
      .eq("user_id", userId);
  } catch {
    // see above
  }
}

export async function fetchSessionSummary(userId: string): Promise<Record<string, MeditationSessionHistory>> {
  if (!supabase) return {};
  try {
    const { data, error } = await supabase
      .from("meditation_sessions")
      .select("meditation_id, started_at, completed_at")
      .eq("user_id", userId);
    if (error || !data) return {};
    const out: Record<string, MeditationSessionHistory> = {};
    for (const row of data as { meditation_id: string; started_at: string; completed_at: string | null }[]) {
      const cur = (out[row.meditation_id] ??= { sessionCount: 0, lastStartedAt: null, lastCompletedAt: null });
      cur.sessionCount += 1;
      if (!cur.lastStartedAt || row.started_at > cur.lastStartedAt) cur.lastStartedAt = row.started_at;
      if (row.completed_at && (!cur.lastCompletedAt || row.completed_at > cur.lastCompletedAt)) {
        cur.lastCompletedAt = row.completed_at;
      }
    }
    return out;
  } catch {
    return {};
  }
}
