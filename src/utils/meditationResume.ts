// Pure resume rule for a meditation's saved audio position (no I/O, so it is
// unit-tested in node).

export type MeditationAudioPosition = {
  positionSeconds: number;
  durationSeconds: number | null;
};

// Per Sasha's explicit call (2026-08-28): a saved position within 10s
// of either edge doesn't count as "actually stopped partway through"
// — starting a track and immediately backing out, or reaching the
// last few seconds, both mean "this is effectively a fresh listen"
// even though a raw DB row exists. One constant, one check, shared by
// every place that decides whether to treat a position as resumable
// (the player's own seed-on-load, the intro screen's "Продовжити"
// prompt, and the "Моє навчання" card's "Зупинено на").
export const RESUME_EDGE_THRESHOLD_SECONDS = 10;

// durationOverride lets a caller that already has the real, freshly-
// loaded <audio> duration (more authoritative than whatever was saved
// alongside the position, which could in principle be stale) use that
// instead of pos.durationSeconds.
export function isResumablePosition(
  pos: MeditationAudioPosition | null,
  durationOverride?: number | null
): boolean {
  if (!pos) return false;
  if (pos.positionSeconds < RESUME_EDGE_THRESHOLD_SECONDS) return false;
  const duration = durationOverride ?? pos.durationSeconds;
  if (duration != null && pos.positionSeconds > duration - RESUME_EDGE_THRESHOLD_SECONDS) return false;
  return true;
}
