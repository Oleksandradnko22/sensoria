// Author verification: two separate requests.
//  * identity  — the «галочка»: a document that shows the person exists;
//  * education — a diploma / certificate reviewed by the team («Фахівець»).
// Sensoria only LOOKS at the documents; experience is never verified.
// The team reviews in the admin panel (author-verification-migration.sql,
// author-kind-migration.sql). Files go to a PRIVATE bucket and are deleted
// right after the decision.

import { supabase } from "./supabaseClient.ts";
import { validateVerificationFiles } from "../utils/authorVerification.ts";

export { VERIFY_MAX_FILES, validateVerificationFiles, missingProfileParts } from "../utils/authorVerification.ts";

export type VerificationKind = "identity" | "education";

export type MyVerification = {
  id: string;
  status: "pending" | "approved" | "rejected";
  rejectReason: string | null;
  createdAt: string;
};

function client() {
  if (!supabase) throw new Error("Supabase не налаштований.");
  return supabase;
}

const COLS = "id, status, reject_reason, created_at";

export async function fetchMyVerification(authorId: string, kind: VerificationKind = "identity"): Promise<MyVerification | null> {
  const c = client();
  const withKind = await c
    .from("author_verification_requests")
    .select(COLS)
    .eq("author_id", authorId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let data = withKind.data;
  if (withKind.error) {
    // Before author-kind-migration.sql there is no `kind` column: every request is an identity one.
    if (kind !== "identity") return null;
    const plain = await c
      .from("author_verification_requests")
      .select(COLS)
      .eq("author_id", authorId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (plain.error) throw plain.error;
    data = plain.data;
  }
  return data
    ? { id: data.id, status: data.status, rejectReason: data.reject_reason, createdAt: data.created_at }
    : null;
}

export async function submitVerification(
  authorId: string,
  files: File[],
  note: string,
  kind: VerificationKind = "identity"
): Promise<void> {
  const problem = validateVerificationFiles(files);
  if (problem) throw new Error(problem);
  const c = client();
  const paths: string[] = [];
  for (const [i, f] of files.entries()) {
    const ext = f.type === "application/pdf" ? "pdf" : f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg";
    const path = `${authorId}/${Date.now()}-${i}.${ext}`;
    const { error } = await c.storage.from("verification-docs").upload(path, f, { contentType: f.type, upsert: false });
    if (error) {
      await c.storage.from("verification-docs").remove(paths).catch(() => {});
      throw error;
    }
    paths.push(path);
  }
  const { error } = await c.from("author_verification_requests").insert({
    author_id: authorId,
    ...(kind === "education" ? { kind } : {}), // `kind` exists after author-kind-migration.sql
    document_paths: paths,
    note: note.trim().slice(0, 500) || null,
  });
  if (error) {
    await c.storage.from("verification-docs").remove(paths).catch(() => {});
    throw error;
  }
}
