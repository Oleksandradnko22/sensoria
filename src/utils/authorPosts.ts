// Pure logic for author publications (no supabase imports).
import { moderateMessage } from "./contactFilter.ts";

export const POST_MAX = 3000;
export const COMMENT_MAX = 1500;
export const REVIEW_REPLY_MAX = 600;

export type PostContentKind = "program" | "guide" | "meditation";

export const POST_KIND_LABEL: Record<PostContentKind, string> = {
  program: "Програма",
  guide: "Гайд",
  meditation: "Медитація",
};

const BLOCKED_PUBLIC_TEXT =
  "Тут не можна ділитися контактами чи посиланнями для спілкування або оплати поза Sensoria. Приберіть їх — і текст можна буде опублікувати.";

export type TextCheck = { ok: true } | { ok: false; message: string };

// Public text (posts, comments) goes through the SAME contact filter that
// private messages use (utils/contactFilter.ts) — no second filter. WARN
// is allowed, like in lesson comments; only BLOCK stops the text.
export function checkPublicText(text: string, max: number): TextCheck {
  const t = text.trim();
  if (!t) return { ok: false, message: "Напишіть текст." };
  if (t.length > max) return { ok: false, message: `Занадто довго: не більше ${max} символів.` };
  const mod = moderateMessage(t);
  if (mod.action === "BLOCK") {
    return {
      ok: false,
      message: mod.categories.includes("PROFANITY")
        ? "У тексті є лексика, неприйнятна на Sensoria. Перефразуйте — і його можна буде опублікувати."
        : BLOCKED_PUBLIC_TEXT,
    };
  }
  return { ok: true };
}

// A post has a single `body` column. If it opens with one short line
// followed by more text, that line reads as the headline — editorial
// rhythm without inventing a title field.
export function splitPostBody(body: string): { headline: string | null; rest: string } {
  const text = body.trim();
  const m = text.match(/^([^\n]{3,90})\n+([\s\S]+)$/);
  if (!m) return { headline: null, rest: text };
  const line = m[1].trim();
  if (/[.!?…:,;]$/.test(line)) return { headline: null, rest: text };
  return { headline: line, rest: m[2].trim() };
}

export function clipText(text: string, max: number): { text: string; clipped: boolean } {
  if (text.length <= max) return { text, clipped: false };
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return { text: `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`, clipped: true };
}

export type PostAttachment = {
  kind: PostContentKind;
  id: string;
  title: string | null;
  // "Медитація · 4 хв" — only what the canonical content really has.
  meta: string;
  unavailable: boolean;
};

export function resolveAttachment(
  kind: PostContentKind | null,
  id: string | null,
  found: { title: string; detail?: string } | null | undefined
): PostAttachment | null {
  if (!kind || !id) return null;
  if (!found) return { kind, id, title: null, meta: POST_KIND_LABEL[kind], unavailable: true };
  return {
    kind,
    id,
    title: found.title,
    meta: found.detail ? `${POST_KIND_LABEL[kind]} · ${found.detail}` : POST_KIND_LABEL[kind],
    unavailable: false,
  };
}

export type CommentRow = {
  id: string;
  parentId: string | null;
  createdAt: string;
};

// Top-level comments oldest-first, each with its author replies
// oldest-first. A reply whose parent is gone is shown as top-level
// rather than dropped.
export function threadComments<T extends CommentRow>(rows: T[]): { comment: T; replies: T[] }[] {
  const ids = new Set(rows.map((r) => r.id));
  const byTime = (a: T, b: T) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);
  const tops = rows.filter((r) => !r.parentId || !ids.has(r.parentId)).sort(byTime);
  return tops.map((comment) => ({
    comment,
    replies: rows.filter((r) => r.parentId === comment.id).sort(byTime),
  }));
}

export type PostStats = { likeCount: number; commentCount: number; liked: boolean };

export function toggleLike(stats: PostStats): PostStats {
  return stats.liked
    ? { ...stats, liked: false, likeCount: Math.max(0, stats.likeCount - 1) }
    : { ...stats, liked: true, likeCount: stats.likeCount + 1 };
}

export function appendUnique<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const seen = new Set(existing.map((e) => e.id));
  return [...existing, ...incoming.filter((i) => !seen.has(i.id))];
}

// Missing tables (migration not applied yet) must read as "unavailable",
// not as an empty feed or a crash.
export function isMissingRelation(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "42P01" ||
    e.code === "PGRST205" ||
    e.code === "PGRST200" ||
    /does not exist|schema cache|Could not find the table/i.test(e.message ?? "")
  );
}

// ── Media ───────────────────────────────────────────────────────────
export const MAX_POST_IMAGES = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type FileLike = { type: string; size: number };

// Returns an error message, or null when the files can be attached.
// `existing` = images already on the post (edit mode).
export function validateImages(files: FileLike[], existing = 0): string | null {
  if (existing + files.length > MAX_POST_IMAGES) return `Не більше ${MAX_POST_IMAGES} фото до публікації.`;
  for (const f of files) {
    if (!IMAGE_TYPES.includes(f.type)) return "Підтримуються лише JPG, PNG або WebP.";
    if (f.size > MAX_IMAGE_BYTES) return "Одне фото не більше 5 МБ.";
  }
  return null;
}

export type PostVideo = { provider: "youtube" | "vimeo"; id: string; url: string; embedUrl: string };

// Only YouTube and Vimeo links are accepted; the embed URL is rebuilt
// from the parsed id, never taken from user input as is.
export function parseVideoUrl(input: string | null | undefined): PostVideo | null {
  const raw = (input ?? "").trim();
  if (!raw || raw.length > 300) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  let yt: string | null = null;
  if (host === "youtu.be") yt = u.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") yt = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([^/]+)/);
      yt = m ? m[2] : null;
    }
  }
  if (yt !== null) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(yt)) return null;
    return {
      provider: "youtube",
      id: yt,
      url: `https://www.youtube.com/watch?v=${yt}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}`,
    };
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = u.pathname.match(/(?:^|\/)(\d{6,12})(?:\/|$)/);
    if (!m) return null;
    return {
      provider: "vimeo",
      id: m[1],
      url: `https://vimeo.com/${m[1]}`,
      embedUrl: `https://player.vimeo.com/video/${m[1]}?dnt=1`,
    };
  }
  return null;
}

// ── Media display rule ──────────────────────────────────────────────
// One image / one carousel gets ONE ratio so the feed keeps its rhythm:
// follows the first picture, but landscape never gets wider than 16:9 and
// portrait never taller than 4:5; near-square becomes exactly 1:1. Before
// the picture has loaded (ratio unknown) we reserve 16:9.
export const MEDIA_MIN_RATIO = 4 / 5;
export const MEDIA_MAX_RATIO = 16 / 9;

export function clampMediaRatio(ratio: number | null | undefined): number {
  if (!ratio || !Number.isFinite(ratio) || ratio <= 0) return MEDIA_MAX_RATIO;
  if (Math.abs(ratio - 1) < 0.06) return 1;
  return Math.min(MEDIA_MAX_RATIO, Math.max(MEDIA_MIN_RATIO, ratio));
}
