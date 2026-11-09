// Shared mm:ss formatting for anything tied to real audio/video
// position (meditation player progress, "stopped at" summaries, etc.)
// — pulled out of MeditationExperience.tsx so ParticipantLearning's
// card can use the exact same format instead of a second, possibly
// drifting implementation.
export function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
