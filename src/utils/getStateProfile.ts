import { stateProfiles } from "../data/stateProfiles.ts";
import type { PrimaryStateId, Intensity } from "../store/funnelStore.ts";

/**
 * The single, typed way to read a State Profile (RFC-002). Replaces the
 * three previously duplicated inline `stateProfiles[...][...]` lookups
 * that used to live in ResultPage.tsx and App.tsx.
 *
 * Typed against the closed `PrimaryStateId`/`Intensity` unions, and
 * `stateProfiles` is typed as `Record<PrimaryStateId, Record<Intensity,
 * StateProfile>>` — so an invalid state or intensity cannot compile, and
 * this function can never return `undefined`.
 */
export function getStateProfile(
  primaryState: PrimaryStateId,
  intensity: Intensity
) {
  return stateProfiles[primaryState][intensity];
}