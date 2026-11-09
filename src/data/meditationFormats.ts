// "Формат" — how much of the audio is the author's voice vs. just
// music/silence. Sasha's explicit call (2026-08-28): some people want
// a steady guiding voice throughout, others just want a couple of
// short cues over music — this is metadata about the RECORDING itself
// (like duration), not a per-session choice, so it lives right next to
// duration/tags on the meditation, shown on the card, filterable in
// the catalog same as category, and shown again in the intro meta line
// before starting.
export type MeditationFormat = "guided" | "minimal" | "silent";

export const meditationFormatLabels: Record<MeditationFormat, string> = {
  guided: "З голосом",
  minimal: "Голос і музика",
  silent: "У тиші",
};

export const MEDITATION_FORMATS: MeditationFormat[] = ["guided", "minimal", "silent"];
