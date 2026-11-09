import { parseCoverFocus } from "../utils/coverFocus";
// Everything the public author profile shows, read from existing tables
// only: profiles (name/photo/member since), author_details (title/bio/
// verified/site/instagram — all publicly readable by RLS), published
// `content` rows, the guide_authors / meditation_authors id mappings for
// catalog guides and meditations, and the publicly readable
// author_reviews. Nothing here is invented: an empty bio / no content / no
// reviews simply come back empty and the page says so.
//
// Four parallel queries plus one batched profiles lookup for reviewer
// names — no per-item requests.

import { supabase } from "./supabaseClient.ts";
import { fetchAuthorDetails, type AuthorDetails } from "./authorDetails.ts";
import { guides, guideSizeLabel } from "../data/guides.ts";
import { pluralUk } from "../utils/plural.ts";
import { meditations } from "../data/meditations.ts";
import { fetchAuthorStory } from "./authorStory.ts";
import type { AuthorStory } from "../utils/authorStory.ts";
import { fetchPublicBackground } from "./authorCredentials.ts";
import type { AuthorCase, AuthorCredential, AuthorExperience } from "../utils/authorCredentials.ts";
import { sendNotificationEmail } from "./notificationPrefs.ts";
import { shortName, type AuthorContentItem } from "../utils/authorProfileView.ts";
import { publishableCredentials, publishableExperience } from "../utils/authorCredentials.ts";
import { eduFillMode, fillBackground, fillStory, isAuthorPreview, storyFillMode, PREVIEW_AUDIENCE, PREVIEW_DETAILS, PREVIEW_PORTRAIT, PREVIEW_REVIEWS, PREVIEW_STORY_MEDIA } from "../dev/authorPreview.ts";

export type AuthorPublicReview = {
  id: string;
  rating: number;
  text: string;
  createdAt: string;
  reviewerName: string;
  reviewerAvatarUrl?: string | null;
  // the author's public answer (author-reviews-reply-migration.sql)
  authorReply?: string | null;
  authorReplyAt?: string | null;
};

export type AuthorPublicProfile = {
  id: string;
  name: string;
  avatarUrl: string | null;
  memberSince: string | null;
  details: AuthorDetails;
  content: AuthorContentItem[];
  // structured background the author chose to make public
  credentials: AuthorCredential[];
  experience: AuthorExperience[];
  cases: AuthorCase[];
  story: AuthorStory;
  reviews: AuthorPublicReview[];
  // null = the audience view is not available (migration not applied)
  audience: { followers: number; participants: number } | null;
};

// Everything this author has published: real `content` rows plus the
// catalog guides / meditations mapped to them (guide_authors /
// meditation_authors; a mapping error just means "none"). Also the pool an
// author picks from when attaching material to a post.
export async function fetchAuthorContent(authorId: string): Promise<AuthorContentItem[]> {
  if (!supabase) throw new Error("Supabase не налаштований.");
  const [contentRes, guideMap, medMap] = await Promise.all([
    supabase
      .from("content")
      .select("id, kind, title, description, price, cover_url")
      .eq("author_id", authorId)
      .eq("status", "published")
      .order("created_at", { ascending: false }),
    supabase.from("guide_authors").select("guide_id").eq("author_id", authorId),
    supabase.from("meditation_authors").select("meditation_id").eq("author_id", authorId),
  ]);
  if (contentRes.error) throw contentRes.error;

  // Module counts for the author's programs: ONE query for all of them.
  const programIds = (contentRes.data ?? []).filter((r) => r.kind === "program").map((r) => r.id as string);
  const moduleCount = new Map<string, number>();
  if (programIds.length) {
    const { data: mods } = await supabase.from("content_modules").select("content_id").in("content_id", programIds);
    (mods ?? []).forEach((m) => moduleCount.set(m.content_id as string, (moduleCount.get(m.content_id as string) ?? 0) + 1));
  }
  // Cover focal points need program-page-migration.sql; missing column = centred.
  const focusById = new Map<string, { x: number; y: number }>();
  const focusRes = await supabase.from("content").select("id, cover_focus").eq("author_id", authorId).eq("status", "published");
  if (!focusRes.error) (focusRes.data ?? []).forEach((r) => { const f = parseCoverFocus(r.cover_focus); if (f) focusById.set(r.id as string, f); });
  const content: AuthorContentItem[] = (contentRes.data ?? []).map((r) => {
    const n = moduleCount.get(r.id as string) ?? 0;
    return {
      id: r.id as string,
      kind: r.kind as AuthorContentItem["kind"],
      title: r.title as string,
      description: (r.description as string | null) ?? "",
      price: (r.price as number | string | null) ?? null,
      coverUrl: (r.cover_url as string | null) ?? null,
      coverFocus: focusById.get(r.id as string),
      moduleCount: r.kind === "program" && n > 0 ? n : undefined,
      detail: r.kind === "program" && n > 0 ? `${n} ${pluralUk(n, "модуль", "модулі", "модулів")}` : undefined,
    };
  });
  const guideIds = new Set((guideMap.data ?? []).map((g) => g.guide_id as string));
  guides
    .filter((g) => guideIds.has(g.id))
    .forEach((g) =>
      content.push({
        id: g.id,
        kind: "guide",
        title: g.title,
        description: g.description ?? "",
        detail: guideSizeLabel(g),
        pageCount: g.pages > 0 ? g.pages : undefined,
        price: g.price,
      })
    );
  const medIds = new Set((medMap.data ?? []).map((m) => m.meditation_id as string));
  meditations
    .filter((m) => medIds.has(m.id))
    .forEach((m) =>
      content.push({
        id: m.id,
        kind: "meditation",
        title: m.title,
        description: m.description ?? "",
        detail: `${m.durationMinutes} хв`,
        // The meditation catalog carries no price: a meditation is a free,
        // stand-alone practice by product definition (see MeditationCard).
        price: 0,
      })
    );
  return content;
}

