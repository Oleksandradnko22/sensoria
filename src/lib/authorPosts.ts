// Author publications: posts, likes, comments, reports. See
// author-posts-migration.sql for the tables and RLS.
//
// Query budget per feed page (no N+1): posts (1) + pinned (1, first page only) + stats view for all ids (1) + my likes for all ids (1) + attached
// programs in one `.in()` (1). Comments load lazily, per opened post:
// comments (1) + commenter profiles (1).

import { supabase } from "./supabaseClient.ts";
import { uploadContentFile, deleteContentFile } from "./storage.ts";
import { ownImage, storagePath } from "./ownImage.ts";
import { guides } from "../data/guides.ts";
import { meditations } from "../data/meditations.ts";
import { isUuid } from "../utils/messagesView.ts";
import { isAuthorPreview, previewComments, previewPosts } from "../dev/authorPreview.ts";
import {
  isMissingRelation,
  resolveAttachment,
  parseVideoUrl,
  type PostAttachment,
  type PostVideo,
  type PostContentKind,
  type PostStats,
} from "../utils/authorPosts.ts";

export class PostsUnavailableError extends Error {
  constructor() {
    super("Публікації тимчасово недоступні.");
  }
}

function client() {
  if (!supabase) throw new Error("Supabase не налаштований.");
  return supabase;
}

function fail(error: unknown): never {
  if (isMissingRelation(error)) throw new PostsUnavailableError();
  throw error;
}

export type AuthorPost = {
  id: string;
  authorId: string;
  body: string;
  contentId: string | null;
  contentKind: PostContentKind | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string | null;
  attachment: PostAttachment | null;
  // Photos (public URLs), one YouTube/Vimeo video, and whether the
  // attached material is shared (someone else's) rather than the author's own.
  images: string[];
  video: PostVideo | null;
  isShare: boolean;
  imageAlt: string; // one description for the post's photos (alt text)
  stats: PostStats;
};

type PostRow = {
  id: string;
  author_id: string;
  body: string;
  content_id: string | null;
  content_kind: PostContentKind | null;
  is_pinned: boolean;
  images: string[] | null;
  video_url: string | null;
  is_share: boolean | null;
  image_alt?: string | null;
  created_at: string;
  updated_at: string | null;
};

const POST_COLUMNS_MID =
  "id, author_id, body, content_id, content_kind, is_pinned, images, video_url, is_share, created_at, updated_at";
// + image_alt (author-posts-hardening-migration.sql)
const POST_COLUMNS = `${POST_COLUMNS_MID}, image_alt`;
// Columns that exist since the very first version of the migration. If the
// newer media columns are not in the database yet, posts still load (text +
// attached material) instead of the whole feed disappearing.
const POST_COLUMNS_BASE = "id, author_id, body, content_id, content_kind, is_pinned, created_at, updated_at";

const isMissingColumn = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist|Could not find the .* column/i.test(e.message ?? ""));

// Runs `build(columns)` with the full column list and, only when a newer
// column is missing, once more with the base list.
async function selectPosts<T extends { data: unknown; error: { code?: string; message?: string } | null }>(
  build: (columns: string) => PromiseLike<T>
): Promise<T> {
  const full = await build(POST_COLUMNS);
  if (!(full.error && isMissingColumn(full.error))) return full;
  const mid = await build(POST_COLUMNS_MID);
  if (mid.error && isMissingColumn(mid.error)) return build(POST_COLUMNS_BASE);
  return mid;
}
export const FEED_PAGE_SIZE = 8;

