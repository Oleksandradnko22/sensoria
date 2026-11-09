// Single source of truth for "is this string actually a valid
// PrimaryStateId/Intensity" (2026-09-16, Emotional Profile technical
// audit). Before this, calculateResults.ts kept its own private
// `isPrimaryStateId` (used to validate the Result Engine's own input),
// while lib/assessment.ts's `fetchAssessmentResult` blindly cast
// whatever a Supabase row contained via `as PrimaryStateId`/`as
// Intensity` with no validation at all — a corrupted or legacy row
// would sail through as a "valid" typed value, then crash downstream
// the first time something did `stateProfiles[primaryState][intensity]`
// (utils/getStateProfile.ts) or `stateAccentColors[primaryState]` with a
// key that isn't actually in either object.
//
// Both call sites now import these two guards instead of keeping their
// own copy or skipping validation — one real list of valid values,
// checked the same way everywhere a value crosses a trust boundary
// (a fresh Result Engine run, or a row read back from the database).
//
// Deliberately only a type-only import (erased at runtime, so this file
// has zero runtime dependencies) — same convention as lib/guideProgress.ts
// and lib/contentDiversity.ts, so this stays trivially unit-testable in
// isolation and safe to import from a test file under Node's plain ESM
// loader.
import type { PrimaryStateId, Intensity } from "../store/funnelStore.ts";

const PRIMARY_STATE_IDS: readonly PrimaryStateId[] = [
  "anxiety",
  "stress",
  "burnout",
  "selfEsteem",
  "relationships",
  "motivation",
];

const INTENSITIES: readonly Intensity[] = ["low", "moderate", "high", "critical"];

export function isPrimaryStateId(value: string): value is PrimaryStateId {
  return (PRIMARY_STATE_IDS as readonly string[]).includes(value);
}

export function isIntensity(value: string): value is Intensity {
  return (INTENSITIES as readonly string[]).includes(value);
}

// A score is only ever meaningful as an integer 0-100 (see
// calculateResults.ts's own normalization comment). Used both where a
// fresh score is computed and where one is read back from storage, so a
// future bug in either place degrades to a clamped, finite number
// instead of NaN/undefined/an out-of-range value reaching the UI.
export function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