// Reviews with the author's reply; before author-reviews-reply-migration.sql the
// reply columns do not exist, so fall back to the plain columns.
async function fetchReviewRows(authorId: string) {
  const q = (cols: string) =>
    supabase!.from("author_reviews").select(cols).eq("author_id", authorId).order("created_at", { ascending: false });
  let res = await q("id, participant_id, rating, text, created_at, author_reply, author_replied_at");
  if (res.error) res = await q("id, participant_id, rating, text, created_at");
  return { error: res.error, data: (res.data ?? []) as unknown as Record<string, unknown>[] };
}

// Reviews about the author as a person (publicly readable), without loading the whole profile.
export async function fetchAuthorPublicReviews(authorId: string): Promise<AuthorPublicReview[]> {
  if (!supabase) return [];
  const res = await fetchReviewRows(authorId);
  if (res.error) return [];
  const ids = Array.from(new Set(res.data.map((r) => r.participant_id as string)));
  const names = new Map<string, string>();
  if (ids.length) {
    const { data } = await supabase.from("profiles").select("id, name").in("id", ids);
    (data ?? []).forEach((p) => names.set(p.id as string, p.name as string));
  }
  return res.data.map((r) => ({
    id: r.id as string,
    rating: r.rating as number,
    text: r.text as string,
    createdAt: r.created_at as string,
    reviewerName: shortName(names.get(r.participant_id as string)),
    authorReply: (r.author_reply as string | null) ?? null,
    authorReplyAt: (r.author_replied_at as string | null) ?? null,
  }));
}

// The author answers a review about them (null = remove the answer). Dev preview: nothing is written.
export async function saveReviewReply(reviewId: string, reply: string | null, authorName = "Автор"): Promise<void> {
  if (isAuthorPreview()) return;
  if (!supabase) throw new Error("Supabase не налаштований.");
  const text = reply && reply.trim() ? reply.trim() : null;
  const before = await supabase.from("author_reviews").select("participant_id, author_reply").eq("id", reviewId).maybeSingle();
  const { data, error } = await supabase.from("author_reviews").update({ author_reply: text }).eq("id", reviewId).select("id");
  if (error) throw error;
  // RLS hides rows silently: nothing updated means the reply was NOT saved
  if (!data || data.length === 0) throw new Error("Відповідь не збережено.");
  // The participant is told once, when the FIRST reply appears (not on edits or removal).
  const participantId = (before.data as { participant_id?: string } | null)?.participant_id;
  const hadReply = !!(before.data as { author_reply?: string | null } | null)?.author_reply;
  if (text && !hadReply && participantId) {
    sendNotificationEmail(
      participantId,
      "reply",
      "Автор відповів на ваш відгук",
      `${authorName} відповів(ла) на ваш відгук про автора на Sensoria:\n\n«${text}»\n\nПереглянути відповідь можна на публічному профілі автора на сайті.`,
      { authorReviewId: reviewId }
    );
  }
}

// Short-lived cache of the light profile (no reviews) so the program page can start loading it
// as soon as it opens and the «Автор» tab then shows instantly.
const lightCache = new Map<string, { at: number; p: Promise<AuthorPublicProfile | null>; value?: AuthorPublicProfile | null }>();
const LIGHT_TTL_MS = 60_000;