// Canonical content lookup for attachments: catalogs for guides and
// meditations, the `content` table (published, or the viewer's own) for
// programs — one query for all of them.
async function resolveAttachments(rows: PostRow[]): Promise<Map<string, PostAttachment | null>> {
  const programIds = Array.from(
    new Set(rows.filter((r) => r.content_kind === "program" && r.content_id && isUuid(r.content_id)).map((r) => r.content_id!))
  );
  const titleById = new Map<string, string>();
  if (programIds.length) {
    const { data } = await client().from("content").select("id, title").in("id", programIds);
    (data ?? []).forEach((c) => titleById.set(c.id as string, c.title as string));
  }
  const out = new Map<string, PostAttachment | null>();
  rows.forEach((r) => {
    let found: { title: string; detail?: string } | null = null;
    if (r.content_kind === "guide") {
      const g = guides.find((x) => x.id === r.content_id);
      if (g) found = { title: g.title };
    } else if (r.content_kind === "meditation") {
      const m = meditations.find((x) => x.id === r.content_id);
      if (m) found = { title: m.title, detail: `${m.durationMinutes} хв` };
    } else if (r.content_kind === "program" && r.content_id) {
      const t = titleById.get(r.content_id);
      if (t) found = { title: t };
    }
    out.set(r.id, resolveAttachment(r.content_kind, r.content_id, found));
  });
  return out;
}

async function hydrate(rows: PostRow[], viewerId: string | null): Promise<AuthorPost[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const c = client();
  const [statsRes, likesRes, attachments] = await Promise.all([
    c.from("author_post_stats").select("post_id, like_count, comment_count").in("post_id", ids),
    viewerId
      ? c.from("author_post_likes").select("post_id").eq("user_id", viewerId).in("post_id", ids)
      : Promise.resolve({ data: [] as { post_id: string }[], error: null }),
    resolveAttachments(rows),
  ]);
  if (statsRes.error) fail(statsRes.error);
  const statById = new Map((statsRes.data ?? []).map((s) => [s.post_id as string, s]));
  const liked = new Set((likesRes.data ?? []).map((l) => l.post_id as string));
  return rows.map((r) => ({
    id: r.id,
    authorId: r.author_id,
    body: r.body,
    contentId: r.content_id,
    contentKind: r.content_kind,
    isPinned: r.is_pinned,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    attachment: attachments.get(r.id) ?? null,
    images: (r.images ?? []).filter(ownImage),
    video: parseVideoUrl(r.video_url),
    isShare: !!r.is_share,
    imageAlt: r.image_alt ?? "",
    stats: {
      likeCount: (statById.get(r.id)?.like_count as number | undefined) ?? 0,
      commentCount: (statById.get(r.id)?.comment_count as number | undefined) ?? 0,
      liked: liked.has(r.id),
    },
  }));
}

export type FeedPage = { pinned: AuthorPost | null; posts: AuthorPost[]; hasMore: boolean };

// Newest first, keyset-paginated on created_at (`before`). The post the
// author pinned ("Закріплено автором") is returned separately (first page
// only) and excluded from the chronological feed.
export async function fetchAuthorPosts(
  authorId: string,
  viewerId: string | null,
  opts: { before?: string } = {}
): Promise<FeedPage> {
  if (isAuthorPreview()) {
    const p = previewPosts(authorId);
    return { pinned: opts.before ? null : p.pinned, posts: opts.before ? [] : p.posts, hasMore: false };
  }
  const c = client();
  const feedBuild = (cols: string) => {
    let q = c
      .from("author_posts")
      .select(cols)
      .eq("author_id", authorId)
      .eq("is_pinned", false)
      .order("created_at", { ascending: false })
      .limit(FEED_PAGE_SIZE + 1);
    if (opts.before) q = q.lt("created_at", opts.before);
    return q;
  };

  const [feedRes, pinnedRes] = await Promise.all([
    selectPosts(feedBuild),
    opts.before
      ? Promise.resolve({ data: [] as PostRow[], error: null })
      : selectPosts((cols) => c.from("author_posts").select(cols).eq("author_id", authorId).eq("is_pinned", true).limit(1)),
  ]);
  if (feedRes.error) fail(feedRes.error);
  if (pinnedRes.error) fail(pinnedRes.error);

  const feedRows = (feedRes.data ?? []) as unknown as PostRow[];
  const hasMore = feedRows.length > FEED_PAGE_SIZE;
  const pageRows = feedRows.slice(0, FEED_PAGE_SIZE);
  const pinnedRows = (pinnedRes.data ?? []) as PostRow[];

  const all = await hydrate([...pinnedRows, ...pageRows], viewerId);
  const pinned = pinnedRows.length ? all[0] : null;
  return { pinned, posts: pinned ? all.slice(1) : all, hasMore };
}

