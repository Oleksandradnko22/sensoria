// Real persistence for "Ви переглянули X із Y розділів" (2026-09-09,
// per Sasha's explicit spec — a guide's progress should read in
// sections, not an artificial %, "гайд — не курс"; see
// supabase/schema.sql's guide_section_views). A plain toggle: a section
// (one heading-grouped page in GuideBlockRenderer.tsx) counts as viewed
// the moment someone opens it, and stays viewed — there's no "unview".

import { supabase } from "./supabaseClient.ts";
import { guides } from "../data/guides.ts";
import { getGuideSectionKeys } from "../data/guideContent.ts";
import { viewedKeys, type SectionViewRow } from "../utils/guideSectionKeys.ts";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

type Row = { guide_id: string; section_id?: string | null; section_index?: number | null };

const toRow = (row: Row): SectionViewRow => ({ sectionId: row.section_id ?? null, sectionIndex: row.section_index ?? null });

// Errors that mean "the database has not been migrated to section ids yet".
const NOT_MIGRATED = new Set(["42703", "PGRST204", "23502"]);

// Keys of the sections of THIS guide the person has viewed — by stable
// section key (heading block id), ignoring sections the guide no longer has.
export async function fetchSectionViewsForGuide(guideId: string, userId: string, currentKeys: string[]): Promise<string[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("guide_section_views")
    .select("*")
    .eq("guide_id", guideId)
    .eq("user_id", userId);
  if (error || !data) {
    // eslint-disable-next-line no-console
    if (error) console.error("Не вдалося завантажити прогрес читання гайду:", error);
    return [];
  }
  return viewedKeys((data as Row[]).map(toRow), currentKeys);
}

// How many of each guide's CURRENT sections this person has viewed, across
// every guide — what ParticipantLearning/Overview read once to compute each
// guide card's "X із Y розділів" without a query per card.
export async function fetchAllSectionViews(userId: string): Promise<Record<string, number>> {
  const client = requireSupabase();
  const { data, error } = await client.from("guide_section_views").select("*").eq("user_id", userId);
  if (error || !data) {
    // eslint-disable-next-line no-console
    if (error) console.error("Не вдалося завантажити прогрес читання гайдів:", error);
    return {};
  }
  const byGuide: Record<string, SectionViewRow[]> = {};
  for (const row of data as Row[]) (byGuide[row.guide_id] ??= []).push(toRow(row));
  const counts: Record<string, number> = {};
  for (const [guideId, rows] of Object.entries(byGuide)) {
    const guide = guides.find((g) => g.id === guideId);
    // A guide that no longer exists keeps its history but has nothing to count.
    counts[guideId] = guide ? viewedKeys(rows, getGuideSectionKeys(guide)).length : 0;
  }
  return counts;
}

export async function markSectionViewed(params: {
  guideId: string;
  sectionKey: string;
  // Position — only used as the fallback while the database is not migrated.
  sectionIndex: number;
  userId: string;
}): Promise<void> {
  const client = requireSupabase();
  let { error } = await client.from("guide_section_views").insert({
    guide_id: params.guideId,
    section_id: params.sectionKey,
    user_id: params.userId,
  });
  if (error && NOT_MIGRATED.has(error.code)) {
    ({ error } = await client.from("guide_section_views").insert({
      guide_id: params.guideId,
      section_index: params.sectionIndex,
      user_id: params.userId,
    }));
  }
  // 23505 = unique violation — already marked viewed (e.g. revisiting a
  // section, or a race with the initial fetch); not a real error.
  if (error && error.code !== "23505") throw error;
}
