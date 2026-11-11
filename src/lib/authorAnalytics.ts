// Real completion-rate + per-module drop-off numbers for an author's
// own real content — feeds AuthorAnalytics.tsx alongside (not
// replacing) the existing demo showcase numbers, which stay clearly
// demo-only where there's no honest real signal to compute (page
// views, conversion, traffic sources — none of that is tracked
// anywhere in this app yet).
//
// Reuses the exact same computeProgress engine ProgramExperience.tsx
// itself runs on, against real content_progress rows read through the
// additive author-scoped SELECT policy (see
// supabase/schema.sql / author-participant-read-policies-migration.sql).

import { supabase } from "./supabaseClient.ts";
import { fetchProgramItems } from "./publicContent.ts";
import type { ItemProgressMap } from "../data/contentTypes.ts";
import { computeProgress } from "./contentProgress.ts";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

export type ModuleDropOff = {
  moduleTitle: string;
  reachedPercent: number;
};

export type ContentCompletionStats = {
  contentId: string;
  participantsCount: number;
  completionRate: number; // 0..1
  moduleDropOff: ModuleDropOff[];
};

export async function fetchCompletionAnalytics(contentIds: string[]): Promise<ContentCompletionStats[]> {
  if (contentIds.length === 0) return [];
  const client = requireSupabase();

  const { data: rows, error } = await client
    .from("content_progress")
    .select("content_id, user_id, progress")
    .in("content_id", contentIds);
  if (error || !rows || rows.length === 0) return [];

  const rowsByContent = new Map<string, { progress: ItemProgressMap }[]>();
  for (const row of rows) {
    const list = rowsByContent.get(row.content_id) ?? [];
    list.push({ progress: (row.progress as ItemProgressMap) ?? {} });
    rowsByContent.set(row.content_id, list);
  }

  const results: ContentCompletionStats[] = [];
  for (const [contentId, participantRows] of rowsByContent) {
    const modules = await fetchProgramItems(contentId);
    if (!modules || modules.length === 0) continue;

    const summaries = participantRows.map((r) => computeProgress(modules, r.progress));
    const participantsCount = summaries.length;
    const completedCount = summaries.filter((s) => s.isCompleted).length;

    // "Reached" module N = currently working on it, already past it, or
    // finished the whole program — same funnel-reading convention as
    // the demo dropOffByModule numbers this sits alongside.
    const moduleDropOff: ModuleDropOff[] = modules.map((m, moduleIndex) => {
      const reachedCount = summaries.filter(
        (s) => s.isCompleted || s.currentModuleIndex === -1 || s.currentModuleIndex >= moduleIndex
      ).length;
      return {
        moduleTitle: m.title,
        reachedPercent: participantsCount > 0 ? Math.round((reachedCount / participantsCount) * 100) : 0,
      };
    });

    results.push({
      contentId,
      participantsCount,
      completionRate: participantsCount > 0 ? completedCount / participantsCount : 0,
      moduleDropOff,
    });
  }
  return results;
}

// ── «Аналітика»: everything counted in the database (supabase/author-analytics.sql) ─────────────────────────────

export type AnalyticsMaterial = {
  id: string; kind: "program" | "meditation" | "guide"; title: string;
  views: number; sales: number; income: number; free_adds: number; participants: number;
  completion: number | null; listens: number; listened_to_end: number | null; readers: number;
  rating: number | null; reviews: number; helpful: number | null; saves: number; in_carts: number;
};
export type AnalyticsFunnel = { content_id: string; title: string; started: number; modules: { title: string; reached: number | null }[] };
export type AuthorAnalytics = {
  days: number;
  views: number; views_prev: number; views_referral: number;
  sales: number; sales_prev: number; sales_referral: number;
  income: number; income_prev: number;
  free_adds: number; new_people: number; active7: number; active30: number;
  series: { day: string; views: number; sales: number }[];
  materials: AnalyticsMaterial[];
  funnels: AnalyticsFunnel[];
};

export async function fetchAuthorAnalytics(days: number): Promise<AuthorAnalytics> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("author_analytics", { p_days: days });
  if (error) throw error;
  const d = data as AuthorAnalytics;
  return {
    ...d,
    materials: (d.materials ?? []).map((m) => ({ ...m, views: Number(m.views) || 0, income: Number(m.income) || 0, rating: m.rating == null ? null : Number(m.rating) })),
    series: d.series ?? [],
    funnels: d.funnels ?? [],
  };
}