// The author's own management list: everything, pinned first.
export async function fetchMyPosts(authorId: string, limit = 50): Promise<AuthorPost[]> {
  const { data, error } = await selectPosts((cols) =>
    client()
      .from("author_posts")
      .select(cols)
      .eq("author_id", authorId)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit)
  );
  if (error) fail(error);
  return hydrate((data ?? []) as unknown as PostRow[], authorId);
}

export type PostMediaInput = {
  images: string[];
  imageAlt?: string;
  videoUrl: string | null;
  isShare: boolean;
};

// set once the server says image_alt does not exist yet
let altMissing = false;

export async function createPost(
  input: {
    authorId: string;
    body: string;
    contentId: string | null;
    contentKind: PostContentKind | null;
  } & PostMediaInput
): Promise<void> {
  const { error } = await client().from("author_posts").insert({
    author_id: input.authorId,
    body: input.body.trim(),
    content_id: input.contentId,
    content_kind: input.contentKind,
    images: input.images,
    video_url: input.videoUrl,
    is_share: input.contentId ? input.isShare : false,
    ...(input.imageAlt !== undefined && !altMissing ? { image_alt: input.imageAlt.trim() || null } : {}),
  });
  if (error && isMissingColumn(error)) {
    altMissing = true;
    const { error: e2 } = await client().from("author_posts").insert({
      author_id: input.authorId,
      body: input.body.trim(),
      content_id: input.contentId,
      content_kind: input.contentKind,
      images: input.images,
      video_url: input.videoUrl,
      is_share: input.contentId ? input.isShare : false,
    });
    if (e2) fail(e2);
    return;
  }
  if (error) fail(error);
}

// Photos that are no longer on the post are deleted from storage (best effort).
async function removePostFiles(urls: string[], authorId: string | null | undefined) {
  if (!authorId) return;
  for (const u of urls) {
    const p = storagePath(u, authorId, "posts");
    if (p) await deleteContentFile(p);
  }
}

// After a failed save: the photos uploaded for it must not stay in storage.
export const discardUploadedImages = (authorId: string, urls: string[]) => removePostFiles(urls, authorId);

export async function updatePost(
  postId: string,
  input: { body: string; contentId: string | null; contentKind: PostContentKind | null } & PostMediaInput
): Promise<void> {
  const prev = await client().from("author_posts").select("author_id, images").eq("id", postId).maybeSingle();
  const { error } = await client()
    .from("author_posts")
    .update({
      body: input.body.trim(),
      content_id: input.contentId,
      content_kind: input.contentKind,
      images: input.images,
      video_url: input.videoUrl,
      is_share: input.contentId ? input.isShare : false,
      ...(input.imageAlt !== undefined && !altMissing ? { image_alt: input.imageAlt.trim() || null } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId);
  if (error && isMissingColumn(error)) {
    altMissing = true;
    return updatePost(postId, input);
  }
  if (error) fail(error);
  const old = ((prev.data as { images?: string[] } | null)?.images ?? []).filter((u) => !input.images.includes(u));
  await removePostFiles(old, (prev.data as { author_id?: string } | null)?.author_id);
}

export async function deletePost(postId: string): Promise<void> {
  const prev = await client().from("author_posts").select("author_id, images").eq("id", postId).maybeSingle();
  const { error } = await client().from("author_posts").delete().eq("id", postId);
  if (error) fail(error);
  await removePostFiles((prev.data as { images?: string[] } | null)?.images ?? [], (prev.data as { author_id?: string } | null)?.author_id);
}

export async function setPostPinned(postId: string, pinned: boolean): Promise<void> {
  const { error } = await client().rpc("pin_author_post", { p_post_id: postId, p_pinned: pinned });
  if (error) fail(error);
}

// Idempotent: liking twice / unliking twice is not an error.
export async function setPostLiked(postId: string, userId: string, liked: boolean): Promise<void> {
  if (isAuthorPreview()) return;
  const c = client();
  if (liked) {
    const { error } = await c.from("author_post_likes").insert({ post_id: postId, user_id: userId });
    if (error && error.code !== "23505") fail(error);
  } else {
    const { error } = await c.from("author_post_likes").delete().eq("post_id", postId).eq("user_id", userId);
    if (error) fail(error);
  }
}

// ── Comments ────────────────────────────────────────────────────────
export type PostComment = {
  id: string;
  postId: string;
  userId: string;
  parentId: string | null;
  authorName: string;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  // Derived (comment.user_id === post.author_id), never stored.
  isAuthor: boolean;
};

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string | null;
};

const COMMENT_COLUMNS = "id, post_id, user_id, parent_id, body, created_at, updated_at";

export async function fetchPostComments(postId: string, postAuthorId: string): Promise<PostComment[]> {
  if (isAuthorPreview()) return previewComments(postId, postAuthorId);
  const c = client();
  const { data, error } = await c
    .from("author_post_comments")
    .select(COMMENT_COLUMNS)
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) fail(error);
  const rows = (data ?? []) as CommentRow[];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const profiles = new Map<string, { name: string; avatar_url: string | null }>();
  if (userIds.length) {
    const { data: ps } = await c.from("profiles").select("id, name, avatar_url").in("id", userIds);
    (ps ?? []).forEach((p) => profiles.set(p.id as string, p as { name: string; avatar_url: string | null }));
  }
  return rows.map((r) => ({
    id: r.id,
    postId: r.post_id,
    userId: r.user_id,
    parentId: r.parent_id,
    authorName: profiles.get(r.user_id)?.name ?? "Учасник Sensoria",
    avatarUrl: profiles.get(r.user_id)?.avatar_url ?? null,
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    isAuthor: r.user_id === postAuthorId,
  }));
}

