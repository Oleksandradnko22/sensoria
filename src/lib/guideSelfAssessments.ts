// Real persistence for a guide's "self-assessment" blocks — a 1–10
// rating taken before and after working through a guide (2026-09-09,
// per Sasha's explicit spec: "Наскільки сильно ви зараз відчуваєте
// тривогу? ... Було: 8/10, Стало: 5/10"; see supabase/schema.sql's
// guide_self_assessments). `phase` keeps the two readings distinct for
// the same guide+block+person; retaking either phase overwrites its
// previous score (upsert), it doesn't keep a history.

import { supabase } from "./supabaseClient.ts";

export type SelfAssessmentPhase = "before" | "after";

export type GuideSelfAssessment = {
  id: string;
  guideId: string;
  // Stable block id once guide-block-id-migration.sql ran; null for old rows.
  blockId: string | null;
  blockIndex: number | null;
  phase: SelfAssessmentPhase;
  score: number;
  createdAt: string;
};

type GuideSelfAssessmentRow = {
  id: string;
  guide_id: string;
  block_id?: string | null;
  block_index: number | null;
  phase: SelfAssessmentPhase;
  score: number;
  created_at: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований.");
  }
  return supabase;
}

// "*" so the read works both before and after the block_id column exists.
const SELECT_COLUMNS = "*";

// Errors that mean "the database has not been migrated to block ids yet"
// (42P10 = no unique constraint matches the upsert target).
const NOT_MIGRATED = new Set(["42703", "PGRST204", "23502", "42P10"]);

function fromRow(row: GuideSelfAssessmentRow): GuideSelfAssessment {
  return {
    id: row.id,
    guideId: row.guide_id,
    blockId: row.block_id ?? null,
    blockIndex: row.block_index ?? null,
    phase: row.phase,
    score: row.score,
    createdAt: row.created_at,
  };
}

// Every self-assessment already recorded for this guide (both phases,
// every block) — what GuideBlockRenderer reads on mount to pre-fill
// sliders and to compute the "Було → Стало" comparison.
export async function fetchSelfAssessmentsForGuide(
  guideId: string,
  userId: string
): Promise<GuideSelfAssessment[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("guide_self_assessments")
    .select(SELECT_COLUMNS)
    .eq("guide_id", guideId)
    .eq("user_id", userId);
  if (error || !data) {
    // eslint-disable-next-line no-console
    if (error) console.error("Не вдалося завантажити самооцінку гайду:", error);
    return [];
  }
  return (data as GuideSelfAssessmentRow[]).map(fromRow);
}

export async function saveSelfAssessment(params: {
  guideId: string;
  blockId: string;
  // Position — only used as the fallback while the database is not migrated.
  blockIndex: number;
  phase: SelfAssessmentPhase;
  score: number;
  userId: string;
}): Promise<GuideSelfAssessment> {
  const client = requireSupabase();
  let { data, error } = await client
    .from("guide_self_assessments")
    .upsert(
      {
        guide_id: params.guideId,
        block_id: params.blockId,
        phase: params.phase,
        score: params.score,
        user_id: params.userId,
      },
      { onConflict: "guide_id,block_id,phase,user_id" }
    )
    .select(SELECT_COLUMNS)
    .single();
  if (error && NOT_MIGRATED.has(error.code)) {
    ({ data, error } = await client
      .from("guide_self_assessments")
      .upsert(
        {
          guide_id: params.guideId,
          block_index: params.blockIndex,
          phase: params.phase,
          score: params.score,
          user_id: params.userId,
        },
        { onConflict: "guide_id,block_index,phase,user_id" }
      )
      .select(SELECT_COLUMNS)
      .single());
  }
  if (error || !data) throw error ?? new Error("Не вдалося зберегти самооцінку.");
  return fromRow(data as GuideSelfAssessmentRow);
}
