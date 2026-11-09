// How many participants have progress on the lessons an author is about to
// remove or change (see utils/programEditSafety.ts). Authors may read their own
// content's progress rows (policy "authors view progress on their own content").
// Best-effort: on any failure it returns null and the editor still asks for
// confirmation, just without the number.
import { supabase } from "./supabaseClient.ts";
import { countParticipantsAffected } from "../utils/programEditSafety.ts";

export async function countAffectedParticipants(contentId: string, lessonIds: string[]): Promise<number | null> {
  if (!supabase || lessonIds.length === 0) return lessonIds.length === 0 ? 0 : null;
  try {
    const { data, error } = await supabase.from("content_progress").select("progress").eq("content_id", contentId);
    if (error || !data) return null;
    return countParticipantsAffected(
      (data as { progress: Record<string, string> | null }[]).map((r) => r.progress ?? {}),
      lessonIds
    );
  } catch {
    return null;
  }
}
