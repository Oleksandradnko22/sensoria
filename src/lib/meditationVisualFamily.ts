// A reusable VISUAL FAMILY system for the meditation experience's hero
// object (2026-09-25, per Sasha's explicit spec — "Do not create a
// one-off decoration only for this meditation. Create a reusable visual
// system where different meditation themes can have different visual
// objects... without requiring a new component architecture for every
// meditation"). Five fixed compositional "moods" — GROUNDING, SLEEP,
// SELF-SUPPORT, FOCUS, CALM — each a distinct arrangement/motion
// treatment of the same underlying blob-layer building block in
// MeditationVisualObject (MeditationExperience.tsx). A meditation's
// family is derived from its real `tags` (data/meditations.ts) — no new
// authoring field, no fake data — so every existing/future meditation
// picks a family automatically from content that already exists.
export type MeditationVisualFamily = "grounding" | "sleep" | "selfSupport" | "focus" | "calm";

// First matching tag wins — order encodes priority (an anxious-AND-
// stressed meditation reads as "grounding" before it reads as "calm",
// since grounding is the more specific/urgent emotional need of the
// two). `calm` is the deliberate fallback for anything untagged or not
// matched below, since it's the most neutral/generic of the five moods.
const TAG_FAMILY: Record<string, MeditationVisualFamily> = {
  anxiety: "grounding",
  emotionalBalance: "grounding",
  selfEsteem: "selfSupport",
  burnout: "sleep",
  stress: "calm",
  focus: "focus",
};

export function meditationVisualFamily(tags: string[]): MeditationVisualFamily {
  for (const tag of tags) {
    const family = TAG_FAMILY[tag];
    if (family) return family;
  }
  return "calm";
}
