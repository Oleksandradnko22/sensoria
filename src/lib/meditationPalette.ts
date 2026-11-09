// Shared meditation visual identity (2026-09-24, meditation experience
// redesign — extracted out of ParticipantLearning.tsx so the catalog
// cards, the "Ваш маршрут" continue block, AND MeditationExperience's
// own hero visual object all draw from exactly one palette source
// instead of independently deciding what "meditation-flavored" looks
// like. That's the literal fix for "each screen looks like a different
// product" — one deterministic, per-meditation color identity used
// everywhere a meditation shows up. Lavender/blue/cyan/soft-mint family
// only, per Sasha's explicit spec — no neon, no unrelated hues, nothing
// that reads as a generic wellness-app teal.
//
// 2026-09-26 brand-alignment rebuild: MeditationExperience's OUTER shell
// (environment gradient, main content surface, primary CTA) now reuses
// ProgramExperience's own fixed Sensoria brand treatment directly
// (blue→violet environment, white rounded surface, blue→purple CTA —
// see ProgramExperience.tsx) instead of a per-meditation ambient wash,
// per Sasha's explicit spec: "SAME BRAND, DIFFERENT EXPERIENCE, not SAME
// PAGE, DIFFERENT CONTENT". This file's per-meditation palette is now
// used only for the meditation's own VISUAL OBJECT and small local
// accents inside that shared white surface — no longer for full-page
// backgrounds or the primary CTA — so the earlier tintWithWhite/
// meditationAtmosphere/meditationAmbient/meditationCtaGradient helpers
// (all full-page-background or CTA-gradient specific) are gone; only
// the palette itself and tintWithNavy (used by the SLEEP visual family)
// remain.
export const MEDITATION_PALETTES: readonly [string, string, string][] = [
  ["#c4b5fd", "#93c5fd", "#67e8f9"],
  ["#ddd6fe", "#a5b4fc", "#7dd3fc"],
  ["#e9d5ff", "#bfdbfe", "#a5f3fc"],
  ["#c7d2fe", "#93c5fd", "#5eead4"],
  ["#d8b4fe", "#818cf8", "#38bdf8"],
];

// Deterministic (hashed from contentId, not random) — the same
// meditation always gets the same visual identity across renders,
// sessions, and every component that shows it.
export function meditationPalette(id: string): readonly [string, string, string] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return MEDITATION_PALETTES[hash % MEDITATION_PALETTES.length];
}

// Mixes a palette color toward a deep night-navy instead of white —
// the SLEEP visual family's own tint (2026-09-25, per Sasha's explicit
// spec: "SLEEP → slow dark blue floating forms"). Fully opaque rgb().
export function tintWithNavy(hex: string, amount: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const navy = { r: 15, g: 18, b: 38 };
  const mix = (channel: number, target: number) => Math.round(channel + (target - channel) * amount);
  return `rgb(${mix(r, navy.r)}, ${mix(g, navy.g)}, ${mix(b, navy.b)})`;
}
