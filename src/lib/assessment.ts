// Real persistence for the wellbeing assessment's outcome
// (funnelStore's `FunnelInsight`), tied to the actual account instead
// of only living in the browser's sessionStorage. One row per profile
// — every save upserts, so this always represents the participant's
// latest completed assessment.

import { supabase } from "./supabaseClient.ts";
import type { FunnelInsight, PrimaryStateId, Intensity } from "../store/funnelStore.ts";
import { isPrimaryStateId, isIntensity, clampScore } from "../utils/primaryState.ts";
import { getIntensity } from "../utils/calculateResults.ts";
import { fetchHealthConsent, whenHealthConsented } from "./healthConsent.ts";

export type SavedAssessment = {
  primaryState: PrimaryStateId;
  intensity: Intensity;
  primaryScore: number;
  secondaryState: PrimaryStateId | null;
  supportingPatterns: { category: string; normalizedScore: number }[];
  completedAt: string;
  /** questionnaire version; 1 for results before 21.11.2026 */
  version: number;
  /** version 2: impact on life, safety, hint of another state, level of the second chosen state */
  details: AssessmentDetails;
};

export type AssessmentDetails = {
  impact?: number;
  safety?: boolean;
  suggestedState?: PrimaryStateId | null;
  secondaryIntensity?: Intensity | null;
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
  // emotional-state data only with the separate consent (Угода учасника п. 8). Right after sign-up the consent
  // screen has not been answered yet: the result waits and is saved as soon as the consent is given.
  // only with a confirmed consent: «unknown» (not signed in yet, network error) waits too — the database refuses it
  // anyway (health-consent.sql), and nothing about the emotional state reaches the server without the consent
  if ((await fetchHealthConsent()) !== "yes") {
    whenHealthConsented(() => saveAssessmentResult(profileId, insight));
    return;
  }
  const client = requireSupabase();
  const row = {
    profile_id: profileId,
    primary_state: insight.primaryState,
    intensity: insight.intensity,
    primary_score: insight.primaryScore,
    secondary_state: insight.secondaryState,
    supporting_patterns: insight.supportingPatterns,
    completed_at: new Date().toISOString(),
  };
  const details: AssessmentDetails = {
    impact: insight.impact,
    safety: insight.safety,
    suggestedState: insight.suggestedState ?? null,
    secondaryIntensity: insight.secondaryIntensity ?? null,
  };
  let { error } = await client.from("assessment_results").upsert({ ...row, version: insight.version ?? 1, details });
  // before supabase/assessment-v2.sql the two columns do not exist yet: the result is still saved, without them
  if (error && (error.code === "PGRST204" || error.code === "42703")) ({ error } = await client.from("assessment_results").upsert(row));
  if (error) throw error;
}

type Row = {
  primary_state: string;
  intensity: string;
  primary_score: number;
  secondary_state: string | null;
  supporting_patterns: unknown;
  completed_at: string;
  version?: number | null;
  details?: unknown;
};
const BASE_COLS = "primary_state, intensity, primary_score, secondary_state, supporting_patterns, completed_at";
const COLS = `${BASE_COLS}, version, details`;
const missingColumn = (e: { code?: string } | null) => !!e && (e.code === "42703" || e.code === "PGRST204");

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
    version: typeof data.version === "number" ? data.version : 1,
    details: readDetails(data.details),
  };
}

function readDetails(raw: unknown): AssessmentDetails {
  if (!raw || typeof raw !== "object") return {};
  const d = raw as Record<string, unknown>;
  return {
    impact: typeof d.impact === "number" ? d.impact : undefined,
    safety: d.safety === true,
    suggestedState: typeof d.suggestedState === "string" && isPrimaryStateId(d.suggestedState) ? d.suggestedState : null,
    secondaryIntensity: typeof d.secondaryIntensity === "string" && isIntensity(d.secondaryIntensity) ? d.secondaryIntensity : null,
  };
}

/** The last attempts, newest first (supabase/assessment-history.sql). Empty before that migration. */
export async function fetchAssessmentHistory(profileId: string, limit = 3): Promise<SavedAssessment[]> {
  const client = requireSupabase();
  const query = (cols: string) => client
    .from("assessment_history")
    .select(cols)
    .eq("profile_id", profileId)
    .order("completed_at", { ascending: false })
    .limit(limit);
  let { data, error } = await query(COLS);
  if (missingColumn(error)) ({ data, error } = await query(BASE_COLS));
  if (error || !data) return [];
  return (data as unknown as Row[]).map(toSaved).filter((x): x is SavedAssessment => x !== null);
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
  // version 2 can raise the level by the impact on daily life: the newest attempt of this state keeps that raise
  const ORDER: Intensity[] = ["low", "moderate", "high", "critical"];
  const byScore = getIntensity(score);
  const latest = same[0].intensity;
  const intensity = same[0].version >= 2 && ORDER.indexOf(latest) > ORDER.indexOf(byScore) ? latest : byScore;
  return { ...newest, primaryState: state, primaryScore: score, intensity };
}

export async function fetchAssessmentResult(
  profileId: string
): Promise<SavedAssessment | null> {
  const history = await fetchAssessmentHistory(profileId, 3);
  if (history.length > 0) return combineAssessments(history);
  // before the history migration: the single latest row
  const client = requireSupabase();
  let { data, error } = await client.from("assessment_results").select(COLS).eq("profile_id", profileId).single();
  if (missingColumn(error)) ({ data, error } = await client.from("assessment_results").select(BASE_COLS).eq("profile_id", profileId).single());
  if (error || !data) return null;
  return toSaved(data as unknown as Row);
}
