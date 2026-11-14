// Real persistence for lesson discussion ("Обговорення" on the
// item/Lesson Player screen) — replaces utils/lessonCommentsStore.ts's
// localStorage demo store with the real content_comments /
// content_comment_reports tables (see supabase/schema.sql).
//
// Same accepted trade-off as the schema comment: content_item_id is a
// plain string, not a foreign key, because the Lesson Player screen
// currently only renders the demo catalog (src/data/programModules.ts)
// — so there's no real content row to scope permissions against, and
// this is open to any signed-in user on any item id. isAuthorReply is
// always false today for the same reason (no real author account
// exists behind a demo program).

import { supabase } from "./supabaseClient.ts";

export type LessonComment = {
  id: string;
  itemId: string;
  userId: string;
  authorName: string;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  isAuthorReply: boolean;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

export async function fetchComments(itemId: string): Promise<LessonComment[]> {
  const client = requireSupabase();
  const { data: rows, error } = await client
    .from("content_comments")
    .select("id, content_item_id, user_id, body, is_author_reply, created_at, updated_at")
    .eq("content_item_id", itemId)
    .order("created_at", { ascending: true });
  if (error || !rows) return [];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profiles } = userIds.length
    ? await client.from("profiles").select("id, name, avatar_url").in("id", userIds)
    : { data: [] as { id: string; name: string; avatar_url: string | null }[] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return rows.map((r) => {
    const profile = profileById.get(r.user_id);
    return {
      id: r.id,
      itemId: r.content_item_id,
      userId: r.user_id,
      authorName: profile?.name ?? "Учасник Sensoria",
      avatarUrl: profile?.avatar_url ?? null,
      body: r.body,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      isAuthorReply: r.is_author_reply,
    };
  });
}

export async function addComment(
  itemId: string,
  input: { userId: string; authorName: string; avatarUrl: string | null; body: string }
): Promise<LessonComment> {
  const client = requireSupabase();
  const { data: row, error } = await client
    .from("content_comments")
    .insert({ content_item_id: itemId, user_id: input.userId, body: input.body })
    .select("id, content_item_id, user_id, body, is_author_reply, created_at, updated_at")
    .single();
  if (error || !row) throw error ?? new Error("Не вдалося опублікувати коментар.");

  // authorName/avatarUrl come from the caller's own session profile —
  // it's the current user, so there's no need for a second profiles
  // query just to read back what the caller already has.
  return {
    id: row.id,
    itemId: row.content_item_id,
    userId: row.user_id,
    authorName: input.authorName,
    avatarUrl: input.avatarUrl,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isAuthorReply: row.is_author_reply,
  };
}

export async function editComment(commentId: string, body: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("content_comments")
    .update({ body, updated_at: new Date().toISOString() })
    .eq("id", commentId);
  if (error) throw error;
}

export async function deleteComment(commentId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("content_comments").delete().eq("id", commentId);
  if (error) throw error;
}

export async function reportComment(params: {
  commentId: string;
  reporterId: string;
  reason: string;
}): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("content_comment_reports").insert({
    comment_id: params.commentId,
    reporter_id: params.reporterId,
    reason: params.reason,
  });
  if (error && (error as { code?: string }).code !== "23505") throw error;
}