export async function addPostComment(input: {
  postId: string;
  userId: string;
  parentId: string | null;
  body: string;
  authorName: string;
  avatarUrl: string | null;
  postAuthorId: string;
}): Promise<PostComment> {
  if (isAuthorPreview()) {
    return {
      id: `local-${Date.now()}`,
      postId: input.postId,
      userId: input.userId,
      parentId: input.parentId,
      authorName: input.authorName,
      avatarUrl: input.avatarUrl,
      body: input.body.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: null,
      isAuthor: input.userId === input.postAuthorId,
    };
  }
  const { data, error } = await client()
    .from("author_post_comments")
    .insert({ post_id: input.postId, user_id: input.userId, parent_id: input.parentId, body: input.body.trim() })
    .select(COMMENT_COLUMNS)
    .single();
  if (error || !data) fail(error ?? new Error("Не вдалося опублікувати коментар."));
  const r = data as CommentRow;
  return {
    id: r.id,
    postId: r.post_id,
    userId: r.user_id,
    parentId: r.parent_id,
    authorName: input.authorName,
    avatarUrl: input.avatarUrl,
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    isAuthor: r.user_id === input.postAuthorId,
  };
}

export async function editPostComment(commentId: string, body: string): Promise<void> {
  if (isAuthorPreview()) return;
  const { error } = await client()
    .from("author_post_comments")
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq("id", commentId);
  if (error) fail(error);
}

export async function deletePostComment(commentId: string): Promise<void> {
  if (isAuthorPreview()) return;
  const { error } = await client().from("author_post_comments").delete().eq("id", commentId);
  if (error) fail(error);
}

export async function reportPostComment(params: { commentId: string; reporterId: string; reason: string }): Promise<void> {
  if (isAuthorPreview()) return;
  const { error } = await client().from("author_post_comment_reports").insert({
    comment_id: params.commentId,
    reporter_id: params.reporterId,
    reason: params.reason,
  });
  if (error) fail(error);
}

// Uploads photos to the shared `content-files` bucket under the author's
// own folder (the bucket RLS only allows `{auth.uid()}/…`). Returns public
// URLs in order. Throws on the first failure.
export async function uploadPostImages(authorId: string, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + urls.length);
    urls.push(await uploadContentFile(authorId, file, `posts/${id}`));
  }
  return urls;
}
