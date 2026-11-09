// Persistence for an author's structured professional background
// (author-credentials-migration.sql). Public reads only ever return
// is_public rows (enforced by RLS too); a missing table (migration not
// applied) just means "nothing to show" — the profile keeps working.
import { supabase } from "./supabaseClient.ts";
import { uploadContentFile, deleteContentFile } from "./storage.ts";
import { ownImage, storagePath } from "./ownImage.ts";
import { CASE_LIMITS, normalizeCaseDetails, detailsForSave, publishableCases, sortCases } from "../utils/authorCases.ts";
import {
  validateCredentialImage,
  isDegreeLevel,
  publishableCredentials,
  publishableExperience,
  type AuthorCase,
  type AuthorCredential,
  type AuthorExperience,
  type CredentialKind,
} from "../utils/authorCredentials.ts";

const CRED_BASE = "id, kind, title, issuer, issued_year, description, image_url, is_public";
// `degree` needs author-credentials-degree-migration.sql; until then fall back.
// once the server says `degree` is missing, don't ask for it again in this session (no repeated 400s)
let degreeMissing = false;
const credCols = () => (degreeMissing ? CRED_BASE : `${CRED_BASE}, degree`);
const CASE_BASE = "id, title, situation, approach, content_kind, content_id, is_public";
// `details` needs author-cases-details-migration.sql; until then fall back.
const CASE_COLS = `${CASE_BASE}, details`;
const EXP_COLS = "id, organization, role, description, start_year, end_year, is_current, is_public";

type Row = Record<string, unknown>;

// storage path of one of the author's case screenshots, or null
const reviewPath = (u: string, authorId: string) => storagePath(u, authorId, "cases");
const removeReviewFiles = async (urls: string[], authorId: string) => {
  for (const u of urls) {
    const p = reviewPath(u, authorId);
    if (p) await deleteContentFile(p);
  }
};

const toCredential = (r: Row): AuthorCredential => ({
  id: r.id as string,
  kind: ((r.kind as string) ?? "education") as CredentialKind,
  degree: isDegreeLevel(r.degree) ? r.degree : null,
  title: (r.title as string) ?? "",
  issuer: (r.issuer as string | null) ?? "",
  year: (r.issued_year as number | null) ?? null,
  description: (r.description as string | null) ?? "",
  imageUrl: (r.image_url as string | null) ?? null,
  isPublic: !!r.is_public,
});

const toCase = (r: Row): AuthorCase => ({
  id: r.id as string,
  title: (r.title as string) ?? "",
  situation: (r.situation as string | null) ?? "",
  approach: (r.approach as string | null) ?? "",
  contentKind: (r.content_kind as AuthorCase["contentKind"]) ?? null,
  contentId: (r.content_id as string | null) ?? null,
  details: (() => { const d = normalizeCaseDetails(r.details); return { ...d, reviewImages: d.reviewImages.filter(ownImage) }; })(),
  isPublic: !!r.is_public,
});

const toExperience = (r: Row): AuthorExperience => ({
  id: r.id as string,
  organization: (r.organization as string) ?? "",
  role: (r.role as string | null) ?? "",
  description: (r.description as string | null) ?? "",
  startYear: (r.start_year as number | null) ?? null,
  endYear: (r.end_year as number | null) ?? null,
  isCurrent: !!r.is_current,
  isPublic: !!r.is_public,
});

export type Background = { credentials: AuthorCredential[]; experience: AuthorExperience[]; cases: AuthorCase[] };

// Public view: explicit is_public filter on top of RLS. Errors (e.g. the
// tables don't exist yet) degrade to empty lists.
export async function fetchPublicBackground(authorId: string): Promise<Background> {
  if (!supabase) return { credentials: [], experience: [], cases: [] };
  const q = (table: string, cols: string) => supabase!.from(table).select(cols).eq("author_id", authorId).eq("is_public", true).order("created_at");
  const [c0, e, k0] = await Promise.all([q("author_credentials", credCols()), q("author_experience", EXP_COLS), q("author_cases", CASE_COLS)]);
  let c = c0;
  let k = k0;
  if (c.error) {
    degreeMissing = true;
    c = await q("author_credentials", CRED_BASE);
  }
  if (k.error) k = await q("author_cases", CASE_BASE);
  // incomplete / legacy records stay stored but are not shown to visitors
  return {
    credentials: c.error ? [] : publishableCredentials(((c.data ?? []) as unknown as Row[]).map(toCredential)),
    experience: e.error ? [] : publishableExperience(((e.data ?? []) as unknown as Row[]).map(toExperience)),
    cases: k.error ? [] : sortCases(publishableCases(((k.data ?? []) as unknown as Row[]).map(toCase))),
  };
}

