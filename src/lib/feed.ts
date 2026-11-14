// Feed actions beyond reading pages (lib/authorPosts.ts): reactions, saves, polls, @mentions, notifications,
// «Тиждень у Sensoria», «Питання до автора» answers, participants' stories on a material page.
import { supabase } from "./supabaseClient.ts";
import { toFeedPosts, type FeedAudience, type FeedPoll, type FeedPost, type FeedRow, type ReactionKind } from "./authorPosts";
import type { PostContentKind } from "../utils/authorPosts";
import type { IconName } from "../components/ui/Icon";

function client() {
  if (!supabase) throw new Error("Supabase не налаштований.");
  return supabase;
}

export const REACTIONS: { kind: ReactionKind; label: string; icon: IconName; color: string }[] = [
  { kind: "support", label: "Підтримую", icon: "heart", color: "#7c3aed" },
  { kind: "resonates", label: "Відгукується", icon: "leaf", color: "#0f8a5f" },
  { kind: "thanks", label: "Дякую", icon: "star", color: "#c2730a" },
  { kind: "inspires", label: "Надихає", icon: "sparkle", color: "#3b6df0" },
];

/** One reaction per person; `null` takes it back. */
export async function setReaction(postId: string, userId: string, kind: ReactionKind | null): Promise<void> {
  const c = client();
  if (kind === null) {
    const { error } = await c.from("author_post_likes").delete().eq("post_id", postId).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  const { error } = await c.from("author_post_likes").upsert({ post_id: postId, user_id: userId, kind }, { onConflict: "post_id,user_id" });
  if (error) throw error;
}

export async function setSaved(postId: string, userId: string, saved: boolean): Promise<void> {
  const c = client();
  const { error } = saved
    ? await c.from("post_saves").insert({ post_id: postId, user_id: userId })
    : await c.from("post_saves").delete().eq("post_id", postId).eq("user_id", userId);
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

export async function votePoll(postId: string, userId: string, option: number): Promise<void> {
  const { error } = await client().from("post_poll_votes").insert({ post_id: postId, user_id: userId, option });
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

// ── writing a post with everything new ────────────────────────────────────────────────────────────────────────
export type FeedPostInput = {
  authorId: string;
  audience: FeedAudience;
  body: string;
  contentId: string | null;
  contentKind: PostContentKind | null;
  images: string[];
  videoUrl: string | null;
  poll: FeedPoll | null;
  amaUntil: string | null;
  sensitiveTopic: string | null;
  mentions: string[]; // author ids
};

/** Creates or updates a post (and its @mentions); returns its id. */
export async function saveFeedPost(input: FeedPostInput, postId?: string): Promise<string> {
  const c = client();
  const row = {
    body: input.body.trim(),
    content_id: input.contentId,
    content_kind: input.contentKind,
    images: input.images,
    video_url: input.videoUrl,
    is_share: false,
    poll: input.poll,
    ama_until: input.amaUntil,
    sensitive_topic: input.sensitiveTopic,
  };
  let id = postId;
  if (id) {
    const { error } = await c.from("author_posts").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    await c.from("post_mentions").delete().eq("post_id", id);
  } else {
    const { data, error } = await c.from("author_posts").insert({ ...row, author_id: input.authorId, audience: input.audience }).select("id").single();
    if (error) throw error;
    id = (data as { id: string }).id;
  }
  const mentions = [...new Set(input.mentions)].slice(0, 5);
  if (mentions.length) await c.from("post_mentions").insert(mentions.map((a) => ({ post_id: id, author_id: a })));
  return id!;
}

/** Authors whose name starts like the text after «@» (for the mention picker). */
export async function searchAuthors(q: string): Promise<{ id: string; name: string; avatarUrl: string | null }[]> {
  const t = q.trim();
  if (t.length < 1) return [];
  const { data } = await client().from("profiles").select("id, name, avatar_url").eq("role", "author").ilike("name", `%${t.replace(/[%_]/g, "")}%`).limit(6);
  return ((data ?? []) as { id: string; name: string; avatar_url: string | null }[]).map((r) => ({ id: r.id, name: r.name, avatarUrl: r.avatar_url ?? null }));
}

/** Materials a participant may tag (bought, got or studies). */
export async function fetchMyMaterials(): Promise<{ id: string; kind: PostContentKind; title: string }[]> {
  const { data, error } = await client().rpc("feed_my_materials");
  if (error) return [];
  return ((data ?? []) as { id: string; kind: PostContentKind; title: string }[]);
}

// ── notifications ─────────────────────────────────────────────────────────────────────────────────────────────
export type FeedNotification = {
  kind: "comment" | "reply" | "reactions" | "mention" | "follow_post" | "feature" | "official";
  at: string;
  postId: string;
  text: string | null;
  actorName: string | null;
  actorAvatar: string | null;
  unread: boolean;
};
export async function fetchNotifications(): Promise<{ unread: number; items: FeedNotification[] }> {
  const { data, error } = await client().rpc("feed_notifications");
  if (error) throw error;
  const d = (data ?? { unread: 0, items: [] }) as { unread: number; items: { kind: FeedNotification["kind"]; at: string; post_id: string; text: string | null; actor_name: string | null; actor_avatar: string | null; unread: boolean }[] };
  return {
    unread: d.unread ?? 0,
    items: (d.items ?? []).map((i) => ({ kind: i.kind, at: i.at, postId: i.post_id, text: i.text, actorName: i.actor_name, actorAvatar: i.actor_avatar, unread: i.unread })),
  };
}
export async function markNotificationsSeen(): Promise<void> {
  await client().rpc("feed_mark_seen");
}
export async function fetchFeedPost(id: string): Promise<FeedPost | null> {
  const { data, error } = await client().rpc("feed_post", { p_id: id });
  if (error || !data) return null;
  return (await toFeedPosts([data as FeedRow]))[0] ?? null;
}

// ── «Тиждень у Sensoria» ──────────────────────────────────────────────────────────────────────────────────────
export async function fetchWeek(): Promise<{ top: FeedPost[]; newAuthors: { id: string; name: string; avatarUrl: string | null }[] }> {
  const { data, error } = await client().rpc("feed_week");
  if (error) throw error;
  const d = (data ?? { top: [], new_authors: [] }) as { top: FeedRow[]; new_authors: { id: string; name: string; avatar: string | null }[] };
  return { top: await toFeedPosts(d.top ?? []), newAuthors: (d.new_authors ?? []).map((a) => ({ id: a.id, name: a.name, avatarUrl: a.avatar })) };
}

// ── «Питання до автора»: pin the best answers ────────────────────────────────────────────────────────────────
export async function pinComment(commentId: string, pinned: boolean): Promise<void> {
  const { error } = await client().rpc("pin_post_comment", { p_comment: commentId, p_pinned: pinned });
  if (error) throw error;
}

// ── «Досвід учасника» on the material page ──────────────────────────────────────────────────────────────────
export async function requestStoryFeature(postId: string): Promise<boolean> {
  const { data, error } = await client().rpc("request_story_feature", { p_post: postId });
  if (error) throw error;
  return !!data;
}
export async function answerStoryFeature(postId: string, yes: boolean): Promise<void> {
  const { error } = await client().rpc("answer_story_feature", { p_post: postId, p_yes: yes });
  if (error) throw error;
}
export type MaterialStory = { id: string; body: string; createdAt: string; name: string; avatarUrl: string | null };
export async function fetchMaterialStories(contentId: string, slug?: string | null): Promise<MaterialStory[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("material_stories", { p_content: contentId, p_slug: slug ?? null });
  if (error) return [];
  return ((data ?? []) as { id: string; body: string; created_at: string; name: string; avatar: string | null }[]).map((s) => ({ id: s.id, body: s.body, createdAt: s.created_at, name: s.name, avatarUrl: s.avatar }));
}

// ── text helpers ─────────────────────────────────────────────────────────────────────────────────────────────
export { MENTION_RE } from "../utils/authorPosts";

/** Crisis words (same list as the server): the post waits for a moderator, the person sees where to get help. */
export const CRISIS_RE = /(суїцид|суицид|самогуб|покінчити з собою|покончить с собой|не хочу жити|не хочу жить|хочу померти|хочу умереть|вбити себе|убить себя|самоушкодж|самоповрежд|порізати себе|різати себе|резать себя)/i;

export { LINK_RE } from "../utils/authorPosts";

// ── «Оголошення Sensoria» ─────────────────────────────────────────────────────────────────────────────────────
/** The pinned announcement(s) on top of «Для всіх». */
export async function fetchAnnouncements(): Promise<FeedPost[]> {
  const { data, error } = await client().rpc("feed_announcements");
  if (error) return [];
  return toFeedPosts((data ?? []) as FeedRow[]);
}
/** Admin panel: every announcement. */
export async function fetchAdminAnnouncements(): Promise<FeedPost[]> {
  const { data, error } = await client().rpc("admin_announcements");
  if (error) throw error;
  return toFeedPosts((data ?? []) as FeedRow[]);
}
export async function saveAnnouncement(input: { id?: string | null; body: string; images: string[]; videoUrl: string | null; pinned: boolean }): Promise<string> {
  const { data, error } = await client().rpc("admin_save_announcement", { p_id: input.id ?? null, p_body: input.body, p_images: input.images, p_video: input.videoUrl, p_pinned: input.pinned });
  if (error) throw error;
  return data as string;
}
export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await client().rpc("admin_delete_announcement", { p_id: id });
  if (error) throw error;
}
