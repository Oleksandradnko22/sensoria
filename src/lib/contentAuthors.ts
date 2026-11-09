// Resolves a real author profile id for demo-catalog content
// (data/guides.ts / data/meditations.ts) that isn't itself a row in the
// real `content` table — the same gap fetchProgramById exists to fill
// for programs, but for guides/meditations there's no per-item
// authoring flow yet, just this small id→author mapping (2026-09-09,
// per Sasha's "Запитати автора" spec).
//
// meditation_authors already existed (added for author-side feedback
// visibility — see schema.sql); guide_authors is new, an exact mirror.
// Both tables are just an id→id mapping with no personal content, so
// their RLS policy is "readable by any signed-in user" rather than
// author-only.

import { supabase } from "./supabaseClient.ts";

export async function fetchMeditationAuthorId(meditationId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("meditation_authors")
    .select("author_id")
    .eq("meditation_id", meditationId)
    .maybeSingle();
  if (error || !data) return null;
  return data.author_id;
}

export async function fetchGuideAuthorId(guideId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("guide_authors")
    .select("author_id")
    .eq("guide_id", guideId)
    .maybeSingle();
  if (error || !data) return null;
  return data.author_id;
}
