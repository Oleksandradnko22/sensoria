// "Підписатися" on an author. Private rows (see author-posts-migration.sql):
// a user only ever reads their own follows; no public follower list/count.
// Missing table (migration not applied) reads as "unavailable" so the page
// simply doesn't show the button.
import { supabase } from "./supabaseClient.ts";
import { isAuthorPreview } from "../dev/authorPreview.ts";
import { isMissingRelation } from "../utils/authorPosts.ts";

let previewFollowing = false;

export type FollowState = boolean | "unavailable";

export async function fetchIsFollowing(userId: string, authorId: string): Promise<FollowState> {
  if (isAuthorPreview()) return previewFollowing;
  if (!supabase) return "unavailable";
  const { data, error } = await supabase
    .from("author_follows")
    .select("author_id")
    .eq("follower_id", userId)
    .eq("author_id", authorId)
    .maybeSingle();
  if (error) return isMissingRelation(error) ? "unavailable" : false;
  return !!data;
}

// Idempotent both ways.
export async function setFollowing(userId: string, authorId: string, follow: boolean): Promise<void> {
  if (isAuthorPreview()) {
    previewFollowing = follow;
    return;
  }
  if (!supabase) throw new Error("Supabase не налаштований.");
  if (follow) {
    const { error } = await supabase.from("author_follows").insert({ follower_id: userId, author_id: authorId });
    if (error && error.code !== "23505") throw error;
  } else {
    const { error } = await supabase.from("author_follows").delete().eq("follower_id", userId).eq("author_id", authorId);
    if (error) throw error;
  }
}
