// Real persistence for the wellbeing assessment's outcome
// (funnelStore's `FunnelInsight`), tied to the actual account instead
// of only living in the browser's sessionStorage. One row per profile
// — every save upserts, so this always represents the participant's
// latest completed assessment.

import { supabase } from "./supabaseClient.ts";
import type { FunnelInsight, PrimaryStateId, Intensity } from "../store/funnelStore.ts";
import { isPrimaryStateId, isIntensity, clampScore } from "../utils/primaryState.ts";
import { getIntensity } from "../utils/calculateResults.ts";

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

type Row = {
  primary_state: string;
  intensity: string;
  primary_score: number;
  secondary_state: string | null;
  supporting_patterns: unknown;
  completed_at: string;
};
const COLS = "primary_state, intensity, primary_score, secondary_state, supporting_patterns, completed_at";

// Defensive validation (2026-09-16 technical audit): a corrupted or legacy row reads as "no result" instead of a
// value that would crash `stateProfiles[primaryState][intensity]`.
function toSaved(data: Row | null): SavedAssessment | null {
  if (!data || !isPrimaryStateId(data.primary_state) || !isIntensity(data.intensity)) return null;
  return {
    primaryState: data.primary_state,
    intensity: data.intensity,
    primaryScore: clampScore(data.primary_score),
    secondaryState: data.secondary_state && isPrimaryStateId(data.secondary_state) ? data.secondary_state : null,
    supportingPatterns: Array.isArray(data.supporting_patterns) ? (data.supporting_patterns as SavedAssessment["supportingPatterns"]) : [],
    completedAt: data.completed_at,
  };
}

/** The last attempts, newest first (supabase/assessment-history.sql). Empty before that migration. */
export async function fetchAssessmentHistory(profileId: string, limit = 3): Promise<SavedAssessment[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("assessment_history")
    .select(COLS)
    .eq("profile_id", profileId)
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as Row[]).map(toSaved).filter((x): x is SavedAssessment => x !== null);
}

/**
 * The profile from the last 3 attempts: the state that came up most often (on a tie — the newest one), its average
 * score and the intensity of that average; the rest (secondary state, patterns, date) from the newest attempt.
 * One attempt = exactly that attempt.
 */
export function combineAssessments(history: SavedAssessment[]): SavedAssessment | null {
  if (history.length === 0) return null;
  const newest = history[0];
  const counts = new Map<PrimaryStateId, number>();
  history.forEach((h) => counts.set(h.primaryState, (counts.get(h.primaryState) ?? 0) + 1));
  const top = Math.max(...counts.values());
  const state = history.find((h) => counts.get(h.primaryState) === top)!.primaryState; // newest first = newest wins a tie
  const same = history.filter((h) => h.primaryState === state);
  const score = clampScore(Math.round(same.reduce((a, h) => a + h.primaryScore, 0) / same.length));
  return { ...newest, primaryState: state, primaryScore: score, intensity: getIntensity(score) };
}

export async function fetchAssessmentResult(
  profileId: string
): Promise<SavedAssessment | null> {
  const history = await fetchAssessmentHistory(profileId, 3);
  if (history.length > 0) return combineAssessments(history);
  // before the history migration: the single latest row
  const client = requireSupabase();
  const { data, error } = await client.from("assessment_results").select(COLS).eq("profile_id", profileId).single();
  if (error || !data) return null;
  return toSaved(data as Row);
}