// The author's own view (all rows, public or not).
export async function fetchOwnBackground(authorId: string): Promise<Background & { available: boolean }> {
  if (!supabase) return { credentials: [], experience: [], cases: [], available: false };
  const q = (table: string, cols: string) => supabase!.from(table).select(cols).eq("author_id", authorId).order("created_at");
  const [c0, e, k0] = await Promise.all([q("author_credentials", credCols()), q("author_experience", EXP_COLS), q("author_cases", CASE_COLS)]);
  let c = c0;
  let k = k0;
  if (c.error) {
    degreeMissing = true;
    c = await q("author_credentials", CRED_BASE);
  }
  if (k.error) k = await q("author_cases", CASE_BASE);
  return {
    credentials: c.error ? [] : ((c.data ?? []) as unknown as Row[]).map(toCredential),
    experience: e.error ? [] : ((e.data ?? []) as unknown as Row[]).map(toExperience),
    cases: k.error ? [] : sortCases(((k.data ?? []) as unknown as Row[]).map(toCase)),
    available: !c.error && !e.error && !k.error,
  };
}

export type CredentialDraft = Omit<AuthorCredential, "id" | "imageUrl"> & { id?: string; imageUrl?: string | null };

export async function saveCredential(authorId: string, draft: CredentialDraft, imageFile?: File | null): Promise<AuthorCredential> {
  if (!supabase) throw new Error("Supabase не налаштований.");
  if (imageFile) {
    const v = validateCredentialImage(imageFile);
    if (!v.ok) throw new Error(v.error);
  }
  // The id is needed up front for a stable storage path.
  const id = draft.id ?? crypto.randomUUID();
  let imageUrl = draft.imageUrl ?? null;
  if (imageFile) imageUrl = await uploadContentFile(authorId, imageFile, `credentials/${id}`);
  const row = {
    id,
    author_id: authorId,
    kind: draft.kind,
    title: draft.title.trim(),
    issuer: draft.issuer.trim() || null,
    issued_year: draft.year,
    description: draft.description.trim() || null,
    image_url: imageUrl,
    is_public: draft.isPublic,
    ...(degreeMissing ? {} : { degree: draft.kind === "education" ? draft.degree : null }),
  };
  const res = await supabase.from("author_credentials").upsert(row).select(credCols()).single();
  if (res.error && /degree|column|schema cache/i.test(res.error.message ?? "")) {
    // degree column not created yet: save the rest, tell the author
    degreeMissing = true;
    const { degree: _d, ...rest } = row as typeof row & { degree?: unknown };
    const retry = await supabase.from("author_credentials").upsert(rest).select(CRED_BASE).single();
    if (retry.error) throw retry.error;
    if (draft.degree) throw new Error("Запис збережено, але рівень освіти потребує оновлення бази даних (файл author-credentials-degree-migration.sql).");
    return toCredential(retry.data as Row);
  }
  if (res.error) throw res.error;
  return toCredential(res.data as unknown as Row);
}

export async function setCredentialPublic(id: string, isPublic: boolean): Promise<void> {
  if (!supabase) throw new Error("Supabase не налаштований.");
  const { error } = await supabase.from("author_credentials").update({ is_public: isPublic }).eq("id", id);
  if (error) throw error;
}

export async function deleteCredential(authorId: string, c: AuthorCredential): Promise<void> {
  if (!supabase) throw new Error("Supabase не налаштований.");
  const { error } = await supabase.from("author_credentials").delete().eq("id", c.id);
  if (error) throw error;
  // best-effort: remove the stored image (path = {author}/credentials/{id}.ext)
  if (c.imageUrl) {
    const m = c.imageUrl.match(/content-files\/(.+?)(?:\?|$)/);
    if (m && m[1].startsWith(`${authorId}/credentials/`)) await deleteContentFile(decodeURIComponent(m[1]));
  }
}

export type ExperienceDraft = Omit<AuthorExperience, "id"> & { id?: string };

