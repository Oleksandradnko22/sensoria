// Real persistence for the author-only public-profile fields
// (title/bio/credentials/site/instagram/verified) — and, since the
// publications layer, the profile copy that answers "what do I help
// people with / how do I work": positioning, approach and topics
// (author-posts-migration.sql). Topics use the existing content category
// vocabulary (data/categoryLabels.ts), stored as its keys.

import { supabase } from "./supabaseClient.ts";

export type AuthorDetails = {
  title: string;
  bio: string;
  credentials: string;
  verified: boolean;
  /** «Фахівець»: Sensoria reviewed the author's education documents (never means experience was checked). */
  educationVerified: boolean;
  site: string;
  instagram: string;
  // One or two sentences: what the author helps people with.
  positioning: string;
  // How the author works / thinks (short).
  approach: string;
  // categoryLabels keys.
  topics: string[];
  // Author Cover System (utils/authorCover.ts). null = automatic.
  coverType: string | null;
  coverVariant: string | null;
  coverImageUrl: string | null;
};

const EMPTY: AuthorDetails = {
  title: "",
  bio: "",
  credentials: "",
  verified: false,
  educationVerified: false,
  site: "",
  instagram: "",
  positioning: "",
  approach: "",
  topics: [],
  coverType: null,
  coverVariant: null,
  coverImageUrl: null,
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований — профіль не можна зберегти.");
  }
  return supabase;
}

const BASE_COLUMNS = "title, bio, credentials, verified, site, instagram";
const NEW_COLUMNS = "positioning, approach, topics, cover_type, cover_variant, cover_image_url";

const isMissingColumn = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist|Could not find the/i.test(e.message ?? ""));

// Separate query: the column exists only after author-kind-migration.sql, and
// a missing column must never break the profile.
async function fetchEducationVerified(profileId: string): Promise<boolean> {
  const { data, error } = await requireSupabase()
    .from("author_details")
    .select("education_verified")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error || !data) return false;
  return (data as { education_verified?: boolean | null }).education_verified === true;
}

export async function fetchAuthorDetails(profileId: string): Promise<AuthorDetails> {
  const [details, educationVerified] = await Promise.all([fetchAuthorDetailsBase(profileId), fetchEducationVerified(profileId)]);
  return { ...details, educationVerified };
}

async function fetchAuthorDetailsBase(profileId: string): Promise<Omit<AuthorDetails, "educationVerified">> {
  const client = requireSupabase();
  const full = await client
    .from("author_details")
    .select(`${BASE_COLUMNS}, ${NEW_COLUMNS}`)
    .eq("profile_id", profileId)
    .maybeSingle();

  // Until author-posts-migration.sql is applied the new columns don't
  // exist; the old profile must keep working exactly as before.
  const res =
    full.error && isMissingColumn(full.error)
      ? await client.from("author_details").select(BASE_COLUMNS).eq("profile_id", profileId).maybeSingle()
      : full;
  const { data, error } = res as { data: Record<string, unknown> | null; error: unknown };

  // A brand-new author row is inserted empty (see reconcileOAuthRole /
  // registerAccount trigger) — every field null is the normal starting
  // state, not an error.
  if (error || !data) return { ...EMPTY };

  const row = data as Record<string, unknown>;
  return {
    title: (row.title as string | null) ?? "",
    bio: (row.bio as string | null) ?? "",
    credentials: (row.credentials as string | null) ?? "",
    verified: (row.verified as boolean | null) ?? false,
    site: (row.site as string | null) ?? "",
    instagram: (row.instagram as string | null) ?? "",
    positioning: (row.positioning as string | null) ?? "",
    approach: (row.approach as string | null) ?? "",
    topics: (row.topics as string[] | null) ?? [],
    coverType: (row.cover_type as string | null) ?? null,
    coverVariant: (row.cover_variant as string | null) ?? null,
    coverImageUrl: (row.cover_image_url as string | null) ?? null,
  };
}

type EditableFields = Partial<
  Pick<AuthorDetails, "title" | "bio" | "credentials" | "site" | "instagram" | "positioning" | "approach" | "topics">
> & {
  cover_type?: string | null;
  cover_variant?: string | null;
  cover_image_url?: string | null;
};

export async function updateAuthorDetails(profileId: string, fields: EditableFields): Promise<void> {
  const client = requireSupabase();
  // Belt-and-suspenders upsert, not a plain update — a pre-existing
  // account whose author_details row somehow never got created (e.g.
  // role reconciliation edge cases) shouldn't silently fail to save.
  const { error } = await client.from("author_details").upsert({ profile_id: profileId, ...fields });
  if (!error) return;

  if (isMissingColumn(error)) {
    // Save what the old schema can hold, then tell the person the rest
    // needs the database update — never a silent partial save.
    const { positioning: _p, approach: _a, topics: _t, cover_type: _c1, cover_variant: _c2, cover_image_url: _c3, ...base } = fields;
    const retry = await client.from("author_details").upsert({ profile_id: profileId, ...base });
    if (retry.error) throw retry.error;
    throw new Error(
      "Основний профіль збережено, але нові поля (позиціонування, підхід, теми, обкладинка) потребують оновлення бази даних."
    );
  }
  throw error;
}
