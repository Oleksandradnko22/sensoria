// Uploads for author-supplied content files (covers, guide PDFs,
// meditation audio, module materials) — everything EXCEPT video.
// Video lessons intentionally don't go through here: per the free-only
// infrastructure constraint, they live on YouTube (unlisted) and only
// a link is stored (see AuthorCourseEditor.tsx's video URL fields).
// Also reused by lib/auth.ts's updateAvatar() for profile photos —
// the bucket's RLS only checks the uploader's own auth.uid() against
// the path, not their role, so it works unchanged for participants too.
//
// One shared bucket (`content-files`, created in supabase/schema.sql)
// with a path convention every caller must follow: files live under
// `{owner_id}/...` because the bucket's RLS policies check that the
// first path segment matches the uploader's own auth.uid() — nobody
// can write inside another account's folder.

import { supabase } from "./supabaseClient.ts";

const BUCKET = "content-files";
export { contentFilePath } from "../utils/storagePath.ts";

export async function uploadContentFile(
  authorId: string,
  file: File,
  // A stable, human-scannable subpath, e.g. `${contentId}/cover` —
  // the caller owns the naming so re-uploads with the same purpose
  // overwrite the previous file instead of accumulating orphans.
  subpath: string
): Promise<string> {
  if (!supabase) {
    throw new Error("Supabase не налаштований — файл не можна завантажити.");
  }
  const extension = file.name.includes(".") ? file.name.split(".").pop() : undefined;
  const path = `${authorId}/${subpath}${extension ? `.${extension}` : ""}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, cacheControl: "3600" });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Best-effort delete of a single object at `path` within the shared
// bucket — used by lib/auth.ts's removeAvatar() to clean up the old
// file when a person removes their photo. Deliberately swallows
// errors (missing file, etc.) since the caller's real goal is just
// clearing the profiles.avatar_url field, not this cleanup step.
export async function deleteContentFile(path: string): Promise<void> {
  if (!supabase) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

// ── Paid files ────────────────────────────────────────────────────────────────────────────────────────────────
// Files of PAID guides and meditations live in the private `paid-files` bucket (supabase/paid-files-migration.sql).
// What is stored in the database is a reference, not a link: `paid:{author}/{content}/{file}`. It is turned into a
// short-lived signed link only for people storage lets read it (the author, an active buyer).
const PAID_BUCKET = "paid-files";
const PAID_PREFIX = "paid:";
// long enough for a session; the list is read again on every sign-in and page load
const SIGNED_URL_SECONDS = 12 * 60 * 60;

export const isPaidFileRef = (v: string | null | undefined): v is string => !!v && v.startsWith(PAID_PREFIX);

export async function uploadPaidFile(authorId: string, contentId: string, file: File, name: string): Promise<string> {
  if (!supabase) throw new Error("Supabase не налаштований — файл не можна завантажити.");
  const extension = file.name.includes(".") ? file.name.split(".").pop() : undefined;
  const path = `${authorId}/${contentId}/${name}${extension ? `.${extension}` : ""}`;
  const { error } = await supabase.storage.from(PAID_BUCKET).upload(path, file, { upsert: true, cacheControl: "3600" });
  if (error) throw error;
  return `${PAID_PREFIX}${path}`;
}

// Several references at once; a reference that cannot be signed (no access) is simply left out of the result.
export async function signPaidFileRefs(refs: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(refs.filter(isPaidFileRef))];
  if (!supabase || unique.length === 0) return out;
  const paths = unique.map((r) => r.slice(PAID_PREFIX.length));
  const { data, error } = await supabase.storage.from(PAID_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error || !data) return out;
  data.forEach((d, i) => {
    if (d.signedUrl) out.set(unique[i], d.signedUrl);
  });
  return out;
}
