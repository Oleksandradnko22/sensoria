// The author block on a guide's preview page (2026-10-06) — Sensoria is a
// marketplace for authors, so the person who made a guide is shown as its
// creator (name, who they are), not just a name in a metadata line.
//
// Read-only and best-effort: name/avatar come from `profiles` (already
// read by participants elsewhere, e.g. reviews/messages), the
// professional line from `author_details`. Anything that can't be read
// simply comes back empty and the page falls back to the plain author
// name already carried by the guide itself — this never throws into the
// UI. `authorId` is the real account behind the guide
// (lib/contentAuthors.ts's fetchGuideAuthorId); there is no id at all for
// guides without an author account, and then this isn't called.

import { supabase } from "./supabaseClient.ts";
import { fetchAuthorDetails } from "./authorDetails.ts";

export type GuideAuthorCard = {
  name: string | null;
  avatarUrl: string | null;
  // "Психолог, спеціаліст з роботи зі стресом" — the author's own headline.
  title: string;
  credentials: string;
  // The author's own bio (author_details.bio); shown clamped to 2 lines.
  bio: string;
  verified: boolean;
};

export async function fetchGuideAuthorCard(authorId: string): Promise<GuideAuthorCard | null> {
  if (!supabase) return null;
  try {
    const [{ data: profile }, details] = await Promise.all([
      supabase.from("profiles").select("name, avatar_url").eq("id", authorId).maybeSingle(),
      fetchAuthorDetails(authorId).catch(() => null),
    ]);
    if (!profile && !details) return null;
    return {
      name: (profile?.name as string | null | undefined) ?? null,
      avatarUrl: (profile?.avatar_url as string | null | undefined) ?? null,
      title: details?.title ?? "",
      credentials: details?.credentials ?? "",
      bio: details?.bio ?? "",
      verified: details?.verified ?? false,
    };
  } catch {
    return null;
  }
}