export async function saveExperience(authorId: string, draft: ExperienceDraft): Promise<AuthorExperience> {
  if (!supabase) throw new Error("Supabase не налаштований.");
  const row = {
    ...(draft.id ? { id: draft.id } : {}),
    author_id: authorId,
    organization: draft.organization.trim(),
    role: draft.role.trim() || null,
    description: draft.description.trim() || null,
    start_year: draft.startYear,
    end_year: draft.isCurrent ? null : draft.endYear,
    is_current: draft.isCurrent,
    is_public: draft.isPublic,
  };
  const { data, error } = await supabase.from("author_experience").upsert(row).select(EXP_COLS).single();
  if (error) throw error;
  return toExperience(data as Row);
}

export async function setExperiencePublic(id: string, isPublic: boolean): Promise<void> {
  if (!supabase) throw new Error("Supabase не налаштований.");
  const { error } = await supabase.from("author_experience").update({ is_public: isPublic }).eq("id", id);
  if (error) throw error;
}

export async function deleteExperience(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase не налаштований.");
  const { error } = await supabase.from("author_experience").delete().eq("id", id);
  if (error) throw error;
}

export type CaseDraft = Omit<AuthorCase, "id"> & { id?: string };

export async function saveCase(authorId: string, d: CaseDraft, reviewFiles: File[] = []): Promise<AuthorCase> {
  if (!supabase) throw new Error("Supabase не налаштований.");
  for (const f of reviewFiles) {
    const v = validateCredentialImage(f);
    if (!v.ok) throw new Error(v.error);
  }
  const id = d.id ?? crypto.randomUUID();
  if (d.details.reviewImages.length + reviewFiles.length > CASE_LIMITS.reviews) throw new Error(`Скриншотів відгуків — не більше ${CASE_LIMITS.reviews}.`);
  const uploaded: string[] = [];
  for (const f of reviewFiles) uploaded.push(await uploadContentFile(authorId, f, `cases/${id}-review-${Date.now().toString(36)}-${uploaded.length}`));
  const prev = d.id ? await supabase.from("author_cases").select("details").eq("id", d.id).maybeSingle() : null;
  const prevImages = normalizeCaseDetails((prev?.data as Row | null)?.details).reviewImages;
  if (uploaded.length) d = { ...d, details: { ...d.details, reviewImages: [...d.details.reviewImages, ...uploaded] } };
  const row = {
    id,
    author_id: authorId,
    title: d.title.trim(),
    situation: d.situation.trim() || null,
    approach: d.approach.trim() || null,
    content_kind: d.contentId ? d.contentKind : null,
    content_id: d.contentId,
    is_public: d.isPublic,
  };
  const withDetails = { ...row, details: detailsForSave(d.details) };
  let res = await supabase.from("author_cases").upsert(withDetails).select(CASE_COLS).single();
  // column not migrated yet: save the base fields only
  if (res.error && /details/.test(res.error.message)) res = await supabase.from("author_cases").upsert(row).select(CASE_BASE).single();
  if (res.error) throw res.error;
  const saved = toCase(res.data as unknown as Row);
  // screenshots the author removed no longer stay in storage
  await removeReviewFiles(prevImages.filter((u) => !saved.details.reviewImages.includes(u)), authorId);
  return saved;
}

// Manual order of the author's cases: 0..n-1 stored in details.order (no new column).
export async function saveCaseOrder(list: AuthorCase[]): Promise<AuthorCase[]> {
  if (!supabase) throw new Error("Supabase не налаштований.");
  const next = list.map((c, i) => ({ ...c, details: { ...c.details, order: i } }));
  for (const [i, c] of next.entries()) {
    if (list[i].details.order === i) continue;
    const { error } = await supabase.from("author_cases").update({ details: detailsForSave(c.details) }).eq("id", c.id);
    if (error) throw error;
  }
  return next;
}

export async function setCasePublic(id: string, isPublic: boolean): Promise<void> {
  if (!supabase) throw new Error("Supabase не налаштований.");
  const { error } = await supabase.from("author_cases").update({ is_public: isPublic }).eq("id", id);
  if (error) throw error;
}

export async function deleteCase(id: string, authorId?: string): Promise<void> {
  if (!supabase) throw new Error("Supabase не налаштований.");
  const prev = authorId ? await supabase.from("author_cases").select("details").eq("id", id).maybeSingle() : null;
  const { error } = await supabase.from("author_cases").delete().eq("id", id);
  if (error) throw error;
  if (authorId) await removeReviewFiles(normalizeCaseDetails((prev?.data as Row | null)?.details).reviewImages, authorId);
}
