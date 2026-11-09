// Real persistence for the wellbeing assessment's outcome
// (funnelStore's `FunnelInsight`), tied to the actual account instead
// of only living in the browser's sessionStorage. One row per profile
// — every save upserts, so this always represents the participant's
// latest completed assessment.

import { supabase } from "./supabaseClient.ts";
import type { FunnelInsight, PrimaryStateId, Intensity } from "../store/funnelStore.ts";
import { isPrimaryStateId, isIntensity, clampScore } from "../utils/primaryState.ts";

export type SavedAssessment = {
  primaryState: PrimaryStateId;
  intensity: Intensity;
  primaryScore: number;
  secondaryState: PrimaryStateId | null;
  supportingPatterns: { category: string; normalizedScore: number }[];
  completedAt: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований — результат оцінки не можна зберегти.");
  }
  return supabase;
}

export async function saveAssessmentResult(
  profileId: string,
  insight: FunnelInsight
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("assessment_results").upsert({
    profile_id: profileId,
    primary_state: insight.primaryState,
    intensity: insight.intensity,
    primary_score: insight.primaryScore,
    secondary_state: insight.secondaryState,
    supporting_patterns: insight.supportingPatterns,
    completed_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function fetchAssessmentResult(
  profileId: string
): Promise<SavedAssessment | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("assessment_results")
    .select(
      "primary_state, intensity, primary_score, secondary_state, supporting_patterns, completed_at"
    )
    .eq("profile_id", profileId)
    .single();
  if (error || !data) return null;

  // Defensive validation (2026-09-16 technical audit) — a corrupted or
  // legacy row should read as "no result" (the same fallback the
  // error/no-data case above already uses), not sail through as a
  // "valid" typed value that crashes the first component that does
  // `stateProfiles[primaryState][intensity]` or
  // `stateAccentColors[primaryState]` with a key outside either union.
  if (!isPrimaryStateId(data.primary_state) || !isIntensity(data.intensity)) {
    return null;
  }

  return {
    primaryState: data.primary_state,
    intensity: data.intensity,
    primaryScore: clampScore(data.primary_score),
    secondaryState: data.secondary_state && isPrimaryStateId(data.secondary_state) ? data.secondary_state : null,
    supportingPatterns: Array.isArray(data.supporting_patterns) ? data.supporting_patterns : [],
    completedAt: data.completed_at,
  };
}