// Already-loaded profile (any age), for an instant first paint; undefined = never loaded.
export function peekAuthorProfile(authorId: string): AuthorPublicProfile | null | undefined {
  return lightCache.get(authorId)?.value;
}

export function prefetchAuthorProfile(authorId: string): Promise<AuthorPublicProfile | null> {
  const hit = lightCache.get(authorId);
  if (hit && Date.now() - hit.at < LIGHT_TTL_MS) return hit.p;
  const prev = hit?.value;
  const entry: { at: number; p: Promise<AuthorPublicProfile | null>; value?: AuthorPublicProfile | null } = {
    at: Date.now(),
    p: fetchAuthorPublicProfile(authorId, { withReviews: false }),
    value: prev,
  };
  lightCache.set(authorId, entry);
  entry.p.then((v) => { entry.value = v; }).catch(() => { if (lightCache.get(authorId) === entry) lightCache.delete(authorId); });
  return entry.p;
}

export async function fetchAuthorPublicProfile(authorId: string, opts: { withReviews?: boolean } = {}): Promise<AuthorPublicProfile | null> {
  if (!supabase) throw new Error("Supabase не налаштований.");
  const withReviews = opts.withReviews !== false;

  // All queries start at once; the role check happens when they are back (one round-trip instead of two).
  const [profileRes, details, content, background, story, reviewRes, audienceRes] = await Promise.all([
    supabase.from("profiles").select("id, name, avatar_url, member_since, role").eq("id", authorId).maybeSingle(),
    fetchAuthorDetails(authorId),
    fetchAuthorContent(authorId),
    fetchPublicBackground(authorId),
    fetchAuthorStory(authorId),
    withReviews ? fetchReviewRows(authorId) : Promise.resolve({ error: null, data: [] as Record<string, unknown>[] }),
    supabase.from("author_audience_stats").select("follower_count, participant_count").eq("author_id", authorId).maybeSingle(),
  ]);
  if (profileRes.error) throw profileRes.error;
  const profile = profileRes.data;
  if (!profile || profile.role !== "author") return null;
  // reviews are optional: if their table is unavailable the profile still opens, without reviews
  const reviewRows = reviewRes.error ? [] : reviewRes.data ?? [];
  const reviewerIds = Array.from(new Set(reviewRows.map((r) => r.participant_id as string)));
  const nameById = new Map<string, string>();
  const avatarById = new Map<string, string | null>();
  if (reviewerIds.length) {
    const { data } = await supabase.from("profiles").select("id, name, avatar_url").in("id", reviewerIds);
    (data ?? []).forEach((p) => {
      nameById.set(p.id as string, p.name as string);
      avatarById.set(p.id as string, (p.avatar_url as string | null) ?? null);
    });
  }

  // Dev-only design preview (see dev/authorPreview.ts) — sample copy on top
  // of the real profile so the creator layer can be looked at before the
  // migration is applied. Never active in a production build.
  const preview = isAuthorPreview();
  return {
    id: profile.id as string,
    name: profile.name as string,
    avatarUrl: (profile.avatar_url as string | null) ?? (preview ? PREVIEW_PORTRAIT : null),
    memberSince: (profile.member_since as string | null) ?? null,
    details: preview ? { ...details, ...PREVIEW_DETAILS } : details,
    content,
    ...(eduFillMode()
      ? (() => { const f = fillBackground(eduFillMode()!); return { credentials: publishableCredentials(f.credentials), experience: publishableExperience(f.experience) }; })()
      : { credentials: background.credentials, experience: background.experience }),
    cases: background.cases,
    story: storyFillMode()
      ? fillStory(storyFillMode()!, story)
      : preview
      ? {
          ...story,
          media: story.media ?? PREVIEW_STORY_MEDIA,
          portraitUrl: story.portraitUrl || (profile.avatar_url ? "" : PREVIEW_PORTRAIT),
        }
      : story,
    audience: preview
      ? PREVIEW_AUDIENCE
      : audienceRes.error || !audienceRes.data
        ? null
        : {
            followers: (audienceRes.data.follower_count as number | null) ?? 0,
            participants: (audienceRes.data.participant_count as number | null) ?? 0,
          },
    reviews: preview
      ? PREVIEW_REVIEWS
      : reviewRows.map((r) => ({
      id: r.id as string,
      rating: r.rating as number,
      text: r.text as string,
      createdAt: r.created_at as string,
      reviewerName: shortName(nameById.get(r.participant_id as string)),
      reviewerAvatarUrl: avatarById.get(r.participant_id as string) ?? null,
      authorReply: (r.author_reply as string | null) ?? null,
      authorReplyAt: (r.author_replied_at as string | null) ?? null,
    })),
  };
}
